#!/bin/bash
# Snapshot the application database and entire generated-storage volume.
set -euo pipefail

# Parse options, lock the destination and locate the stopped installation.
source "$(dirname -- "${BASH_SOURCE[0]}")/common.sh"

# 1. Dump the database while application writers remain stopped.
database mariadb-dump \
    --user=root \
    --single-transaction \
    --quick \
    --routines \
    --events \
    --triggers \
    --hex-blob \
    --default-character-set=utf8mb4 >"$stage/database.sql"
if [[ ! -s $stage/database.sql ]]; then
    fail 'Database dump is empty'
fi

# 2. Copy all generated storage read-only, then reject unsupported entries.
storage ',readonly' 'tar -cpf - -C /data .' >"$stage/storage.tar"
check_storage_archive

# 3. Record the container storage path and checksums for restore validation.
printf '%s\n' "$storage_path" >"$stage/storage-path"
(
    cd "$stage"
    sha256sum database.sql storage.tar storage-path >SHA256SUMS
)

# 4. Stream the package through fast gzip on the host. Level 1 spends less CPU
# on already-compressed thumbnails; pipefail catches either tar or gzip failure.
tar -cf - -C "$stage" database.sql storage.tar storage-path SHA256SUMS |
    gzip -1 >"$stage/backup.tar.gz"
gzip -t "$stage/backup.tar.gz"

# 5. Rename within the destination so only complete archives are published.
# Previous backups are kept; retention is managed separately.
backup_timestamp=$(date -u +%Y%m%dT%H%M%S%NZ)
backup_path="$destination/hmv-$project-all-$backup_timestamp.tar.gz"
mv -- "$stage/backup.tar.gz" "$backup_path"
printf 'Backup created: %s\n' "$backup_path"
