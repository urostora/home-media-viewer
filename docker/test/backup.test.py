"""Run in the Compose dependencies service with the repository at /workspace."""
import fcntl
import importlib.util
import io
import json
from pathlib import Path
import subprocess
import sys
import tarfile
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('backup', Path(__file__).resolve().parents[2] / 'scripts/backup/backup.py')
backup = importlib.util.module_from_spec(spec)
spec.loader.exec_module(backup)


class BackupTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.destination = self.root / 'backups'
        self.running = False
        self.fail_dump = False
        self.fail_archive = False
        self.populated = False
        self.mutations = []
        self.args = ['backup.py', '--compose-file', str(self.root / 'compose.yml'), '--env-file', str(self.root / 'env'),
                     '--project', 'test-project', '--destination', str(self.destination), '--keep', '1']
        self.app = {'State': {'Running': False}, 'Image': 'sha256:local',
                    'Config': {'Env': ['APP_ALBUM_ROOT_PATH=/mnt/albums']},
                    'Mounts': [{'Type': 'bind', 'Source': str(self.root / 'media'), 'Destination': '/mnt/albums'},
                               {'Type': 'volume', 'Name': 'real-storage-volume', 'Destination': '/mnt/storage'}]}
        self.db = {'State': {'Running': True}, 'Config': {'Image': 'mariadb:verified'}}

    def test_non_default_storage_root_is_recorded(self):
        self.app['Config']['Env'].append('APP_STORAGE_PATH=/srv/hmv-generated')
        self.app['Mounts'][1]['Destination'] = '/srv/hmv-generated'
        self.invoke()
        manifest = json.loads((self.sets()[0] / 'manifest.json').read_text())
        self.assertEqual(manifest['mounts']['storage']['target'], '/srv/hmv-generated')

    def capture(self, args):
        if args[-2:] == ['config', '--services']:
            return 'db\napp'
        if args[0:2] == ['docker', 'inspect']:
            return json.dumps([self.app if args[2] == 'app-id' else self.db])
        return args[-1] + '-id'

    def fake_run(self, args, **kwargs):
        command = args[-1]
        if 'mariadb-dump' in command:
            if self.fail_dump:
                kwargs['stdout'].write(b'partial SQL')
                raise subprocess.CalledProcessError(1, ['dump'])
            kwargs['stdout'].write(b'CREATE TABLE recovery (id INT);\n')
        elif command.startswith('tar -czpf'):
            if self.fail_archive:
                raise subprocess.CalledProcessError(1, ['tar'])
            with tarfile.open(fileobj=kwargs['stdout'], mode='w:gz') as archive:
                info = tarfile.TarInfo('test.txt')
                info.size = 7
                archive.addfile(info, io.BytesIO(b'fixture'))
        elif 'SHOW TABLES' in command:
            return subprocess.CompletedProcess(args, 0, stdout=b'existing_table' if self.populated else b'')
        elif 'tar -xzpf' in command or 'mariadb --user=root' in command:
            self.mutations.append(command)
        return subprocess.CompletedProcess(args, 0)

    def invoke(self, extra=()):
        with patch.object(sys, 'argv', self.args + list(extra)), patch.object(backup, 'capture', self.capture), patch.object(backup, 'run', self.fake_run):
            backup.main()

    def sets(self):
        return sorted(self.destination.glob('hmv-*'))

    def test_successful_bundle_restore_and_retention(self):
        self.invoke()
        manifest = backup.verify(self.sets()[0])
        self.assertEqual(set(manifest['files']), {'database.sql', 'media.tar.gz', 'storage.tar.gz'})
        self.assertEqual(manifest['mounts']['storage']['source'], 'real-storage-volume')
        self.invoke(['--restore', str(self.sets()[0])])
        self.assertEqual(len(self.mutations), 3)
        unrelated = self.destination / 'unrelated.txt'
        unrelated.write_text('keep')
        self.invoke()
        self.assertEqual(len(self.sets()), 1)
        self.assertTrue(unrelated.exists())

    def test_partial_dump_cannot_prune_good_backup(self):
        self.invoke()
        original = self.sets()[0]
        self.fail_dump = True
        with self.assertRaises(subprocess.CalledProcessError):
            self.invoke()
        self.assertEqual(self.sets(), [original])
        backup.verify(original)
        self.assertTrue(list(self.destination.glob('.incomplete-*')))

    def test_corrupted_restore_never_writes(self):
        self.invoke()
        (self.sets()[0] / 'media.tar.gz').write_bytes(b'corrupt')
        with self.assertRaises(ValueError):
            self.invoke(['--restore', str(self.sets()[0])])
        self.assertEqual(self.mutations, [])

    def test_failed_archive_cannot_prune_good_backup(self):
        self.invoke()
        original = self.sets()[0]
        self.fail_archive = True
        with self.assertRaises(subprocess.CalledProcessError):
            self.invoke()
        self.assertEqual(self.sets(), [original])
        backup.verify(original)

    def test_populated_database_never_restored(self):
        self.invoke()
        self.populated = True
        with self.assertRaisesRegex(ValueError, 'database must be empty'):
            self.invoke(['--restore', str(self.sets()[0])])
        self.assertEqual(self.mutations, [])

    def test_running_consumer_rejected(self):
        self.app['State']['Running'] = True
        with self.assertRaisesRegex(ValueError, 'Stop app'):
            self.invoke()
        self.assertEqual(self.sets(), [])

    def test_lock_rejects_overlap(self):
        self.destination.mkdir()
        with (self.destination / '.backup.lock').open('a') as lock:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            with self.assertRaises(BlockingIOError):
                self.invoke()
        self.assertEqual(self.sets(), [])

    def test_destination_inside_media_rejected(self):
        self.app['Mounts'][0]['Source'] = str(self.root)
        with self.assertRaisesRegex(ValueError, 'outside source trees'):
            self.invoke()


unittest.main()
