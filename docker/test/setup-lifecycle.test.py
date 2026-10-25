"""Live Compose isolation/recovery check. Host Python orchestrates Docker; no shared data is used."""
import json
import os
from pathlib import Path
import secrets
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[2]
NODE = 'node:26.12.1-trixie@sha256:a98e6fda54fdbb22d4238054cca9a2a113bcd1191c09193a535aae22f400aa8e'
# Discard caller deployment settings; Compose interpolation uses only generated test settings.
ENV = {key: value for key, value in os.environ.items() if key in (
    'PATH', 'HOME', 'DOCKER_HOST', 'DOCKER_CONTEXT', 'DOCKER_CONFIG',
    'DOCKER_TLS_VERIFY', 'DOCKER_CERT_PATH', 'SSH_AUTH_SOCK')}
ENV['PYTHONDONTWRITEBYTECODE'] = '1'


def run(*args, **kwargs):
    return subprocess.run([str(arg) for arg in args], check=True, text=True, env=ENV, **kwargs)


def capture(*args):
    return run(*args, stdout=subprocess.PIPE).stdout.strip()


def main():
    with tempfile.TemporaryDirectory(prefix='hmv-task9-') as directory:
        scratch = Path(directory)
        settings = scratch / 'settings.env'
        run('python3', ROOT / 'scripts/security/create-env.py', ROOT / '.env-prod.example', settings)
        with settings.open('a') as stream:
            stream.write('\nSHADOW_DATABASE_URL=mysql://unused@db/home_media_shadow\nIS_BACKGROUND_PROCESS_ENABLED=0\n')
        configs = {}
        for filename in ('docker-compose.yml', 'docker-compose-test.yml', 'docker-compose-prod.yml'):
            args = ['docker', 'compose', '--project-directory', ROOT, '-f', ROOT / filename,
                    '--env-file', settings]
            config = json.loads(capture(*args, '--profile', '*', 'config', '--format', 'json'))
            assert all('container_name' not in service for service in config['services'].values())
            assert 'MARIADB_AUTO_UPGRADE' not in config['services']['db']['environment']
            configs[filename] = config
        dev = configs['docker-compose.yml']['services']
        assert dev['dependencies']['profiles'] == ['tools']
        assert dev['testrunner']['profiles'] == ['test']
        assert 'profiles' not in dev['migration']  # Preserve app startup gating.
        upgrade = json.loads(capture('docker', 'compose', '--project-directory', ROOT,
            '-f', ROOT / 'docker-compose-prod.yml', '-f', ROOT / 'docker-compose-db-upgrade.yml',
            '--env-file', settings, 'config', '--format', 'json'))['services']['db']
        assert upgrade['environment']['MARIADB_AUTO_UPGRADE'] == '1'
        assert upgrade['restart'] == 'no'
        for filename in ('docker/dev/app/Dockerfile', 'docker/dev/testrunner/Dockerfile', 'docker/prod/app/Dockerfile'):
            assert not any(line.startswith('VOLUME ') for line in (ROOT / filename).read_text().splitlines())

        config = configs['docker-compose-prod.yml']
        config.pop('name', None)
        # Resolved config embeds project-prefixed names: discard them before changing project.
        for section in ('volumes', 'networks'):
            for resource in config.get(section, {}).values():
                resource.pop('name', None)
        config['services'] = {name: config['services'][name] for name in ('db', 'app')}
        app = config['services']['app']
        for key in ('build', 'depends_on', 'healthcheck', 'ports'):
            app.pop(key, None)
        app['image'] = NODE
        app['command'] = ['sleep', 'infinity']
        app['restart'] = 'no'
        config['services']['db']['restart'] = 'no'
        projects = []
        try:
            for suffix in ('source', 'restore'):
                project = 'hmv-task9-' + secrets.token_hex(4) + '-' + suffix
                media = scratch / suffix
                media.mkdir()
                app['volumes'] = [
                    {'type': 'volume', 'source': 'home-media-storage', 'target': '/mnt/storage'},
                    {'type': 'bind', 'source': str(media), 'target': '/mnt/albums', 'read_only': True}]
                composefile = scratch / (suffix + '.json')
                for section in ('volumes', 'networks'):
                    for key, resource in config.get(section, {}).items():
                        resource['name'] = project + '_' + key
                        assert not capture('docker', section[:-1], 'ls', '-q', '--filter', 'name=^' + resource['name'] + '$'), 'Resource already exists'
                composefile.write_text(json.dumps(config))
                composefile.chmod(0o600)
                compose = ['docker', 'compose', '-f', composefile, '--env-file', settings, '-p', project]
                projects.append((project, compose, composefile, media))
                run(*compose, 'up', '-d', '--wait', '--wait-timeout', '120', 'db')
                run(*compose, 'up', '--no-start', '--no-deps', '--no-build', 'app')
            source, restored = projects
            assert source[0] != restored[0]
            ids = [capture(*entry[1], 'ps', '-q', 'db') for entry in projects]
            assert len(set(ids)) == 2
            for entry, cid in zip(projects, ids):
                info = json.loads(capture('docker', 'inspect', cid))[0]
                assert info['Config']['Labels']['com.docker.compose.project'] == entry[0]
                assert not any(value.startswith('MARIADB_AUTO_UPGRADE=') for value in info['Config']['Env'])
                assert not info['HostConfig']['PortBindings']
            sql = ['sh', '-ec', 'exec mariadb -uroot -p"$MARIADB_ROOT_PASSWORD" "$MARIADB_DATABASE" "$@"', '--']
            run(*source[1], 'exec', '-T', 'db', *sql,
                input="CREATE TABLE lifecycle_probe (id INT PRIMARY KEY, value VARCHAR(32)); INSERT INTO lifecycle_probe VALUES (9, 'preserved');")
            (source[3] / 'media.txt').write_text('source-media-preserved\n')
            run(*source[1], 'run', '--rm', '--no-deps', 'app', 'sh', '-ec',
                'mkdir -p /mnt/storage/thumbnail; printf generated-preserved > /mnt/storage/thumbnail/probe')
            backup = ['python3', ROOT / 'scripts/backup/backup.py', '--env-file', settings,
                      '--destination', scratch / 'backups']
            run(*backup, '--compose-file', source[2], '--project', source[0])
            sets = list((scratch / 'backups').glob('hmv-*-all-*'))
            assert len(sets) == 1
            run(*backup, '--compose-file', restored[2], '--project', restored[0], '--restore', sets[0])
            assert (restored[3] / 'media.txt').read_text() == 'source-media-preserved\n'
            assert capture(*restored[1], 'exec', '-T', 'db', *sql,
                '-N', '-e', 'SELECT value FROM lifecycle_probe WHERE id=9') == 'preserved'
            assert capture(*restored[1], 'run', '--rm', '--no-deps', 'app',
                'cat', '/mnt/storage/thumbnail/probe') == 'generated-preserved'
            run(*restored[1], 'stop', 'db')
            run(*restored[1], 'up', '-d', '--wait', '--wait-timeout', '120', 'db')
            assert capture(*restored[1], 'exec', '-T', 'db', *sql,
                '-N', '-e', 'SELECT value FROM lifecycle_probe WHERE id=9') == 'preserved'
            print('PASS: all Compose configs, maintenance opt-in, profiles, concurrent projects, complete backup/empty-target restore and same-volume DB restart', flush=True)
        finally:
            # Verify ownership and ensure no volume is attached to a different project before removal.
            for project, compose, _, _ in reversed(projects):
                # Check every declared volume, including ones whose labels might be foreign.
                for volume in (project + '_' + key for key in config['volumes']):
                    existing = capture('docker', 'volume', 'ls', '-q', '--filter', 'name=^' + volume + '$')
                    if not existing:
                        continue
                    owner = capture('docker', 'volume', 'inspect', '--format', '{{index .Labels "com.docker.compose.project"}}', volume)
                    assert owner == project, 'Refusing foreign-volume cleanup'
                    users = capture('docker', 'ps', '-a', '-q', '--filter', 'volume=' + volume).splitlines()
                    for cid in users:
                        label = capture('docker', 'inspect', '--format', '{{index .Config.Labels "com.docker.compose.project"}}', cid)
                        assert label == project, 'Refusing shared-volume cleanup'
                run(*compose, 'down', '--volumes', '--remove-orphans')
            # The restore helper preserves root ownership; remove its task-only output through Docker.
            run('docker', 'run', '--rm', '--network', 'none', '-v', str(scratch) + ':/task', NODE,
                'sh', '-ec', 'rm -rf /task/source /task/restore /task/backups')


if __name__ == '__main__':
    main()
