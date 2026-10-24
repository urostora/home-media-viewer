"""Release orchestration checks; Docker/Git commands are recorded without touching shared state."""
import importlib.util
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('pipeline', Path(__file__).resolve().parents[2] / 'scripts/build/pipeline.py')
pipeline = importlib.util.module_from_spec(spec)
spec.loader.exec_module(pipeline)
REVISION = 'a' * 40


class ReleaseTests(unittest.TestCase):
    def scenario(self, mode='release', fail=None, existing=False, cache_directory=None, builder=None, debian_mirror=None):
        calls = []
        images = {}
        repo = Path(self.directory)
        manifest = repo / 'release.json'
        def command(args, **kwargs):
            args = [str(arg) for arg in args]
            calls.append((args, kwargs))
            if args[:3] == ['git', '-C', str(repo)] and 'rev-parse' in args:
                return subprocess.CompletedProcess(args, 0, REVISION + '\n')
            if 'worktree' in args and 'add' in args:
                source = Path(args[-2])
                source.mkdir()
                (source / 'docker-compose-prod.yml').touch()
                (source / '.env-prod.example').write_text('MARIADB_PASSWORD=\n')
                (source / '.env-test.example').write_text('MARIADB_PASSWORD=\n')
            if args[:2] == ['docker', 'compose']:
                if 'build' in args:
                    override = Path(args[args.index('-f') + 3])
                    services = json.loads(override.read_text())['services']
                    self.build_services = services
                    for role in ('app', 'migration', 'testrunner'):
                        if role in services:
                            images[services[role]['image']] = 'sha256:' + role
            if fail and fail(args):
                raise subprocess.CalledProcessError(1, args)
            if args[:3] == ['docker', 'image', 'inspect']:
                tag = args[-1]
                if tag not in images:
                    if existing:
                        return subprocess.CompletedProcess(args, 0, '')
                    return subprocess.CompletedProcess(args, 1, '')
                value = images[tag]
                output = value + '\n' if '--format' in args else json.dumps([{
                    'Id': value, 'Config': {'Labels': {'org.opencontainers.image.revision': REVISION}}
                }])
                return subprocess.CompletedProcess(args, 0, output)
            if args[:3] == ['docker', 'image', 'tag']:
                images[args[-1]] = args[-2]
            if args[:3] == ['docker', 'image', 'rm']:
                images.pop(args[-1], None)
            return subprocess.CompletedProcess(args, 0, '')
        with patch.object(pipeline.subprocess, 'run', side_effect=command):
            try:
                pipeline.build(mode, repo, 'HEAD', 'example/hmv', manifest, cache_directory, builder, debian_mirror)
            except (ValueError, subprocess.CalledProcessError):
                if not (fail or existing):
                    raise
        return calls, images, manifest

    def setUp(self):
        self.scratch = tempfile.TemporaryDirectory()
        self.directory = self.scratch.name

    def tearDown(self):
        self.scratch.cleanup()

    def test_release_without_preexisting_images_uses_built_ids(self):
        calls, images, manifest = self.scenario()
        record = json.loads(manifest.read_text())
        self.assertEqual(record['app'], record['background'])
        self.assertEqual(record['app'], record['scheduler'])
        self.assertEqual(images[record['app']], 'sha256:app')
        self.assertEqual(images[record['migration']], 'sha256:migration')
        self.assertEqual(len(images), 2)
        builds = [args for args, _ in calls if args[:2] == ['docker', 'compose'] and 'build' in args]
        self.assertEqual(builds[0][-3:], ['build', 'app', 'migration'])
        self.assertIn('docker-compose-prod.yml', ' '.join(builds[0]))
        self.assertFalse(any('up' in args for args, _ in calls))

    def test_build_failure_never_tags_or_deploys(self):
        calls, images, manifest = self.scenario(fail=lambda args: 'build' in args)
        self.assertFalse(images)
        self.assertFalse(manifest.exists())
        self.assertFalse(any(args[:3] == ['docker', 'image', 'tag'] or 'up' in args for args, _ in calls))
        self.assertTrue(any('down' in args and '--volumes' in args for args, _ in calls))

    def test_tag_failure_rolls_back_published_tags(self):
        calls, images, manifest = self.scenario(fail=lambda args: args[:3] == ['docker', 'image', 'tag'] and '/migration:git-' in args[-1])
        self.assertFalse(images)
        self.assertFalse(manifest.exists())

    def test_seed_failure_does_not_start_consumers(self):
        calls, images, _ = self.scenario('test', fail=lambda args: args[-1] == 'seed')
        self.assertFalse(images)
        self.assertFalse(any('up' in args and 'background' in args for args, _ in calls))

    def test_existing_release_tag_is_rejected_before_build(self):
        calls, _, manifest = self.scenario(existing=True)
        self.assertFalse(manifest.exists())
        self.assertFalse(any('build' in args for args, _ in calls))

    def test_test_setup_failure_stops_consumers_and_suite_and_cleans(self):
        calls, images, _ = self.scenario('test', fail=lambda args: args[-1] == 'migration' and 'run' in args)
        self.assertFalse(images)
        self.assertFalse(any('test' in args or 'seed' in args or 'background' == args[-1] for args, _ in calls))
        self.assertTrue(any('down' in args and '--volumes' in args for args, _ in calls))

    def test_test_order_and_environment_isolation(self):
        with patch.dict(pipeline.os.environ, {'DATABASE_URL': 'production', 'COMPOSE_FILE': 'production', 'MARIADB_PASSWORD': 'production'}):
            calls, images, _ = self.scenario('test')
        compose = [(args, kwargs) for args, kwargs in calls if args[:2] == ['docker', 'compose']]
        sequence = [' '.join(args) for args, _ in compose]
        migration = next(i for i, value in enumerate(sequence) if 'run --rm --no-deps migration' in value)
        seed = next(i for i, value in enumerate(sequence) if 'prisma db seed' in value)
        consumers = next(i for i, value in enumerate(sequence) if 'up -d --no-build app background' in value)
        fixture = next(i for i, value in enumerate(sequence) if 'initTestData.sh' in value)
        tests = next(i for i, value in enumerate(sequence) if 'npm test' in value)
        self.assertLess(migration, seed)
        self.assertLess(seed, consumers)
        self.assertLess(consumers, fixture)
        self.assertLess(fixture, tests)
        self.assertFalse(images)
        for _, kwargs in compose:
            self.assertNotIn('DATABASE_URL', kwargs['env'])
            self.assertNotIn('COMPOSE_FILE', kwargs['env'])
        self.assertFalse(any('reset' in value for value in sequence))

    def test_fixture_failure_prevents_successful_suite(self):
        calls, images, _ = self.scenario('test', fail=lambda args: args[-1].endswith('initTestData.sh'))
        self.assertFalse(images)
        self.assertFalse(any('test' in args for args, _ in calls))

    def test_optional_cache_exports_and_imports_are_scoped_by_role(self):
        cache = Path(self.directory) / 'cache'
        (cache / 'app').mkdir(parents=True)
        (cache / 'app/index.json').write_text('{}')
        calls, _, _ = self.scenario(cache_directory=cache, builder='isolated-builder')
        app = self.build_services['app']['build']
        migration = self.build_services['migration']['build']
        self.assertEqual(app['cache_from'], [f'type=local,src={cache}/app'])
        self.assertEqual(app['cache_to'], [f'type=local,dest={cache}/app,mode=max'])
        self.assertNotIn('cache_from', migration)
        self.assertEqual(migration['cache_to'], [f'type=local,dest={cache}/migration,mode=max'])
        bake = next(args for args, _ in calls if args[:3] == ['docker', 'buildx', 'bake'])
        self.assertEqual(bake[-4:], ['--builder', 'isolated-builder', 'app', 'migration'])
        self.assertIn(f'fs.read={cache}', bake)
        self.assertIn(f'fs.write={cache}', bake)
        self.assertIn('--load', bake)
        self.assertTrue((cache / 'app/index.json').exists())

    def test_default_build_does_not_require_external_cache(self):
        self.scenario()
        for role in ('app', 'migration'):
            self.assertNotIn('cache_to', self.build_services[role]['build'])
            self.assertNotIn('cache_from', self.build_services[role]['build'])

    def test_explicit_https_mirror_is_used_only_for_builds(self):
        self.scenario('test', debian_mirror='https://mirror.example.test')
        for role in ('app', 'migration', 'testrunner'):
            self.assertEqual(self.build_services[role]['build']['args'], {'DEBIAN_MIRROR': 'https://mirror.example.test'})
        self.assertNotIn('build', self.build_services['background'])
        self.assertNotIn('build', self.build_services['scheduler'])


if __name__ == '__main__':
    unittest.main()
