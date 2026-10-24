#!/usr/bin/env python3
"""Build a committed revision in isolation; optionally run disposable integration tests."""
import argparse
import fcntl
import signal
import sys
import json
import os
from pathlib import Path
import re
import secrets
import subprocess
import tempfile


def run(*args, capture=False, **kwargs):
    return subprocess.run([str(arg) for arg in args], check=True, text=True,
                          stdout=subprocess.PIPE if capture else None, **kwargs)


def pipeline(mode, repository, ref, prefix, manifest=None, cache_directory=None, builder=None, debian_mirror=None):
    # Serialize builds within this repository without creating a persistent lock file.
    gitdir = run('git', '-C', repository, 'rev-parse', '--path-format=absolute', '--git-common-dir', capture=True).stdout.strip()
    descriptor = os.open(gitdir, os.O_RDONLY)
    try:
        fcntl.flock(descriptor, fcntl.LOCK_EX | fcntl.LOCK_NB)
        return build(mode, repository, ref, prefix, manifest, cache_directory, builder, debian_mirror)
    finally:
        os.close(descriptor)


def build(mode, repository, ref, prefix, manifest=None, cache_directory=None, builder=None, debian_mirror=None):
    repository = Path(repository).resolve(strict=True)
    revision = run('git', '-C', repository, 'rev-parse', '--verify', '--end-of-options', f'{ref}^{{commit}}', capture=True).stdout.strip()
    if not re.fullmatch(r'[0-9a-f]{40,64}', revision):
        raise ValueError('Invalid commit revision')
    if not re.fullmatch(r'[a-z0-9][a-z0-9./:_-]*', prefix):
        raise ValueError('Invalid image prefix')
    if debian_mirror is not None and not re.fullmatch(r'https://[a-zA-Z0-9.-]+(?::[0-9]+)?', debian_mirror):
        raise ValueError('Debian mirror must be an HTTPS origin hosting /debian')
    if mode == 'release' and (manifest is None or Path(manifest).exists()):
        raise ValueError('Release requires a new --manifest output path')
    project = 'hmv-build-' + secrets.token_hex(8)
    temporary_images = [f'{prefix}/{role}:{project}' for role in ('app', 'migration', 'testrunner')]
    final_images = [f'{prefix}/{role}:git-{revision}' for role in ('app', 'migration')]
    if mode == 'release':
        for tag in final_images:
            found = subprocess.run(['docker', 'image', 'inspect', tag], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            if found.returncode == 0:
                raise ValueError(f'Release tag already exists: {tag}; use its existing manifest instead')
    published = []
    success = False
    manifest_created = False
    cleanup_failed = False
    with tempfile.TemporaryDirectory(prefix='hmv-build-') as directory:
        scratch = Path(directory)
        checkout = scratch / 'source'
        compose = None
        try:
            # No fetch/clone URL or credential storage. Git's configured SSH/helper can fetch refs beforehand.
            run('git', '-C', repository, 'worktree', 'add', '--detach', checkout, revision)
            if not (checkout / 'docker-compose-prod.yml').is_file():
                raise ValueError('Revision does not contain the production Compose definition')
            envfile = scratch / 'settings.env'
            template = checkout / ('.env-prod.example' if mode == 'release' else '.env-test.example')
            lines = []
            for line in template.read_text().splitlines():
                if '=' in line and not line.startswith('#'):
                    key, value = line.split('=', 1)
                    if any(part in key for part in ('PASSWORD', 'SECRET', 'TOKEN')):
                        line = key + '=' + secrets.token_hex(32)
                lines.append(line)
            envfile.write_text('\n'.join(lines) + '\n')
            envfile.chmod(0o600)
            # An empty subprocess environment prevents caller production credentials/URLs from overriding fixtures.
            environment = {key: value for key, value in os.environ.items()
                           if key in ('PATH', 'HOME', 'DOCKER_HOST', 'DOCKER_CONTEXT', 'DOCKER_CONFIG',
                                      'DOCKER_TLS_VERIFY', 'DOCKER_CERT_PATH', 'SSH_AUTH_SOCK', 'BUILDKIT_PROGRESS')}
            override = scratch / 'images.yml'
            services = {}
            for role, tag in zip(('app', 'migration'), temporary_images):
                services[role] = {'image': tag, 'build': {'labels': {'org.opencontainers.image.revision': revision}}}
            for role in ('background', 'scheduler'):
                services[role] = {'image': temporary_images[0]}
            if mode == 'test':
                services['testrunner'] = {'image': temporary_images[2]}
            if debian_mirror is not None:
                for role in ('app', 'migration', *(['testrunner'] if mode == 'test' else [])):
                    services[role].setdefault('build', {})['args'] = {'DEBIAN_MIRROR': debian_mirror}
            if cache_directory is not None:
                cache_root = Path(cache_directory).expanduser().resolve()
                if ',' in str(cache_root):
                    raise ValueError('Cache directory cannot contain a comma (BuildKit cache option separator)')
                cache_root.mkdir(parents=True, exist_ok=True)
                for role in ('app', 'migration', *(['testrunner'] if mode == 'test' else [])):
                    cache = cache_root / role
                    settings = services[role].setdefault('build', {})
                    settings['cache_to'] = [f'type=local,dest={cache},mode=max']
                    if (cache / 'index.json').is_file():
                        settings['cache_from'] = [f'type=local,src={cache}']
            # Ports are unneeded for isolated service-to-service tests. Compose !reset needs Compose >=2.24.4.
            override.write_text(json.dumps({'services': services}))
            if mode == 'test':
                ports = scratch / 'ports.yml'
                ports.write_text('services:\n  db:\n    ports: !reset []\n  app:\n    ports: !reset []\n')
            compose = ['docker', 'compose', '--project-name', project, '--project-directory', str(checkout),
                       '--env-file', str(envfile), '-f', str(checkout / ('docker-compose-prod.yml' if mode == 'release' else 'docker-compose-test.yml')),
                       '-f', str(override)]
            if mode == 'test':
                compose += ['-f', str(ports)]
            def dc(*args, capture=False):
                return run(*compose, *args, capture=capture, env=environment)
            dc('config', '--quiet')
            targets = ['app', 'migration', *(['testrunner'] if mode == 'test' else [])]
            if cache_directory is None:
                dc('build', *(['--builder', builder] if builder else []), *targets)
            else:
                # Compose has no flag for Bake's external-directory access. Generate its
                # build plan, then grant only the explicitly requested cache directory.
                plan = scratch / 'build.json'
                plan.write_text(dc('build', '--print', *targets, capture=True).stdout)
                run('docker', 'buildx', 'bake', '--file', plan, '--load',
                    '--allow', f'fs.read={cache_root}', '--allow', f'fs.write={cache_root}',
                    *(['--builder', builder] if builder else []), *targets,
                    env=environment, cwd=checkout)
            ids = []
            for tag in temporary_images[:2]:
                info = json.loads(run('docker', 'image', 'inspect', tag, capture=True).stdout)[0]
                if info['Config']['Labels'].get('org.opencontainers.image.revision') != revision:
                    raise ValueError('Built image revision mismatch')
                ids.append(info['Id'])
            if mode == 'release':
                for image_id, tag in zip(ids, final_images):
                    run('docker', 'image', 'tag', image_id, tag)
                    published.append(tag)
                    if run('docker', 'image', 'inspect', '--format', '{{.Id}}', tag, capture=True).stdout.strip() != image_id:
                        raise ValueError('Release image identity mismatch')
                record = {'revision': revision, 'app': final_images[0], 'background': final_images[0],
                          'scheduler': final_images[0], 'migration': final_images[1], 'image_ids': dict(zip(('app', 'migration'), ids))}
                # Exclusive create, never overwrite a manifest from a previous release.
                with Path(manifest).open('x') as stream:
                    manifest_created = True
                    json.dump(record, stream, indent=2)
                    stream.write('\n')
            else:
                dc('up', '-d', '--wait', 'db')
                dc('run', '--rm', '--no-deps', 'migration')
                dc('run', '--rm', '--no-deps', 'migration', 'npx', '--no-install', 'prisma', 'db', 'seed')
                dc('up', '-d', '--no-build', 'app', 'background')
                dc('run', '--rm', '--no-deps', 'testrunner', 'bash', './scripts/initTestData.sh')
                dc('run', '--rm', '--no-deps', 'testrunner', 'npm', 'test', '--', '--runInBand')
            success = True
        finally:
            if compose is not None:
                try:
                    run(*compose, 'down', '--volumes', '--remove-orphans', env=environment)
                except subprocess.CalledProcessError:
                    cleanup_failed = True
                    print(f'ERROR: cleanup failed for disposable project {project}', file=sys.stderr)
            if not success:
                if manifest_created:
                    Path(manifest).unlink()
                for tag in published:
                    subprocess.run(['docker', 'image', 'rm', tag], check=False)
            for tag in temporary_images:
                exists = subprocess.run(['docker', 'image', 'inspect', tag], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                if exists.returncode == 0:
                    if subprocess.run(['docker', 'image', 'rm', tag], check=False).returncode:
                        cleanup_failed = True
            if checkout.exists():
                if subprocess.run(['git', '-C', str(repository), 'worktree', 'remove', '--force', str(checkout)]).returncode:
                    cleanup_failed = True
        if cleanup_failed:
            raise RuntimeError('Task resource cleanup failed; see project name above')
    if mode == 'release':
        print(f'Release built: {revision}; manifest: {manifest}')
    else:
        print(f'Tests passed: {revision}')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('mode', choices=['release', 'test'])
    parser.add_argument('--ref', required=True, help='Locally available commit, tag or branch (committed content only)')
    parser.add_argument('--repository', type=Path, default=Path(__file__).resolve().parents[2])
    parser.add_argument('--image-prefix', default='urostora/home-media-viewer')
    parser.add_argument('--manifest', type=Path, help='New release manifest output file')
    parser.add_argument('--cache-directory', type=Path, help='Optional persistent local BuildKit layer cache (per image role)')
    parser.add_argument('--builder', help='Optional existing buildx builder supporting the selected cache backend')
    parser.add_argument('--debian-mirror', help='Optional HTTPS mirror origin hosting /debian')
    args = parser.parse_args()
    pipeline(args.mode, args.repository, args.ref, args.image_prefix, args.manifest,
             args.cache_directory, args.builder, args.debian_mirror)


if __name__ == '__main__':
    signal.signal(signal.SIGTERM, lambda *_: sys.exit(143))
    try:
        main()
    except (ValueError, RuntimeError, OSError, subprocess.CalledProcessError) as error:
        raise SystemExit(f'Pipeline failed: {error}')
