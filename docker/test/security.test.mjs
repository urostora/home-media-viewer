import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import vm from "node:vm";
import { validateProductionConfig } from "../../home-media-viewer/validateProductionConfig.mjs";

const require = createRequire(
  new URL("../../home-media-viewer/package.json", import.meta.url),
);
const ts = require("typescript");
const valid = {
  PROCESS_TOKEN: "process-token",
  APP_SESSION_SECRET: "a".repeat(64),
  DATABASE_URL: "mysql://runtime:password@db:3306/media",
};
function options(env) {
  const source = ts.transpileModule(
    readFileSync(
      new URL(
        "../../home-media-viewer/src/utils/sessionHelper.ts",
        import.meta.url,
      ),
      "utf8",
    ),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2020,
      },
    },
  ).outputText;
  const exports = {};
  vm.runInNewContext(source, { exports, require, process: { env } });
  return exports.getIronSessionOptions();
}
test("production configuration rejects absent, blank and invalid required values without disclosing them", () => {
  validateProductionConfig(valid);
  for (const key of Object.keys(valid)) {
    for (const value of [undefined, "", " "]) {
      assert.throws(() => validateProductionConfig({ ...valid, [key]: value }));
    }
  }
  for (const DATABASE_URL of [
    "mysql://root:secret@db/media",
    "mysql://%72oot:secret@db/media",
    "mysql://user:%20@db/media",
    "mysql://user@db/media",
    "mysql://user:secret@fixed-host/media",
    "secret-invalid-url",
  ]) {
    assert.throws(
      () => validateProductionConfig({ ...valid, DATABASE_URL }),
      (error) => !error.message.includes(DATABASE_URL),
    );
  }
  assert.throws(() =>
    validateProductionConfig({ ...valid, APP_SESSION_SECRET: "short" }),
  );
  assert.throws(() =>
    validateProductionConfig({ ...valid, SESSION_COOKIE_SECURE: "yes" }),
  );
});
test("scheduler validates its token without requiring database or session credentials", () => {
  validateProductionConfig({ PROCESS_TOKEN: "token" }, "scheduler");
  assert.throws(() =>
    validateProductionConfig({ PROCESS_TOKEN: " " }, "scheduler"),
  );
});
test("production cookies are HttpOnly, SameSite Lax and Secure regardless of Docker HOSTNAME", () => {
  for (const HOSTNAME of ["", "container-hostname", undefined]) {
    const result = options({
      NODE_ENV: "production",
      APP_SESSION_SECRET: valid.APP_SESSION_SECRET,
      HOSTNAME,
    });
    assert.equal(result.cookieOptions.httpOnly, true);
    assert.equal(result.cookieOptions.sameSite, "lax");
    assert.equal(result.cookieOptions.secure, true);
  }
});
test("HTTP development/test override is explicit and malformed settings fail", () => {
  assert.equal(
    options({
      NODE_ENV: "production",
      APP_SESSION_SECRET: valid.APP_SESSION_SECRET,
      SESSION_COOKIE_SECURE: "false",
    }).cookieOptions.secure,
    false,
  );
  assert.equal(
    options({
      NODE_ENV: "development",
      APP_SESSION_SECRET: valid.APP_SESSION_SECRET,
    }).cookieOptions.secure,
    false,
  );
  assert.throws(() => options({ NODE_ENV: "production" }));
  assert.throws(() =>
    options({ NODE_ENV: "production", APP_SESSION_SECRET: "short" }),
  );
  assert.throws(() => options({ SESSION_COOKIE_SECURE: "0" }));
});
