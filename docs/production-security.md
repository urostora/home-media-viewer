# Production security and existing-installation transition

Production Compose requires private deployment settings. Repository environment files have been replaced with `.env*.example` templates; existing local `.env*` files remain on disk but are ignored and removed from the Git index. Historical commits still contain the old values. Treat any committed credential used outside disposable fixtures as exposed: rotate it on the actual service. No deployed credential is rotated merely by updating this checkout.

## Prepare configuration

```sh
python3 scripts/security/create-env.py .env-prod.example /secure/hmv.env
chmod 600 /secure/hmv.env
# Edit ADMIN_EMAIL, paths, ports and other deployment-specific settings privately.
docker compose -f docker-compose-prod.yml --env-file /secure/hmv.env config --quiet
```

The generator exclusively creates a new mode-0600 file with independent random passwords, a session secret and process token. It refuses to overwrite an existing file. Keep it stable across container rebuilds/restarts and consistent between web/background roles. Compose interpolates URL credentials from the same settings; generated hexadecimal passwords are URL-safe. Percent-encode reserved characters when supplying custom URL passwords. Root, runtime and migration passwords should be distinct. Do not run unredacted `docker compose config`, print environment files, attach them to issues, or pass passwords in command arguments. Environment variables remain inspectable by Docker administrators; restrict Docker access and store the private file in a protected directory or inject settings from the deployment secret manager.

The same generator accepts `.env.example` and `.env-test.example` for new development/test installations. Development uses a non-root schema user; its fresh-volume init script grants access only to the application database and its named `_shadow` database. Production has no shadow database configuration. Test services explicitly opt into HTTP cookies because their production images run behind plain internal HTTP. Do not reuse test settings for production. `.env-prod-debug.example` contains no remote address: temporary remote administration requires an explicit SSH tunnel/override.

Production rejects missing/empty DB settings, migration URL/password, process token and session secret during Compose interpolation. The app entrypoint additionally rejects blank tokens, session secrets shorter than 32 characters, root/passwordless/non-service-DNS database URLs and malformed cookie settings, without echoing supplied secrets. The scheduler validates only its token. Session creation independently requires a stable secret of at least 32 characters in every environment, including when bypassing the default image command. No per-request random fallback remains.

## Ports, TLS and cookies

Production publishes **only the web service**, on `127.0.0.1:25080` by default. Set WEB_PORT or WEB_BIND_ADDRESS deliberately for a different topology. MariaDB has no production published port; services use `db:3306`. Development/test DB ports bind to loopback. For a temporary host-admin connection, explicitly add `-f docker-compose-db-access.yml` to the production Compose command; it publishes MariaDB on loopback only. Prefer an SSH tunnel for remote access; remove the override and recreate db when maintenance ends. Do not expose MariaDB publicly.

Terminate TLS at the deployment's HTTPS reverse proxy. A host nginx server can forward to the loopback web port:

