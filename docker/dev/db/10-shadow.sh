# Sourced only for fresh DEVELOPMENT databases; never mounted in production.
if [[ ! "$MARIADB_DATABASE" =~ ^[A-Za-z0-9_]+$ || ! "$MARIADB_USER" =~ ^[A-Za-z0-9_]+$ || "$MARIADB_USER" == root ]]; then
    echo 'Development database/user names must be simple identifiers and the user must not be root' >&2
    return 1
fi
docker_process_sql <<SQL
CREATE DATABASE IF NOT EXISTS \`${MARIADB_DATABASE}_shadow\`;
GRANT ALL PRIVILEGES ON \`${MARIADB_DATABASE//_/\\_}\_shadow\`.* TO \`$MARIADB_USER\`@'%';
SQL
