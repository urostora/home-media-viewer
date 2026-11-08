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

## Current account authority

Login requires an Active account. The sealed browser cookie contains a version and a cryptographically random session token, with no user ID or role claim. Only its SHA-256 digest is stored in the `AuthSession` table. Every protected browser API checks that record and resolves the current Active account/role before executing its handler, including thumbnail delivery, `/api/hello` and administrator processing requests. Legacy user/admin-only cookies are rejected at cutover. The proxy performs only a preliminary token-format check; handlers independently enforce database authority.

Sessions have a fixed fourteen-day absolute limit and a sliding twenty-four-hour idle limit. Authenticated API requests, including `/api/me`, refresh idle expiry within the absolute limit. Login and `/api/me` report the actual effective expiry and remaining seconds. Closing a tab does not revoke its session. Missing, revoked, expired or inactive sessions receive a generic 403; handler denials remove the cookie. Database failures return a safe 503, preserve the cookie and do not execute the protected handler. Health and machine Bearer endpoints retain their separate policies.

Logout revokes only the presented session. Password changes and actual status/role changes in either direction revoke every session for that account and increment its session generation in the same transaction. Reactivation or a subsequent promotion cannot revive those old cookies. Ordinary name/email edits preserve sessions. `POST /api/session/revoke-all` explicitly revokes all of the current account's sessions; it accepts no target account from the request body. Administrator user updates provide administrative revocation through password/status/role changes. Physical account deletion cascades to its session records.

Session issue, authorization/activity updates and revocation lock the account row before session rows. Authorization uses a shared account lock and an exclusive lock on its session, so separate sessions on the same account can refresh concurrently; issue/revocation/account changes retain exclusive account locks. Every request still persists activity to preserve the exact sliding idle timeout; no refresh batching or positive authorization cache is used. Login rechecks the verified password hash/generation after acquiring that lock, preventing issuance from an obsolete password verification. Requests authorized before a revocation may finish; requests authorized after it commits fail. Locks are released before protected handlers stream media or perform their work. Apply account security changes through application operations; direct operator SQL must also increment the account generation and revoke its sessions atomically. A successful login attempts a cleanup batch of at most 100 expired/revoked records, rechecking expiry during deletion so a concurrent valid idle refresh is preserved. Cleanup failures are safely logged and do not invalidate a successful login.

Browser identity is restored from uncached `/api/me` responses on load and rechecked after client API 401/403 responses, window focus and cross-tab authentication notifications. Editable display cookies are removed and never grant UI authority. A resource-only 403 triggers an identity recheck rather than falsely ending a valid session. If browser storage is unavailable, focus/API revalidation still works.

The Logout button sends POST `/api/logout`, waits for a successful confirmation and then removes the displayed identity. Other methods return 405 without destroying the cookie. Pending logout disables repeat clicks; failed requests preserve the displayed identity and offer retry because logout has not been confirmed. Successful logout revokes the server record before removing this browser's HttpOnly cookie and notifying other tabs to recheck identity; a retained copy of that cookie also fails. If revocation fails, the server returns 503 without clearing the cookie or claiming logout. A new successful login also revokes the browser's previous session. Full CSRF/origin policy and recent-authentication/MFA requirements remain separate tasks.

Original-file and direct thumbnail endpoints share a current-principal file permission query. Deleted files are denied for both roles; readers require membership in at least one non-Deleted album containing the file. Membership removal denies subsequent server requests for both representations. Administrators retain global access to non-Deleted files. Disabled file/album behavior remains readable pending the full resource-status policy review. Missing and inaccessible resources use the same generic 404; malformed file identifiers or thumbnail parameters return 400 without filesystem access.

Thumbnail requests accept UUID identifiers and exactly the sizes `200`, `600` and `1280`. Paths are resolved from the database's canonical file ID only after authorization, and real-path checks reject symlinks outside thumbnail storage. Missing previews, directories and escaped paths return 404. Read paths do not create thumbnail directories; generation keeps its existing directory layout. Direct originals and thumbnails use `Cache-Control: private, no-cache` and `Vary: Cookie`; unchanged content can return 304 only after current authorization. Opaque weak ETags use same-handle file metadata, including nanosecond modification/change times, without hashing entire videos. Last-Modified has second precision. These validators do not prove byte identity for partial recombination: If-Range conservatively falls back to a full 200 response. Existing downloaded copies are not purged, and old responses may retain their former freshness until expiry. Embedded-preview/JSON response minimization remains separate remediation work.

