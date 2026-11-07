"""Exercise the actual Bash scripts with a fake Docker CLI; run inside Docker."""
import hashlib
import io
import os
from pathlib import Path
import shutil
import subprocess
import tarfile
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
FAKE_DOCKER = r'''#!/usr/bin/env python3
import os, sys, tarfile
from pathlib import Path
args = sys.argv[1:]
root = Path(os.environ['FIXTURE_ROOT'])
flag = lambda name: (root / name).exists()
if args[0] == 'ps':
    print('migration' if flag('running') else '')
elif args[0] == 'compose':
    if 'ps' in args:
        print('app-id' if args[-1] == 'app' else 'db-id')
    elif 'mariadb-dump' in args:
        print('CREATE TABLE fixture (id INT);')
        if flag('fail-dump'):
            sys.exit(1)
    elif 'SHOW TABLES' in args:
        if flag('fail-query'):
            sys.exit(1)
        print('fixture' if flag('populated-db') else '')
    else:
        (root / 'sql-imported').write_bytes(sys.stdin.buffer.read())
elif args[0] == 'inspect':
    template = args[args.index('--format') + 1]
    if template == '{{.Image}}':
        print('sha256:local-image')
    elif '.Config.Env' in template:
        print('APP_STORAGE_PATH=/mnt/storage')
    else:
        print('/mnt/storage\tvolume\tfixture-storage')
elif args[0] == 'run':
    command = args[-1]
    if command.startswith('tar -cpf'):
        if flag('fail-tar'):
            sys.exit(1)
        with tarfile.open(fileobj=sys.stdout.buffer, mode='w|') as archive:
            archive.add(root / 'storage', arcname='.')
    elif 'find /data' in command:
        sys.exit(1 if flag('populated-storage') else 0)
    else:
        data = sys.stdin.buffer.read()
        (root / 'storage-imported').write_bytes(data)
else:
    sys.exit('Unexpected Docker command')
'''


