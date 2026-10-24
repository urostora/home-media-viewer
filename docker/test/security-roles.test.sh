#!/bin/sh
# Run only inside an isolated seeded database; this check writes disposable probe rows.
set -eu
export MYSQL_PWD="$MARIADB_PASSWORD"
mariadb --protocol=tcp --host=db --user="$MARIADB_USER" "$MARIADB_DATABASE" -e 'SELECT COUNT(*) FROM User' > /dev/null
if mariadb --protocol=tcp --host=db --user="$MARIADB_USER" "$MARIADB_DATABASE" -e 'CREATE TABLE forbidden_runtime_ddl (id INT)' > /dev/null 2>&1; then
  echo 'Runtime DDL unexpectedly permitted' >&2; exit 1
fi
if mariadb --protocol=tcp --host=db --user="$MARIADB_USER" mysql -e 'SELECT COUNT(*) FROM user' > /dev/null 2>&1; then
  echo 'Runtime system-schema access unexpectedly permitted' >&2; exit 1
fi
export MYSQL_PWD="$MARIADB_MIGRATION_PASSWORD"
mariadb --protocol=tcp --host=db --user="$MARIADB_MIGRATION_USER" "$MARIADB_DATABASE" -e 'CREATE TABLE privilege_probe (id INT); INSERT INTO privilege_probe VALUES (1); DROP TABLE privilege_probe'
if mariadb --protocol=tcp --host=db --user="$MARIADB_MIGRATION_USER" -e 'CREATE DATABASE forbidden_other_schema' > /dev/null 2>&1; then
  echo 'Migration global DDL unexpectedly permitted' >&2; exit 1
fi
export MYSQL_PWD="$MARIADB_PASSWORD"
mariadb --protocol=tcp --host=db --user="$MARIADB_USER" "$MARIADB_DATABASE" -e "INSERT INTO User (id,status,email,name,password,isAdmin) VALUES ('privilege-probe','Active','probe@example.invalid','probe','unused',0); UPDATE User SET name='updated' WHERE id='privilege-probe'; DELETE FROM User WHERE id='privilege-probe';"
echo 'Database role checks passed: runtime CRUD only, migration schema DDL only.'