## Login abuse controls and client addresses

Login accepts POST and uses MariaDB-backed budgets shared by every serving process: 60 admitted attempts per minute globally, 10 per minute per client, and 5 per five minutes per account. Counts reserve before bcrypt, including concurrent and successful attempts. Rejections never extend an existing window or disable the user; after its fixed window the budget recovers. Responses use generic 429 with numeric Retry-After (1–300 seconds), or safe 503 if storage/configuration is unavailable. The UI shows retry feedback. Admission failures preserve existing browser sessions.

Every process immediately rejects more than two in-flight login requests, and two database work permits cap bcrypt globally across replicas; requests do not queue for a permit. Session issuance retains the locked T6 credential/generation recheck. Password verification does one actual comparison for admitted unknown, inactive and wrong-password cases: unknown/malformed stored hashes use a precomputed cost-10 dummy, inactive accounts compare their real hash before generic denial. Application-created hashes use cost 10; pre-existing valid hashes keep their original work factor. Only bcrypt's existing 72-byte input prefix is verified, preserving exact legacy UTF-8 truncation behavior rather than adding a low password-length cutoff. The existing 1 MiB JSON-body bound remains; email is bounded at 1024 UTF-8 bytes, above the existing database column capacity. New password policy/hash migration remains separate work.

Existing-account budgets use the database-resolved user ID, so aliases that compare equal under MariaDB's unique email collation share a budget. Unknown-address normalization affects only limiting, never authentication identity. Client/account keys are HMAC digests using the existing shared session secret; do not use different secrets across replicas. Fixed success/failure/limited/unavailable events contain no raw email, IP, passwords, hashes, tokens or request bodies. Every admitted request, including a failed login, removes up to 20 budget rows whose windows ended over an hour ago; bounded admission limits new-key growth. Row expiry does not grant access, and cleanup never deletes an active renewed window.

Direct access is the default: only the socket peer determines the client. IPv4-mapped IPv6 is normalized to IPv4; IPv6 interfaces in a /64 share one budget. Forwarded headers are ignored unless both environment settings are configured:

```dotenv
LOGIN_TRUST_FORWARDED_HEADERS=true
LOGIN_TRUSTED_PROXY_CIDRS=192.0.2.10/32,2001:db8:1234::/48
```

These addresses are documentation examples; set the actual proxy peers visible to the app. Enabled forwarding without a valid explicit allowlist fails closed. When the socket peer is trusted, the app examines X-Forwarded-For from right to left, discarding explicitly trusted hops and stopping at the first untrusted address. X-Real-IP is accepted as a single-address fallback when X-Forwarded-For is absent. Other forwarding headers are ignored. An untrusted socket peer cannot select its identity through either header. Missing/malformed attribution uses a conservative shared budget. A trusted proxy must overwrite/append these headers correctly; never allow every source merely to make headers work. All serving Compose configurations pass these variables; restart/recreate the service after changing environment settings. Keep both disabled/empty for direct development access.

Work permits deliberately have no timed expiry: cancelling a promise or expiring a lease does not prove native bcrypt CPU work stopped. Normal requests release their exact ownership claim after work really finishes, including credential rejection. A crashed process or a failed release can leave a slot occupied, reducing login capacity until recovery. **Before clearing occupied slots, stop every app/background process that can serve login and verify no old worker can still run.** In a protected database session, inspect `SELECT slot, owner, acquiredAt FROM LoginPermit`, then clear only confirmed stale slots (for a full stopped-service recovery: `UPDATE LoginPermit SET owner = NULL, acquiredAt = NULL WHERE owner IS NOT NULL`). Restart the serving processes afterward. Never recycle a slot from timestamps alone or clear live permits during ordinary operation. This availability tradeoff preserves the global concurrency bound; this is not automatic crash recovery.

Apply additive migration `20261101140000_login_abuse_controls` and generate the updated Prisma client before deploying login consumers. It seeds one global budget row and two free work slots; existing users and sessions are preserved. Back up normally and use the migration identity. No account/password reset or volume reset is required. Admin MFA and recent-authentication prompts were explicitly deferred to a separate follow-up; they are not enforced by these controls. Origin/CSRF hardening remains T8. These budgets bound application login work, not arbitrary transport-level traffic.

## Revocable-session migration and cutover