class BackupTest(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        binary = self.root / 'bin'
        binary.mkdir()
        docker = binary / 'docker'
        docker.write_text(FAKE_DOCKER)
        docker.chmod(0o700)
        storage = self.root / 'storage' / 'thumbnail'
        storage.mkdir(parents=True)
        (storage / 'fixture.jpg').write_bytes(b'\x00thumbnail\xff')
        (self.root / 'storage' / '.hidden').write_text('preserved')
        self.destination = self.root / 'backups with spaces'
        self.env = dict(os.environ, FIXTURE_ROOT=str(self.root), PATH=str(binary) + ':' + os.environ['PATH'])
        self.options = ['--compose-file', 'fixture.yml', '--env-file', 'private.env', '--project', 'test-project',
                        '--destination', str(self.destination)]

    def invoke(self, restore=None, success=True):
        command = ['bash', str(ROOT / 'scripts/backup' / ('restore.sh' if restore else 'backup.sh'))]
        result = subprocess.run(command + ([str(restore)] if restore else []) + self.options,
                                env=self.env, capture_output=True, text=True)
        self.assertEqual(result.returncode == 0, success, result.stdout + result.stderr)
        self.assertFalse(list(self.destination.glob('.backup-work-*')))
        return result

    def create(self):
        self.invoke()
        return sorted(self.destination.glob('hmv-*.tar.gz'))[-1]

    def assert_no_writes(self):
        self.assertFalse((self.root / 'sql-imported').exists())
        self.assertFalse((self.root / 'storage-imported').exists())

    def rewrite(self, archive, change):
        with tarfile.open(archive) as bundle:
            files = {member.name: bundle.extractfile(member).read() for member in bundle}
        change(files)
        with tarfile.open(archive, 'w:gz') as bundle:
            for name, data in files.items():
                member = tarfile.TarInfo(name)
                member.size = len(data)
                bundle.addfile(member, io.BytesIO(data))

    def test_round_trip_hidden_files_and_no_retention(self):
        archive = self.create()
        self.assertRegex(archive.name, r'^hmv-test-project-all-\d{8}T\d{15}Z.tar.gz$')
        self.invoke(restore=archive)
        self.assertIn(b'CREATE TABLE fixture', (self.root / 'sql-imported').read_bytes())
        with tarfile.open(self.root / 'storage-imported') as storage:
            self.assertEqual(storage.extractfile('./thumbnail/fixture.jpg').read(), b'\x00thumbnail\xff')
            self.assertEqual(storage.extractfile('./.hidden').read(), b'preserved')
        self.create()
        self.assertEqual(len(list(self.destination.glob('hmv-*.tar.gz'))), 2)
        self.assertEqual(archive.stat().st_mode & 0o777, 0o600)

    def test_failed_dump_and_tar_publish_nothing(self):
        for flag in ['fail-dump', 'fail-tar']:
            (self.root / flag).touch()
            self.invoke(success=False)
            self.assertEqual(list(self.destination.glob('hmv-*.tar.gz')), [])
            (self.root / flag).unlink()

    def test_running_writer_rejected(self):
        (self.root / 'running').touch()
        self.invoke(success=False)
        self.assert_no_writes()

    def test_populated_targets_and_failed_query_rejected(self):
        archive = self.create()
        for flag in ['populated-db', 'populated-storage', 'fail-query']:
            (self.root / flag).touch()
            self.invoke(restore=archive, success=False)
            self.assert_no_writes()
            (self.root / flag).unlink()

    def test_corrupt_payload_rejected(self):
        archive = self.create()
        self.rewrite(archive, lambda files: files.update({'database.sql': b'corrupted'}))
        self.invoke(restore=archive, success=False)
        self.assert_no_writes()

    def test_incomplete_and_unsafe_archives_rejected(self):
        for name in ['storage.tar', '../escape']:
            archive = self.create()
            if name == 'storage.tar':
                self.rewrite(archive, lambda files: files.pop('storage.tar'))
            else:
                self.rewrite(archive, lambda files: files.update({'../escape': b'unsafe'}))
            self.invoke(restore=archive, success=False)
            self.assert_no_writes()

    def test_truncated_gzip_rejected(self):
        archive = self.create()
        archive.write_bytes(archive.read_bytes()[:-8])
        self.invoke(restore=archive, success=False)
        self.assert_no_writes()

    def test_compression_and_packaging_failures_publish_nothing(self):
        # Fail the real host-side commands, not the simulated storage copy.
        for tool, argument in [('gzip', '-1'), ('tar', '-cf')]:
            with self.subTest(tool=tool):
                wrapper = self.root / 'bin' / tool
                executable = shutil.which(tool)
                wrapper.write_text(
                    '#!/usr/bin/env python3\n'
                    'import os, sys\n'
                    f'if {argument!r} in sys.argv[1:]: sys.exit(1)\n'
                    f'os.execv({executable!r}, [{executable!r}] + sys.argv[1:])\n')
                wrapper.chmod(0o700)
                try:
                    self.invoke(success=False)
                    self.assertEqual(list(self.destination.glob('hmv-*.tar.gz')), [])
                finally:
                    wrapper.unlink()

    def test_existing_default_compression_format_restores(self):
        archive = self.create()
        # Repack with the previous default compression level and same payloads.
        self.rewrite(archive, lambda files: None)
        self.invoke(restore=archive)

    def test_duplicate_and_nonregular_outer_members_rejected(self):
        for kind in ['duplicate', 'symlink', 'hardlink', 'directory']:
            with self.subTest(kind=kind):
                archive = self.create()
                with tarfile.open(archive) as bundle:
                    files = {member.name: bundle.extractfile(member).read() for member in bundle}
                with tarfile.open(archive, 'w:gz') as bundle:
                    for name, data in files.items():
                        member = tarfile.TarInfo(name)
                        member.size = len(data)
                        if name == 'database.sql' and kind != 'duplicate':
                            member.type = {'symlink': tarfile.SYMTYPE,
                                           'hardlink': tarfile.LNKTYPE,
                                           'directory': tarfile.DIRTYPE}[kind]
                            member.linkname = 'storage-path' if kind != 'directory' else ''
                            member.size = 0
                        bundle.addfile(member, io.BytesIO(data))
                    if kind == 'duplicate':
                        member = tarfile.TarInfo('database.sql')
                        member.size = len(files['database.sql'])
                        bundle.addfile(member, io.BytesIO(files['database.sql']))
                self.invoke(restore=archive, success=False)
                self.assert_no_writes()

    def test_unsafe_inner_members_rejected_with_valid_checksums(self):
        for name, kind in [('../escape', tarfile.REGTYPE),
                           ('/absolute', tarfile.REGTYPE),
                           ('./link', tarfile.SYMTYPE),
                           ('./device', tarfile.CHRTYPE)]:
            with self.subTest(name=name):
                archive = self.create()
                payload = io.BytesIO()
                with tarfile.open(fileobj=payload, mode='w') as storage:
                    member = tarfile.TarInfo(name)
                    member.type = kind
                    member.linkname = '../escape' if kind == tarfile.SYMTYPE else ''
                    storage.addfile(member)

                def replace_storage(files):
                    files['storage.tar'] = payload.getvalue()
                    files['SHA256SUMS'] = ''.join(
                        hashlib.sha256(files[entry]).hexdigest() + '  ' + entry + '\n'
                        for entry in ['database.sql', 'storage.tar', 'storage-path']).encode()

                self.rewrite(archive, replace_storage)
                self.invoke(restore=archive, success=False)
                self.assert_no_writes()

    def test_storage_links_rejected_during_backup(self):
        (self.root / 'storage' / 'link').symlink_to('thumbnail/fixture.jpg')
        self.invoke(success=False)
        self.assertEqual(list(self.destination.glob('hmv-*.tar.gz')), [])


if __name__ == '__main__':
    unittest.main()
