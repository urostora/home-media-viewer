# Sourced by the official MariaDB entrypoint on an EMPTY database volume only.
# Also safe to source explicitly during an operator-managed existing-volume upgrade.
for role_variable in MARIADB_DATABASE MARIADB_USER MARIADB_MIGRATION_USER; do
    role_value=${!role_variable}
    if [[ ! "$role_value" =~ ^[A-Za-z0-9_]+$ ]]; then
        echo 'Database and role names must contain only letters, digits and underscores' >&2
        return 1
    fi
done
if [[ "$MARIADB_USER" == root || "$MARIADB_MIGRATION_USER" == root || "$MARIADB_USER" == "$MARIADB_MIGRATION_USER" || -z "$MARIADB_MIGRATION_PASSWORD" ]]; then
    echo 'Distinct non-root database roles and a migration password are required' >&2
    return 1
fi
# Hex encoding avoids interpolating an untrusted password into SQL syntax/logs.
role_password_hex=$(printf '%s' "$MARIADB_MIGRATION_PASSWORD" | od -An -v -tx1 | tr -d ' \n')
if ! docker_process_sql > /dev/null 2>&1 <<SQL
SET SESSION sql_mode = '';
SET @role_sql = CONCAT('CREATE USER IF NOT EXISTS \`$MARIADB_MIGRATION_USER\`@\`%\` IDENTIFIED BY ', QUOTE(CONVERT(0x$role_password_hex USING utf8mb4)));
PREPARE role_statement FROM @role_sql;
EXECUTE role_statement;
DEALLOCATE PREPARE role_statement;
GRANT ALL PRIVILEGES ON \`${MARIADB_DATABASE//_/\\_}\`.* TO \`$MARIADB_MIGRATION_USER\`@'%';
REVOKE ALL PRIVILEGES, GRANT OPTION FROM \`$MARIADB_USER\`@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON \`${MARIADB_DATABASE//_/\\_}\`.* TO \`$MARIADB_USER\`@'%';
SQL
then
    echo "Database role initialization failed; check names, privileges and server compatibility" >&2
    return 1
fi
unset role_password_hex role_variable role_value
