#!/usr/bin/env python3
"""Measure working-tree delivery routes in a fresh, port-free Docker project."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import secrets
import shutil
import subprocess
import tempfile


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--image', required=True, help='Existing Node/FFmpeg image, pinned to its local image ID')
    parser.add_argument('--output', required=True, type=Path)
    parser.add_argument('--verify', action='store_true', help='Assert fixed range behavior and run HTTP cancellation regressions')
    parser.add_argument('--auth-suite', choices=['session', 'authorization'], help='Run a retained auth regression suite in a fresh guarded database')
    parser.add_argument('--browser-image', help='Existing Chromium test image; also build and exercise the production UI')
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[2]
    output = args.output.resolve()
    output.mkdir(parents=True, exist_ok=False)
    project = 'hmv-delivery-' + secrets.token_hex(4)
    temporary = Path(tempfile.mkdtemp(prefix=project + '-'))
    for name in ['fixtures', 'storage']:
        (temporary / name).mkdir(mode=0o777)
        (temporary / name).chmod(0o777)
    environment = {k: v for k, v in os.environ.items()
                   if k in ['PATH', 'HOME', 'USER', 'TMPDIR'] or k.startswith('DOCKER_')}

    def command(argv, timeout=300):
        result = subprocess.run(argv, cwd=root, env=environment, text=True,
                                stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=timeout)
        # Tools may include connection strings in errors: keep logs private and disposable.
        with (temporary / 'execution.log').open('a') as handle:
            handle.write(result.stdout + result.stderr)
        if result.returncode:
            safe = result.stdout + result.stderr
            for secret in locals_values.values():
                safe = safe.replace(secret, '[redacted]')
            (output / 'failure.log').write_text(safe)
            raise RuntimeError(f'Command failed ({result.returncode}); redacted diagnostics: {output}/failure.log')
        return result.stdout

    metadata = {'project': project, 'cleanupComplete': False, 'completed': False,
                'limits': {'runnerCpus': 1, 'runnerMemory': '1g', 'dbCpus': 1, 'dbMemory': '1g'},
                'limitations': ['Real Next Pages apiResolver routes, not a full standalone Next server or browser',
                                'Existing read-only installed dependencies/client; no dependency rebuild',
                                'Warm local filesystem; no cold cache or network storage claim',
                                'No numerical production performance target']}
    compose = None
    locals_values = {}
    try:
        image = command(['docker', 'image', 'inspect', args.image, '--format', '{{.Id}}']).strip()
        metadata['runnerImage'] = image
        metadata['revision'] = command(['git', 'rev-parse', 'HEAD']).strip()
        metadata['sourceDiffSha256'] = hashlib.sha256(
            command(['git', 'diff', 'HEAD']).encode()).hexdigest()
        metadata['sourceHashes'] = {
            str(source.relative_to(root)): hashlib.sha256(source.read_bytes()).hexdigest()
            for source in [Path(__file__).resolve(), root / 'scripts/benchmark/delivery-compose.yml',
                           root / 'docker/test/content-delivery.cjs',
                           root / 'home-media-viewer/src/utils/responseHelper.ts',
                           root / 'home-media-viewer/src/utils/auth/serverSession.ts',
                           root / 'home-media-viewer/src/components/content/contentDisplay.tsx',
                           root / 'docker/test/server-session-lifecycle.cjs',
                           root / 'docker/test/content-delivery-browser-server.cjs',
                           root / 'docker/test/content-delivery-full.cjs',
                           root / 'home-media-viewer/package-lock.json',
                           root / 'home-media-viewer/src/pages/api/file/content/[id].ts',
                           root / 'home-media-viewer/src/pages/api/file/thumbnail/[...params].ts']}
        env_file = temporary / 'delivery.env'
        values = {'DELIVERY_IMAGE': image, 'DELIVERY_DIRECTORY': str(temporary),
                  'DELIVERY_VERIFY': 'true' if args.verify else 'false',
                  'DELIVERY_BROWSER_CHECK': 'true' if args.browser_image else 'false',
                  'DELIVERY_DATABASE': 'hmv_auth_t6_fixture' if args.auth_suite else 'delivery_fixture',
                  **{key: secrets.token_hex(32) for key in
                     ['DELIVERY_PASSWORD', 'DELIVERY_ROOT_PASSWORD', 'DELIVERY_SESSION']}}
        if args.browser_image:
            values['DELIVERY_BROWSER_IMAGE'] = command(['docker', 'image', 'inspect', args.browser_image, '--format', '{{.Id}}']).strip()
            metadata['browserImage'] = values['DELIVERY_BROWSER_IMAGE']
            metadata['fullcheckLimits'] = {'cpus': 2, 'memory': '3g', 'browserMemory': '1g'}
            metadata['limitations'][0] = 'Matrix uses apiResolver; separate browser.json validates a copied production Next server and native Chromium'
        locals_values = {key: value for key, value in values.items() if key.endswith('PASSWORD') or key.endswith('SESSION')}
        env_file.write_text(''.join(f'{k}={v}\n' for k, v in values.items()))
        env_file.chmod(0o600)
        compose = ['docker', 'compose', '-p', project, '-f', str(root / 'scripts/benchmark/delivery-compose.yml'),
                   '--env-file', str(env_file)]

        def run(service, *argv):
            return command(compose + ['run', '--rm', '--no-deps', '-T', service, *argv])

        print('Starting isolated database and applying migrations', flush=True)
        command(compose + ['up', '-d', '--wait', 'db'])
        metadata['databaseImage'] = command(compose + ['images', '-q', 'db']).strip()
        run('runner', 'npx', '--no-install', 'prisma', 'migrate', 'deploy')
        if args.auth_suite:
            script = 'server-session-lifecycle.cjs' if args.auth_suite == 'session' else 'current-user-authorization.cjs'
            print(f'Running retained {args.auth_suite} checks against task-only fixtures', flush=True)
            result = run('authcheck', 'node', '/tests/' + script)
            summary = next(line for line in reversed(result.splitlines()) if 'checks' in line)
            (output / 'results.json').write_text(json.dumps({'suite': args.auth_suite, 'summary': summary, 'passed': True}, indent=2) + '\n')
            metadata['completed'] = True
            return
        print('Creating synthetic administrator/media, then measuring read-only HTTP delivery', flush=True)
        run('fixtures')
        result = run('runner')
        record = next(json.loads(line) for line in reversed(result.splitlines()) if line.startswith('{'))
        (output / 'results.json').write_text(json.dumps(record, indent=2) + '\n')
        if args.browser_image:
            print('Building isolated production copy and exercising real Chromium playback/UI', flush=True)
            command(compose + ['up', '-d', '--no-deps', 'browser'])
            raw = command(compose + ['run', '--rm', '--no-deps', '--use-aliases', '-T', 'fullcheck'], timeout=900)
            full = next(json.loads(line) for line in reversed(raw.splitlines()) if line.startswith('{'))
            (output / 'browser.json').write_text(json.dumps(full, indent=2) + '\n')
        metadata['completed'] = True
    finally:
        (output / 'environment.json').write_text(json.dumps(metadata, indent=2) + '\n')
        if compose:
            print('Removing isolated database, network, and fixture resources', flush=True)
            command(compose + ['down', '--volumes', '--remove-orphans'])
            # Container-generated files can be root-owned. Mount only this task's private directory.
            command(['docker', 'run', '--rm', '--network', 'none', '--entrypoint', 'node',
                     '-v', f'{temporary}:/cleanup', metadata['runnerImage'], '-e',
                     "for(const n of ['fixtures','storage'])require('node:fs').rmSync('/cleanup/'+n,{recursive:true,force:true})"])
        shutil.rmtree(temporary)
        metadata['cleanupComplete'] = True
        (output / 'environment.json').write_text(json.dumps(metadata, indent=2) + '\n')


if __name__ == '__main__':
    main()