```nginx
server {
    listen 443 ssl;
    server_name photos.example.com;
    ssl_certificate /secure/tls/fullchain.pem;
    ssl_certificate_key /secure/tls/privkey.pem;
    location /api/process/ { deny all; }
    location / {
        proxy_pass http://127.0.0.1:25080;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

Configure your proxy's HTTP-to-HTTPS redirect, valid certificate, renewal and firewall separately. A containerized proxy needs a deliberate shared-network or host-gateway arrangement; its own localhost does not reach the host loopback listener. The internal scheduler uses background service DNS, bypassing the public proxy. No public DNS/certificate/proxy is installed by this change.

Cookies are HttpOnly, SameSite=Lax and Secure by default in production, independent of Docker HOSTNAME. SESSION_COOKIE_SECURE=false is an explicit local HTTP/test override; production Internet access should retain true. No client code needs to read the session cookie. Confirm HTTPS login sets all three attributes, the cookie is absent from document.cookie, page reload/authenticated APIs retain the session, and an HTTP origin cannot authenticate using that Secure cookie. Verify this through the actual deployed proxy before opening access. Rotating APP_SESSION_SECRET invalidates existing sessions and requires re-login.

## Database identities and existing volumes

The production database init script runs **only on empty MariaDB volumes**. The runtime account receives SELECT/INSERT/UPDATE/DELETE on the application schema. A distinct non-root migration account receives schema-level ALL PRIVILEGES without GRANT OPTION, allowing Prisma migrations and explicit seed. Neither gets global privileges or production shadow-database privileges. The migration service uses MIGRATION_DATABASE_URL; web/background use DATABASE_URL. Keep migration/root settings out of application containers. [MariaDB privilege reference](https://mariadb.com/docs/server/reference/sql-statements/account-management-sql-statements/grant)

For an existing installation:

1. Complete and verify the backup/recovery procedure. Keep the Compose project name and existing volume mapping unchanged. Preserve current valid credentials in a protected rollback configuration; never initialize a new volume to solve an authentication failure.
2. Stop scheduler, app and background. Update the private environment and MariaDB container configuration with distinct role settings, retaining its existing root/runtime passwords for the role transition. Changing initialization environment variables does not change passwords inside an existing volume. Confirm actual database/account names and existing account host entries (`SELECT User, Host FROM mysql.user` in a protected root session). Supported generated names use letters, digits and underscores.
3. Recreate only db with the updated configuration and existing volume. To explicitly apply role grants using the **current working root password**, run:

   ```sh
   docker compose -f docker-compose-prod.yml --env-file /secure/hmv.env exec -T db bash -ec 'docker_process_sql() { MYSQL_PWD="$MARIADB_ROOT_PASSWORD" mariadb --user=root; }; source /docker-entrypoint-initdb.d/10-roles.sh'
   ```

   This creates the migration user if absent and replaces all runtime grants (including historical global/other-schema grants) with application-schema CRUD. It does not rotate an existing migration password or remove excess grants from an existing migration identity. Use a dedicated application account: any other uses of that runtime account lose access. Review SHOW GRANTS for the exact runtime/migration accounts and revoke any excess global/other-schema grants deliberately. Do not use a privileged historical account as runtime. Existing development volumes likewise require an explicit `_shadow` schema grant and switching DATABASE_URL away from root; never grant global CREATE/DROP merely for Prisma development.
4. Rotate exposed root/runtime/migration passwords through a protected administrator SQL session using `ALTER USER 'account'@'host' IDENTIFIED BY 'new-value'`, with the actual host entry and escaped SQL value. Disable client history for that session (`MYSQL_HISTFILE=/dev/null`), avoid terminal recording/logging and do not paste secrets into shell arguments. Use a new least-privilege runtime account for a controlled cutover when needed. Update the corresponding private environment values/URLs, recreate consumers and verify login/reads/writes. Coordinate root changes with backup tooling; keep a working admin session until new credentials are verified. Environment-only changes do not rotate server credentials.
5. Generate a new PROCESS_TOKEN and update background/scheduler together. Rotate APP_SESSION_SECRET across web/background together and expect re-login. Rotate an exposed bootstrap administrator password through the authenticated user-management flow: rerunning seed intentionally preserves existing passwords. Remove ADMIN_PASSWORD from the regular deployment environment after first bootstrap if it is no longer needed; supply it only for explicit seed jobs.
6. Run schema deployment with the migration identity, then start consumers. Verify runtime CRUD works and runtime CREATE/DROP is denied; migration must not access another schema. Check login and cookies through HTTPS, DB port bindings, scheduler operation and backup access. Record the cutover and discard exposed values from active configuration. Handle history cleanup separately if required; it never substitutes for rotation.

No deployed accounts, firewall/proxy configuration or existing volume grants are changed automatically. Before production use, complete actual credential rotation, historical grant review and the HTTPS check against your own proxy.

## Focused validation

```sh
docker compose run --rm --no-deps -v "$PWD:/workspace:ro" dependencies node --test /workspace/docker/test/security.test.mjs
```

`docker/test/security-roles.test.sh` is an integration check for an **isolated, seeded fixture database** with the production role/environment configuration. Feed it to `docker compose ... exec -T db sh`; it checks schema-only migration DDL, runtime CRUD and forbidden runtime/system/global DDL. It writes and removes fixture records and is not an operator check for a deployed database.

`docker/test/security-browser.test.mjs` runs inside a browser test container connected to an isolated app at `app:3000`. It requires installed Puppeteer/system Chrome, disposable ADMIN_EMAIL/ADMIN_PASSWORD, and a temporary self-signed TLS key/certificate mounted at `/tls/key.pem` and `/tls/cert.pem`. It starts local HTTPS/HTTP proxies on 3443/3080 and maps `secure.test` to loopback in Chrome, checking the same hostname over both protocols. Certificate verification is disabled only for that disposable test certificate. It checks session-cookie flags, document.cookie isolation, authenticated API access after reload and HTTP rejection. The isolated fixture setup/results are recorded in section 5 of the infrastructure review; this test does not verify a real deployment's certificate, proxy configuration or firewall.
