import contextlib
import datetime as dt
import importlib.util
import io
import json
from pathlib import Path
import sys
import tempfile
import tarfile
import unittest
from unittest.mock import patch

sys.dont_write_bytecode = True
spec = importlib.util.spec_from_file_location('monitor', Path(__file__).parents[2] / 'scripts/operations/check.py')
monitor = importlib.util.module_from_spec(spec)
spec.loader.exec_module(monitor)


class MonitorTests(unittest.TestCase):
    def test_healthy_and_failure_alerts(self):
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary)
            backup = directory / 'hmv-fixture-all-example'
            backup.mkdir()
            now = dt.datetime.now(dt.timezone.utc)
            (backup / 'manifest.json').write_text(json.dumps(dict(format=1, project='fixture', scope='all', created=now.isoformat())))
            for name in ['database.sql', 'storage.tar.gz', 'media.tar.gz']:
                (backup / name).touch()
            argv = ['check.py', '--compose-file', 'fixture.yml', '--env-file', 'private.env', '--project', 'fixture',
                    '--backup-directory', str(directory), '--docker-data-directory', str(directory), '--min-free-bytes', '0']
            failing = False

            def run(command, **kwargs):
                class Result:
                    returncode = 0
                    stdout = ''
                result = Result()
                if 'df' in command:
                    result.stdout = 'Filesystem 1024-blocks Used Available Capacity Mounted on\nfixture 10000000 1 9999999 1% /var/lib/mysql\n'
                elif 'inspect' in command:
                    result.stdout = json.dumps([dict(State=dict(Running=True, OOMKilled=False, Health=dict(Status='healthy')), RestartCount=0)])
                elif 'ps' in command:
                    result.stdout = 'container'
                else:
                    result.stdout = json.dumps(dict(indexing=dict(lastSuccessAt=now.isoformat(), outcome='failed' if failing else 'success'), storageFreeBytes=10**12))
                return result

            with patch.object(sys, 'argv', argv), patch.object(monitor.subprocess, 'run', run), contextlib.redirect_stdout(io.StringIO()) as output:
                self.assertEqual(monitor.main(), 0)
                failing = True
                self.assertEqual(monitor.main(), 1)
                failing = False
                (backup / 'database.sql').unlink()
                self.assertEqual(monitor.main(), 1)
                self.assertIn('backup: complete local set missing or overdue', output.getvalue())
            with patch.object(sys, 'argv', argv), patch.object(monitor.subprocess, 'run', side_effect=RuntimeError('private secret')), contextlib.redirect_stdout(io.StringIO()) as output:
                self.assertEqual(monitor.main(), 1)
                self.assertNotIn('private secret', output.getvalue())

    def test_future_backup_is_not_fresh(self):
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary)
            backup = directory / 'hmv-fixture-all-example'
            backup.mkdir()
            now = dt.datetime.now(dt.timezone.utc)
            (backup / 'manifest.json').write_text(json.dumps(dict(format=1, project='fixture', scope='all', created=(now + dt.timedelta(days=1)).isoformat())))
            for name in ['database.sql', 'storage.tar.gz', 'media.tar.gz']:
                (backup / name).touch()
            self.assertIsNone(monitor.inspect_backups(directory, 'fixture', now))

    def test_single_file_backup_age_and_missing_payload(self):
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary)
            path = directory / 'hmv-fixture-all-20261105T120000000000Z.tar.gz'
            now = dt.datetime.now(dt.timezone.utc)
            for complete in (True, False):
                with tarfile.open(path, 'w:gz') as archive:
                    payloads = {'manifest.json': json.dumps(dict(format=1, project='fixture', scope='all', created=now.isoformat())).encode(),
                                'database.sql': b'SQL', 'storage.tar.gz': b'storage', 'media.tar.gz': b'media'}
                    if not complete:
                        del payloads['storage.tar.gz']
                    for name, data in payloads.items():
                        member = tarfile.TarInfo(name)
                        member.size = len(data)
                        archive.addfile(member, io.BytesIO(data))
                self.assertEqual(monitor.inspect_backups(directory, 'fixture', now), 0 if complete else None)

    def test_bash_archive_age(self):
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary)
            now = dt.datetime.now(dt.timezone.utc).replace(microsecond=0)
            path = directory / ('hmv-fixture-all-' + now.strftime('%Y%m%dT%H%M%S') + '000000000Z.tar.gz')
            for complete in (True, False):
                with tarfile.open(path, 'w:gz') as archive:
                    names = ['database.sql', 'storage.tar', 'storage-path', 'SHA256SUMS']
                    for name in names if complete else names[:-1]:
                        archive.addfile(tarfile.TarInfo(name))
                self.assertEqual(monitor.inspect_backups(directory, 'fixture', now), 0 if complete else None)


if __name__ == '__main__':
    unittest.main()
