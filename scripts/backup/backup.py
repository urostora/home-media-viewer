#!/usr/bin/env python3
"""Compose-scoped logical backups. Requires Python 3, Docker Compose and flock support."""
import argparse
import datetime
import fcntl
import hashlib
import gzip
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tarfile
import tempfile


def run(args, **kwargs):
    return subprocess.run(args, check=True, **kwargs)


def capture(args):
    return run(args, stdout=subprocess.PIPE).stdout.decode().strip()


def digest(path):
    h = hashlib.sha256()
    with path.open('rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            h.update(block)
    return h.hexdigest()


def verify(folder):
    manifest = json.loads((folder / 'manifest.json').read_text())
    if manifest.get('format') != 1 or not manifest.get('files'):
        raise ValueError('Unsupported or empty backup manifest')
    for name, expected in manifest['files'].items():
        if name not in ('database.sql', 'storage.tar.gz', 'media.tar.gz'):
            raise ValueError('Unexpected backup file')
        path = folder / name
        if path.is_symlink() or digest(path) != expected:
            raise ValueError('Checksum mismatch: ' + name)
        if name.endswith('.tar.gz'):
            with gzip.open(path, 'rb') as compressed:
                while compressed.read(1024 * 1024):
                    pass
            with tarfile.open(path, 'r:gz') as archive:
                for member in archive:
                    if member.name.startswith('/') or '..' in Path(member.name).parts:
                        raise ValueError('Unsafe archive path')
                    if member.issym() or member.islnk() or member.isdev() or member.isfifo():
                        raise ValueError('Links and special files are not supported in recovery archives')
                    if member.isfile():
                        stream = archive.extractfile(member)
                        while stream.read(1024 * 1024):
                            pass
    return manifest


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--compose-file', required=True, type=Path)
    parser.add_argument('--env-file', required=True, type=Path)
    parser.add_argument('--project', required=True)
    parser.add_argument('--destination', required=True, type=Path)
    parser.add_argument('--scope', choices=('all', 'db', 'files'), default='all')
    parser.add_argument('--keep', type=int, default=7)
    parser.add_argument('--restore', type=Path, help='Restore a verified backup into empty target mounts/database')
    args = parser.parse_args()
    if not re.fullmatch(r'[a-z0-9][a-z0-9_-]*', args.project):
        parser.error('Invalid Compose project name')
    if args.keep < 1:
        parser.error('--keep must be at least 1')
    os.umask(0o077)
    destination = args.destination.resolve()
    destination.mkdir(parents=True, exist_ok=True)
    # Keep this inode: removing a lock file would allow two independent locks.
    with (destination / '.backup.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        compose = ['docker', 'compose', '-f', str(args.compose_file.resolve()),
                   '--env-file', str(args.env_file.resolve()), '-p', args.project]
        services = capture(compose + ['config', '--services']).splitlines()
        containers = {}
        for service in ('db', 'app', 'background', 'scheduler'):
            if service not in services:
                continue
            ids = capture(compose + ['ps', '--all', '--quiet', service]).splitlines()
            if len(ids) > 1:
                raise ValueError('Replicated services require a separate backup procedure')
            if ids:
                containers[service] = json.loads(capture(['docker', 'inspect', ids[0]]))[0]
        for service in ('app', 'background', 'scheduler'):
            if service in containers and containers[service]['State']['Running']:
                raise ValueError('Stop app, background and scheduler before backup/restore')
        db = containers.get('db')
        app = containers.get('app')
        need_db = args.scope in ('all', 'db') or args.restore
        need_files = args.scope in ('all', 'files') or args.restore
        if need_db and (not db or not db['State']['Running']):
            raise ValueError('Selected Compose db must be running')
        mounts = {}
        if need_files:
            if not app:
                raise ValueError('Create the selected app container first (it must be stopped)')
            env = dict(item.split('=', 1) for item in app['Config']['Env'])
            media_path = env.get('APP_ALBUM_ROOT_PATH')
            for key, target in [('storage', '/mnt/storage'), ('media', media_path)]:
                matches = [m for m in app['Mounts'] if m['Destination'] == target]
                if len(matches) != 1 or matches[0]['Type'] not in ('volume', 'bind'):
                    raise ValueError('Expected explicit mount at ' + str(target))
                mount = matches[0]
                source = mount.get('Name') if mount['Type'] == 'volume' else mount['Source']
                if ',' in source or (mount['Type'] == 'bind' and destination.is_relative_to(Path(source).resolve())):
                    raise ValueError('Backup destination must be outside source trees; mount commas unsupported')
                # Nested mounts would make archiving the underlying mount incomplete.
                if any(m['Destination'].startswith(target.rstrip('/') + '/') for m in app['Mounts']):
                    raise ValueError('Nested mounts require an explicit backup policy')
                mounts[key] = dict(type=mount['Type'], source=source, target=target)
        # Use the exact local image used by the selected app, never a floating helper image.
        def helper(key, command, readonly=True, **kwargs):
            m = mounts[key]
            mount = 'type=' + m['type'] + ',source=' + m['source'] + ',target=/data'
            if readonly:
                mount += ',readonly'
            return run(['docker', 'run', '--rm'] + (['-i'] if 'stdin' in kwargs else []) + ['--network', 'none', '--user', '0:0',
                        '--mount', mount, '--entrypoint', 'sh', app['Image'], '-ec', command], **kwargs)

        def database(command, **kwargs):
            # Credentials stay inside db, absent from command arguments and backup metadata.
            return run(compose + ['exec', '-T', 'db', 'sh', '-ec',
                       'export MYSQL_PWD="$MARIADB_ROOT_PASSWORD"; ' + command], **kwargs)

        if args.restore:
            folder = args.restore.resolve()
            manifest = verify(folder)
            if manifest['mounts'] and any(manifest['mounts'][k]['target'] != mounts[k]['target'] for k in mounts):
                raise ValueError('Restore requires identical container media/storage paths')
            # Check every destination before making any changes. Import/extraction failures
            # leave partial data: never retry against it without operator investigation.
            if 'database.sql' in manifest['files']:
                result = database('mariadb --user=root --batch --skip-column-names "$MARIADB_DATABASE" -e "SHOW TABLES"', stdout=subprocess.PIPE)
                if result.stdout.strip():
                    raise ValueError('Restore database must be empty')
            for key in mounts:
                if key + '.tar.gz' in manifest['files']:
                    helper(key, 'entry=$(find /data -mindepth 1 -print -quit); test -z "$entry"')
            if 'database.sql' in manifest['files']:
                with (folder / 'database.sql').open('rb') as stream:
                    database('mariadb --user=root "$MARIADB_DATABASE"', stdin=stream)
            for key in mounts:
                if key + '.tar.gz' in manifest['files']:
                    with (folder / (key + '.tar.gz')).open('rb') as stream:
                        helper(key, 'tar -xzpf - -C /data', readonly=False, stdin=stream)
            print('Restore completed. Verify ownership and application recovery before starting scheduling.')
            return

        stage = Path(tempfile.mkdtemp(prefix='.incomplete-', dir=destination))
        manifest = dict(format=1, project=args.project, scope=args.scope,
                        created=datetime.datetime.now(datetime.timezone.utc).isoformat(),
                        database_image=db['Config']['Image'] if need_db else None,
                        database_image_id=db.get('Image') if need_db else None,
                        app_image=app['Image'] if app else None, mounts=mounts, files={})
        if need_db:
            with (stage / 'database.sql').open('wb') as stream:
                database('mariadb-dump --user=root --single-transaction --quick --routines --events --triggers --hex-blob --default-character-set=utf8mb4 "$MARIADB_DATABASE"', stdout=stream)
            if (stage / 'database.sql').stat().st_size == 0:
                raise ValueError('Empty database dump')
        for key in mounts:
            with (stage / (key + '.tar.gz')).open('wb') as stream:
                helper(key, 'tar -czpf - -C /data .', stdout=stream)
        for path in stage.iterdir():
            manifest['files'][path.name] = digest(path)
        (stage / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
        verify(stage)
        # Flush data before publication. A failed stage stays private for diagnosis.
        for path in stage.iterdir():
            with path.open('rb') as stream:
                os.fsync(stream.fileno())
        staging_fd = os.open(stage, os.O_RDONLY)
        try:
            os.fsync(staging_fd)
        finally:
            os.close(staging_fd)
        stamp = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
        prefix = 'hmv-' + args.project + '-' + args.scope + '-'
        final = destination / (prefix + stamp)
        stage.rename(final)
        directory_fd = os.open(destination, os.O_RDONLY)
        try:
            os.fsync(directory_fd)
        finally:
            os.close(directory_fd)
        # Only this project/scope's published, verified sets qualify for retention.
        pattern = re.compile(re.escape(prefix) + r'\d{8}T\d{12}Z')
        backups = sorted(p for p in destination.iterdir() if pattern.fullmatch(p.name) and p.is_dir() and not p.is_symlink())
        import shutil
        for old in backups[:-args.keep]:
            verify(old)
            shutil.rmtree(old)
        print('Verified backup: ' + str(final))


if __name__ == '__main__':
    try:
        main()
    except (OSError, ValueError, KeyError, subprocess.CalledProcessError, tarfile.TarError) as error:
        print('Backup/restore failed; no further retention performed: ' + str(error), file=sys.stderr)
        sys.exit(1)