Back up using the existing recovery procedure before deploying this change. Build all consumers with the updated Prisma schema/client. Apply the additive `20261101120000_revocable_sessions` migration using the migration identity, then deploy app/background together. It adds `User.sessionVersion` and `AuthSession`; no existing accounts, passwords, media or shared volumes are reset. Runtime database permissions must permit session SELECT/INSERT/UPDATE/DELETE; schema changes belong to the migration identity.

Users must log in once after cutover because legacy seals are rejected. Keep the additive schema during rollback; do not expose earlier code that accepts legacy cookies, since that would bypass revocation. Session-secret rotation remains an emergency way to reject all cookies and requires coordinated re-login; newly inaccessible records age out through bounded cleanup. Apply the migration and regenerate the client in the development environment too before testing that environment's login; isolated remediation validation does not migrate the shared development database.

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

## Credential-safe error logging and historical exposure

API failures use the shared `src/utils/apiLogger.ts` allowlist: event, constant task label, HTTP status, error category, supported Prisma error code and explicitly selected UUID identifiers. Unknown fields and all nested context are omitted, including passwords/hashes, request headers, cookies, authorization tokens, connection strings and environment settings. Raw exception messages, stacks, causes and custom serialization are not logged: database errors may contain submitted values. Login success records its event and user UUID, without name/email or session contents; administrator bootstrap failures use the same safe logger. Do not pass request values as task labels or bypass the logger to diagnose credential flows. Extend diagnostic fields only after checking their data origin and adding disclosure tests.

Only deliberately public `HmvError` messages are returned to API clients. Keep these messages free of submitted credentials; validation messages describe the field and rule without echoing values. Ordinary exception messages and plain objects with a `publicError` property are not exposed. Do not restore raw exception logging to obtain more detailed diagnostics; reproduce failures using synthetic inputs in an isolated environment.

Older user create/update failures could log plaintext submitted passwords, including failures such as duplicate users. Deploying the logging fix does not erase retained logs or rotate credentials. The deployment owner should assess historical exposure privately:

1. Identify affected deployment versions/time windows and log destinations (container logging, host collection, external aggregation, exports and backups). Restrict access to potentially affected records. Do not paste them into tickets, this repository, terminal recordings or task artifacts.
2. In an approved private environment, inspect only the necessary records for failed user-create/update events and validation/database errors. Record the event window and affected account identifiers, never the submitted passwords. Include failed account creation: the password may have been reused elsewhere even though no account was created.
3. For confirmed or reasonably suspected exposure, reset affected credentials through the supported account-management process, coordinate with account owners about reuse, and invalidate relevant sessions. Password changes alone currently do not revoke existing sealed sessions; until per-session revocation is implemented, coordinate global `APP_SESSION_SECRET` rotation across app/background when revocation is necessary. This signs everyone out. Rotate process/database secrets only if evidence indicates those values were also exposed.
4. Have the owner of each logging/backup system apply its approved retention, deletion or access-restriction procedure, preserving required incident evidence privately. Do not broadly delete Docker logs, shared volumes or backups as an application cleanup step. Verify new synthetic failure events contain only safe fields and record completion without secret values.

No historical log inspection, credential rotation or session invalidation is performed automatically by the code fix or its tests.

## Focused validation

```sh
docker compose run --rm --no-deps -v "$PWD:/workspace:ro" dependencies node --test /workspace/docker/test/security.test.mjs
```

`docker/test/security-roles.test.sh` is an integration check for an **isolated, seeded fixture database** with the production role/environment configuration. Feed it to `docker compose ... exec -T db sh`; it checks schema-only migration DDL, runtime CRUD and forbidden runtime/system/global DDL. It writes and removes fixture records and is not an operator check for a deployed database.

`docker/test/security-browser.test.mjs` runs inside a browser test container connected to an isolated app at `app:3000`. It requires installed Puppeteer/system Chromium, disposable ADMIN_EMAIL/ADMIN_PASSWORD, and a temporary self-signed TLS key/certificate mounted at `/tls/key.pem` and `/tls/cert.pem`. It starts local HTTPS/HTTP proxies on 3443/3080 and maps `secure.test` to loopback in Chromium, checking the same hostname over both protocols. Certificate verification is disabled only for that disposable test certificate. It checks session-cookie flags, document.cookie isolation, authenticated API access after reload and HTTP rejection. Use a separate Compose project and disposable database/storage for this check; it does not verify a real deployment's certificate, proxy configuration or firewall.
