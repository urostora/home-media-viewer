#!/bin/bash
# Restore a verified backup into an empty database and generated-storage mount.
set -euo pipefail

# The archive is positional; the remaining options select the installation.
if (($# == 0)); then
  echo "Usage: $0 BACKUP.tar.gz --compose-file FILE --env-file FILE --project NAME --destination DIRECTORY" >&2
  exit 2
fi
backup_file=$(realpath -- "$1")
shift
source "$(dirname -- "${BASH_SOURCE[0]}")/common.sh"

# 1. Decompress once into private staging. gzip checks the complete stream,
# including its checksum/trailer, before any payload is extracted or imported.
# This trades extra temporary disk space for avoiding four decompression passes.
outer_archive="$stage/backup.tar"
gzip -dc -- "$backup_file" > "$outer_archive"

# Accept exactly our four regular payload files, never arbitrary tar paths.
tar -tf "$outer_archive" > "$stage/members"
printf '%s\n' database.sql storage.tar storage-path SHA256SUMS | sort > "$stage/expected"
sort "$stage/members" > "$stage/actual"
if ! cmp -s "$stage/expected" "$stage/actual"; then
  fail 'Unsupported or incomplete backup archive'
fi

tar -tvf "$outer_archive" > "$stage/types"
# GNU tar marks regular files with '-' in the first column.
if [[ -n $(sed '/^-/d' "$stage/types") ]]; then
  fail 'Backup payloads must be regular files'
fi

# 2. Unpack into private staging and verify every payload checksum.
tar -xf "$outer_archive" -C "$stage" --no-same-owner --no-same-permissions
(
  cd "$stage"
  sha256sum database.sql storage.tar storage-path > actual-checksums
)
if ! cmp -s "$stage/SHA256SUMS" "$stage/actual-checksums"; then
  fail 'Backup checksum mismatch'
fi

# The unpacked payload now replaces the outer tar; release its disk space early.
rm -- "$outer_archive"

# 3. Check compatibility and storage member safety before touching targets.
if [[ ! -s $stage/database.sql ]]; then
  fail 'Database dump is empty'
fi
if [[ $(cat "$stage/storage-path") != "$storage_path" ]]; then
  fail 'Restore requires the same APP_STORAGE_PATH'
fi
check_storage_archive

# 4. Check BOTH targets before changing either one. Hidden files count as data.
existing_tables=$(database mariadb --user=root --batch --skip-column-names -e 'SHOW TABLES')
if [[ -n $existing_tables ]]; then
  fail 'Restore database must be empty'
fi
if ! storage ',readonly' 'entry=$(find /data -mindepth 1 -print -quit); test -z "$entry"'; then
  fail 'Restore storage must be empty'
fi

# 5. Import SQL, then restore storage with its original numeric ownership.
# There is no cross-target rollback: a failure here requires fresh empty targets.
database mariadb --user=root < "$stage/database.sql"
storage '' 'tar -xpf - --numeric-owner -C /data' < "$stage/storage.tar"
echo 'Restore completed. Verify the application before starting writers.'
