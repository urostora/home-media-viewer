#!/usr/bin/env python3
"""Read-only host probe. Emit secret-free JSON and exit nonzero for operator alerting."""
import argparse
import datetime as dt
import json
import os
from pathlib import Path
import subprocess
import sys


def inspect_backups(directory, project, now):
    dates = []
    for manifest in directory.glob(f'hmv-{project}-all-*/manifest.json'):
        data = json.loads(manifest.read_text())
        if data.get('format') == 1 and data.get('project') == project and data.get('scope') == 'all':
            if all((manifest.parent / name).is_file() for name in ['database.sql', 'media.tar.gz', 'storage.tar.gz']):
                date = dt.datetime.fromisoformat(data['created'])
                age = (now - date).total_seconds()
                if age >= 0:
                    dates.append(age)
    return min(dates) if dates else None


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--compose-file', required=True)
    parser.add_argument('--env-file', required=True)
    parser.add_argument('--project', required=True)
    parser.add_argument('--backup-directory', required=True, type=Path)
    parser.add_argument('--docker-data-directory', default='/var/lib/docker', type=Path)
    parser.add_argument('--max-backup-age-hours', type=float, default=26)
    parser.add_argument('--max-index-age-minutes', type=float, default=15)
    parser.add_argument('--min-free-bytes', type=int, default=2 * 1024**3)
    args = parser.parse_args()
    compose = ['docker', 'compose', '-f', args.compose_file, '--env-file', args.env_file, '-p', args.project]
    alerts, report = [], {}

    def command(argv):
        # Command stderr may contain deployment settings; report only a generic probe failure.
        result = subprocess.run(argv, capture_output=True, text=True, timeout=30)
        if result.returncode:
            raise RuntimeError('Probe command failed')
        return result.stdout

    for service in ['db', 'app', 'background', 'scheduler']:
        try:
            ids = command(compose + ['ps', '-q', service]).split()
            if len(ids) != 1:
                raise RuntimeError('Expected one running container')
            container = json.loads(command(['docker', 'inspect', ids[0]]))[0]
            state = container['State']
            health = state.get('Health', {}).get('Status')
            report[service] = {'running': state['Running'], 'health': health,
                               'oomKilled': state['OOMKilled'], 'restarts': container['RestartCount']}
            if not state['Running'] or state['OOMKilled'] or health not in (None, 'healthy'):
                alerts.append(f'{service}: unavailable or unhealthy')
        except Exception:
            alerts.append(f'{service}: probe failed')

    try:
        disk = command(compose + ['exec', '-T', 'db', 'df', '-Pk', '/var/lib/mysql']).splitlines()[-1].split()
        free = int(disk[3]) * 1024
        report['databaseFreeBytes'] = free
        if free < args.min_free_bytes:
            alerts.append('database storage: low space')
    except Exception:
        alerts.append('database storage: disk probe failed')

    probe = '''
const base = 'http://127.0.0.1:3000';
const readiness = await fetch(base + '/api/health/ready', {signal: AbortSignal.timeout(15000)});
if (!readiness.ok) throw new Error('not ready');
const response = await fetch(base + '/api/process/lastProcessStatistics', {
  headers: {Authorization: `Bearer ${process.env.PROCESS_TOKEN}`}, signal: AbortSignal.timeout(15000),
});
if (!response.ok) throw new Error('status failed');
const data = await response.json();
const fs = await import('node:fs/promises');
const disk = await fs.statfs(process.env.APP_STORAGE_PATH || '/mnt/storage');
console.log(JSON.stringify({indexing: data.indexing, storageFreeBytes: disk.bavail * disk.bsize}));
'''
    try:
        status = json.loads(command(compose + ['exec', '-T', 'background', 'node', '--input-type=module', '-e', probe]))
        report.update(status)
        indexing = status.get('indexing') or {}
        success = indexing.get('lastSuccessAt')
        age = (dt.datetime.now(dt.timezone.utc) - dt.datetime.fromisoformat(success)).total_seconds() if success else None
        if age is None or age > args.max_index_age_minutes * 60:
            alerts.append('indexing: last success missing or overdue')
        if indexing.get('outcome') in ('failed', 'interrupted'):
            alerts.append('indexing: latest run failed or interrupted')
        if status['storageFreeBytes'] < args.min_free_bytes:
            alerts.append('generated storage: low space')
    except Exception:
        alerts.append('background readiness/indexing/storage probe failed')

    for label, directory in [('backup staging', args.backup_directory), ('Docker data (DB/logs)', args.docker_data_directory)]:
        try:
            disk = os.statvfs(directory)
            free = disk.f_bavail * disk.f_frsize
            report[label] = {'freeBytes': free}
            if free < args.min_free_bytes:
                alerts.append(f'{label}: low space')
        except OSError:
            alerts.append(f'{label}: disk probe failed')
    try:
        age = inspect_backups(args.backup_directory, args.project, dt.datetime.now(dt.timezone.utc))
        report['backupAgeSeconds'] = age
        if age is None or age > args.max_backup_age_hours * 3600:
            alerts.append('backup: complete local set missing or overdue')
    except Exception:
        alerts.append('backup: manifest probe failed')
    report['alerts'] = alerts
    print(json.dumps(report, sort_keys=True))
    return 1 if alerts else 0


if __name__ == '__main__':
    sys.exit(main())
