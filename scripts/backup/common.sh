#!/bin/bash
# Shared setup for backup.sh and restore.sh. Sourced, not an entry point.
set -euo pipefail
umask 077

fail() {
  echo "$*" >&2
  exit 1
}

# 1. Require an explicit installation and backup/staging directory.
compose_file=
env_file=
project=
destination=
while (($#)); do
  (($# >= 2)) || fail "Missing value for $1"
  case "$1" in
    --compose-file) compose_file=$2 ;;
    --env-file) env_file=$2 ;;
    --project) project=$2 ;;
    --destination) destination=$2 ;;
    *) fail "Unknown option: $1" ;;
  esac
  shift 2
done
[[ -n $compose_file && -n $env_file && -n $project && -n $destination ]] ||
  fail 'Required: --compose-file FILE --env-file FILE --project NAME --destination DIRECTORY'
[[ $project =~ ^[a-z0-9][a-z0-9_-]*$ ]] || fail 'Invalid Compose project name'
# An array preserves spaces in paths when invoking Compose.
compose=(docker compose -f "$compose_file" --env-file "$env_file" -p "$project")

# 2. Serialize operations sharing a destination and arrange private cleanup.
mkdir -p -- "$destination"
destination=$(realpath -- "$destination")
# Keep the lock inode so overlapping commands cannot acquire separate locks.
exec 9>"$destination/.backup.lock"
flock -n 9 || fail 'Another backup/restore is using this destination'
# Staging lives on the same filesystem as the final archive for atomic rename.
stage=$(mktemp -d "$destination/.backup-work-XXXXXXXX")
trap 'rm -rf -- "$stage"' EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

# 3. Refuse active writers, including one-off and profiled containers.
running=$(docker ps --filter "label=com.docker.compose.project=$project" --format '{{.Label "com.docker.compose.service"}}')
while IFS= read -r service; do
  case "$service" in
    app|background|scheduler|migration|testrunner)
      fail 'Stop app, background, scheduler, migration and testrunner before backup/restore'
      ;;
  esac
done <<< "$running"

# 4. Locate one database and one stopped app container in this project.
db_id=$("${compose[@]}" ps --quiet db)
app_id=$("${compose[@]}" ps --all --quiet app)
[[ -n $db_id && $db_id != *$'\n'* ]] || fail 'Exactly one running db is required'
[[ -n $app_id && $app_id != *$'\n'* ]] || fail 'Create exactly one stopped app container first'
# Read the actual container configuration, rather than assuming default mounts.
app_image=$(docker inspect --format '{{.Image}}' "$app_id")
app_env=$(docker inspect --format '{{range .Config.Env}}{{println .}}{{end}}' "$app_id")
storage_path=/mnt/storage
while IFS= read -r setting; do
  case "$setting" in
    APP_STORAGE_PATH=*) storage_path=${setting#*=} ;;
  esac
done <<< "$app_env"
[[ $storage_path == /* && $storage_path != / ]] || fail 'APP_STORAGE_PATH must be an absolute storage mount path'

# 5. Find the direct storage mount and reject layouts we cannot safely copy.
mounts=$(docker inspect --format '{{range .Mounts}}{{.Destination}}{{printf "\t"}}{{.Type}}{{printf "\t"}}{{if eq .Type "volume"}}{{.Name}}{{else}}{{.Source}}{{end}}{{println}}{{end}}' "$app_id")
storage_mount=
while IFS=$'\t' read -r mount_target mount_type mount_source; do
  if [[ $mount_target == "$storage_path" ]]; then
    [[ $mount_type == volume || $mount_type == bind ]] || fail 'Storage must be a volume or bind mount'
    [[ $mount_source != *,* ]] || fail 'Mount paths containing commas are unsupported'
    if [[ $mount_type == bind ]]; then
      mount_source=$(realpath -- "$mount_source")
      [[ $destination != "$mount_source" && $destination != "$mount_source/"* ]] || fail 'Backup destination must be outside storage'
    fi
    storage_mount="type=$mount_type,source=$mount_source,target=/data"
  elif [[ $mount_target == "$storage_path/"* ]]; then
    fail 'Nested storage mounts are unsupported'
  fi
done <<< "$mounts"
[[ -n $storage_mount ]] || fail 'Expected a direct mount at APP_STORAGE_PATH'

# Run storage commands in a temporary, network-isolated helper using the app image.
# The first argument is either ',readonly' for inspection/backup or '' for restore.
storage() {
  local mount_options=$1
  shift
  docker run --rm -i --network none --user 0:0 --mount "$storage_mount$mount_options" \
    --entrypoint sh "$app_image" -ec "$@"
}

# Keep credentials inside the database container and pass SQL through stdin.
# Append the configured application database to the requested MariaDB command.
database() {
  "${compose[@]}" exec -T db sh -ec 'export MYSQL_PWD="$MARIADB_ROOT_PASSWORD"; exec "$@" "$MARIADB_DATABASE"' -- "$@"
}

# Inspect storage members without extracting them. Only relative regular files
# and directories are supported; links, devices and parent traversal are rejected.
check_storage_archive() {
  tar -tf "$stage/storage.tar" > "$stage/storage-members"
  while IFS= read -r member; do
    [[ $member != /* && /$member/ != */../* ]] || fail 'Unsafe storage archive path'
  done < "$stage/storage-members"
  # GNU tar's first column identifies regular files ('-') and directories ('d').
  tar -tvf "$stage/storage.tar" > "$stage/storage-types"
  [[ -z $(sed '/^[-d]/d' "$stage/storage-types") ]] || fail 'Storage links and special files are unsupported'
}
