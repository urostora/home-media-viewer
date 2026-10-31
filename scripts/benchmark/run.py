#!/usr/bin/env python3
"""Run baseline measurements in a disposable, port-free Docker project."""
import argparse
import json
import os
from pathlib import Path
import secrets
import shutil
import subprocess
import tempfile
import time


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', required=True, type=Path)
    parser.add_argument('--repeats', type=int, default=3)
    parser.add_argument('--validate-stages', action='store_true', help='Run isolated migration/API/CLI/stage acceptance checks instead of benchmarks')
    args = parser.parse_args()
    if args.repeats < 1:
        parser.error('--repeats must be positive')
    output = args.output.resolve()
    output.mkdir(parents=True, exist_ok=False)
    root = Path(__file__).resolve().parents[2]
    project = 'hmv-baseline-' + secrets.token_hex(4)
    temporary = Path(tempfile.mkdtemp(prefix=project + '-'))
    (temporary / 'fixtures').mkdir()
    env_file = temporary / 'benchmark.env'
    values = {
        'BENCH_PROJECT': project, 'BENCH_DIRECTORY': str(temporary),
        **{key: secrets.token_hex(24) for key in [
            'BENCH_PASSWORD', 'BENCH_ROOT_PASSWORD', 'BENCH_SESSION', 'BENCH_TOKEN', 'BENCH_ADMIN_PASSWORD']},
    }
    env_file.write_text(''.join(f'{key}={value}\n' for key, value in values.items()))
    env_file.chmod(0o600)
    # Caller credentials and COMPOSE_* variables cannot redirect the isolated environment.
    environment = {key: value for key, value in os.environ.items()
                   if key in ['PATH', 'HOME', 'USER', 'TMPDIR', 'SSH_AUTH_SOCK'] or key.startswith('DOCKER_')}
    compose = ['docker', 'compose', '-p', project, '-f', str(root / 'scripts/benchmark/compose.yml'),
               '--env-file', str(env_file), *(['--profile', 'validation'] if args.validate_stages else [])]
    log = output / 'execution.log'

    def command(arguments, *, capture=False, timeout=1800):
        # Stream build/setup output to the artifact so long operations remain inspectable.
        with log.open('a') as handle:
            result = subprocess.run(arguments, cwd=root, env=environment, text=True,
                                    stdout=subprocess.PIPE if capture else handle,
                                    stderr=subprocess.STDOUT, timeout=timeout)
            if capture:
                handle.write(result.stdout)
        if result.returncode:
            raise RuntimeError(f'Command failed ({result.returncode}); see {log}')
        return result.stdout if capture else None

    def run(service, *arguments):
        return command(compose + ['run', '--rm', '--no-deps', '-T', service, *arguments], capture=True)

    def record_json(text):
        for line in reversed(text.splitlines()):
            if line.startswith('{'):
                return json.loads(line)
        raise RuntimeError('Missing JSON command result')

    results = []
    metadata = {'project': project, 'startedAtUtc': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
                'repeats': args.repeats, 'validationMode': args.validate_stages}
    try:
        metadata['revision'] = command(['git', 'rev-parse', 'HEAD'], capture=True).strip()
        print('Building isolated production app, migration and benchmark images', flush=True)
        command(compose + ['build', 'app', 'migration', 'worker'])
        metadata['images'] = {}
        for role in ['app', 'migration', 'worker']:
            metadata['images'][role] = json.loads(command([
                'docker', 'image', 'inspect', f'{project}-{role}:baseline',
                '--format', '{{json .Id}}'], capture=True))
        metadata['imageReferences'] = command(compose + ['config', '--images'], capture=True).splitlines()
        metadata['tools'] = record_json(run('worker', 'node', '-e', """
          const cp = require('node:child_process'), os = require('node:os');
          const version = tool => cp.execFileSync(tool, ['-version'], {encoding:'utf8'}).split('\\n')[0];
          console.log(JSON.stringify({node:process.version, ffmpeg:version('ffmpeg'), ffprobe:version('ffprobe'),
            kernel:os.release(), platform:os.platform(), architecture:os.arch(),
            visibleCpuCount:os.cpus().length, cpuModel:os.cpus()[0]?.model,
            visibleMemoryBytes:os.totalmem(), hostLoadAverage:os.loadavg()}));
        """))
        (output / 'environment.json').write_text(json.dumps(metadata, indent=2) + '\n')
        print('Starting fresh database, applying migrations and seeding administrator', flush=True)
        command(compose + ['up', '-d', '--wait', 'db'])
        if args.validate_stages:
            # Populate a historical row before applying either additive processing migration.
            run('migration', 'node', '-e', """
              const fs=require('node:fs'), cp=require('node:child_process');
              for (const name of fs.readdirSync('prisma/migrations')) {
                if (name >= '20261028190000_' && fs.statSync('prisma/migrations/' + name).isDirectory())
                  fs.rmSync('prisma/migrations/' + name, {recursive:true});
              }
              const applied=cp.spawnSync('npx',['--no-install','prisma','migrate','deploy'],{stdio:'inherit'});
              if(applied.status!==0) process.exit(applied.status || 1);
              const {PrismaClient}=require('@prisma/client'); const p=new PrismaClient();
              (async()=>{
                await p.$executeRawUnsafe("INSERT INTO File (id,path,name,extension,metadataStatus,thumbnailStatus,metadataProcessedAt,thumbnailProcessedAt) VALUES ('i3-legacy-file','legacy.jpg','legacy','jpg','Processed','Processed','2001-01-01','2001-01-02')");
                await p.$executeRawUnsafe("INSERT INTO FileMeta (id,fileId,metaKey,type,stringValue) VALUES ('i3-legacy-meta','i3-legacy-file','legacy-key','String','keep historical value')");
              })().catch(error=>{console.error('Legacy seed failed',error.code);process.exitCode=1}).finally(()=>p.$disconnect());
            """)
            # Also exercise an upgrade from an already deployed discovery queue.
            run('migration', 'node', '-e', """
              const fs=require('node:fs'), cp=require('node:child_process');
              for (const name of fs.readdirSync('prisma/migrations')) {
                if (name >= '20261031100000_' && fs.statSync('prisma/migrations/' + name).isDirectory())
                  fs.rmSync('prisma/migrations/' + name, {recursive:true});
              }
              const applied=cp.spawnSync('npx',['--no-install','prisma','migrate','deploy'],{stdio:'inherit'});
              if(applied.status!==0) process.exit(applied.status || 1);
              const {PrismaClient}=require('@prisma/client'); const p=new PrismaClient();
              p.$executeRawUnsafe("INSERT INTO DiscoveryDirectory (id,path,entryCursor,cleanupCursor,lastServedAt) VALUES ('i4-existing-task','/unselected-historical-discovery','keep-entry','keep-id','2001-01-01')")
                .catch(error=>{console.error('Discovery seed failed',error.code);process.exitCode=1}).finally(()=>p.$disconnect());
            """)
        run('migration')
        run('migration', 'npx', '--no-install', 'prisma', 'db', 'seed')
        fixtures = record_json(run('fixtures'))
        (output / 'fixtures.json').write_text(json.dumps(fixtures, indent=2) + '\n')
        command(compose + ['up', '-d', '--no-build', 'app', *(['background'] if args.validate_stages else [])])
        for service in ['app', *(['background'] if args.validate_stages else [])]:
            command(compose + ['exec', '-T', service, 'node', '-e', """
          (async () => {
            for (let i = 0; i < 90; i++) {
              try { const r = await fetch('http://127.0.0.1:3000/api/health/ready');
                if (r.ok) return; } catch {}
              await new Promise(r => setTimeout(r, 1000));
            }
            process.exitCode = 1;
          })();
            """])

        if args.validate_stages:
            print('Running migration, independent-stage, failure, locking, API and CLI acceptance checks', flush=True)
            accepted = record_json(run('worker', 'node', '/tests/processing-stages.cjs'))
            (output / 'acceptance.json').write_text(json.dumps(accepted, indent=2) + '\n')
            discovery = record_json(run('worker', 'node', '/tests/discovery.cjs'))
            (output / 'discovery.json').write_text(json.dumps(discovery, indent=2) + '\n')
            queue = record_json(run('worker', 'node', '--expose-gc', '/tests/media-queue.cjs'))
            (output / 'media-queue.json').write_text(json.dumps(queue, indent=2) + '\n')
            metadata['completed'] = True
            return

        def measure(scenario, mode, iteration):
            print(f'{scenario}: run {iteration + 1}/{args.repeats}', flush=True)
            record = record_json(run('worker', 'node', '/benchmark/benchmark.cjs', mode))
            record.update(scenario=scenario, iteration=iteration + 1)
            results.append(record)
            (output / 'results.json').write_text(json.dumps(results, indent=2) + '\n')

        for iteration in range(args.repeats):
            run('worker', 'node', '/benchmark/benchmark.cjs', 'prepare')
            measure('initial-full', 'full', iteration)
            measure('unchanged-full', 'full', iteration)
            run('fixtures', 'node', '/benchmark/fixtures.cjs', 'size-change')
            measure('size-change-full', 'full', iteration)
            run('fixtures', 'node', '/benchmark/fixtures.cjs', 'same-size-change')
            measure('same-size-change-full', 'full', iteration)
        for iteration in range(args.repeats):
            run('worker', 'node', '/benchmark/benchmark.cjs', 'prepare')
            measure('initial-discovery', 'discovery', iteration)
            measure('unchanged-discovery', 'discovery', iteration)
        metadata['completed'] = True
    except BaseException:
        # Preserve task-service diagnostics before removing the isolated environment.
        command(compose + ['logs', '--no-color', '--tail', '200', 'app', 'background'])
        raise
    finally:
        print('Recording results and removing task-owned Docker resources', flush=True)
        (output / 'environment.json').write_text(json.dumps(metadata, indent=2) + '\n')
        # Exact project/config/env only; never prune or affect development resources.
        command(compose + ['down', '--volumes', '--remove-orphans'])
        for role in ['app', 'migration', 'worker']:
            tag = f'{project}-{role}:baseline'
            exists = subprocess.run(['docker', 'image', 'inspect', tag], env=environment,
                                    stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            if exists.returncode == 0:
                command(['docker', 'image', 'rm', tag])
        # Docker wrote root-owned fixture files: use its task image's shared Node base to remove them.
        # The container has only this task's temporary directory mounted writable.
        command(['docker', 'run', '--rm', '--network', 'none', '-v', f'{temporary}:/cleanup',
                 'node:26.12.1-trixie@sha256:a98e6fda54fdbb22d4238054cca9a2a113bcd1191c09193a535aae22f400aa8e',
                 'node', '-e', "require('node:fs').rmSync('/cleanup/fixtures', {recursive:true, force:true})"])
        shutil.rmtree(temporary)
        metadata['cleanupComplete'] = True
        (output / 'environment.json').write_text(json.dumps(metadata, indent=2) + '\n')


if __name__ == '__main__':
    main()
