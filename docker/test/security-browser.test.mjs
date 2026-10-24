import assert from "node:assert/strict";
import https from "node:https";
import http from "node:http";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire("/home/node/app/package.json");
const puppeteer = require("puppeteer");
const handler = (req, res) => {
  const upstream = http.request(
    {
      hostname: "app",
      port: 3000,
      path: req.url,
      method: req.method,
      headers: { ...req.headers, "x-forwarded-proto": "https" },
    },
    (response) => {
      res.writeHead(response.statusCode, response.headers);
      response.pipe(res);
    },
  );
  upstream.on("error", () => {
    res.writeHead(502);
    res.end();
  });
  req.pipe(upstream);
};
const proxy = https.createServer(
  { key: readFileSync("/tls/key.pem"), cert: readFileSync("/tls/cert.pem") },
  handler,
);
const plain = http.createServer(handler);
await new Promise((resolve) => plain.listen(3080, resolve));
await new Promise((resolve) => proxy.listen(3443, resolve));
let browser;
try {
  for (let i = 0; ; i++) {
    try {
      if ((await fetch("http://app:3000")).status === 200) break;
    } catch {}
    assert(i < 59, "Application readiness timed out");
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  browser = await puppeteer.launch({
    headless: "new",
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || "/usr/bin/chromium",
    args: [
      "--no-sandbox",
      "--disable-dev-shm-usage",
      "--ignore-certificate-errors",
      "--host-resolver-rules=MAP secure.test 127.0.0.1",
      "--no-proxy-server",
    ],
    ignoreHTTPSErrors: true,
  });
  const page = await browser.newPage();
  await page.goto("https://secure.test:3443");
  const credentials = {
    email: process.env.ADMIN_EMAIL,
    password: process.env.ADMIN_PASSWORD,
  };
  async function login() {
    return page.evaluate(async (credentials) => {
      const response = await fetch("/api/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(credentials),
      });
      return { status: response.status, body: await response.json() };
    }, credentials);
  }
  let result = await login();
  assert.equal(result.status, 200);
  assert.equal(result.body.ok, true);
  const cookie = (await page.cookies()).find(
    (cookie) => cookie.name === "home-media-viewer-user-cookie",
  );
  assert(cookie);
  assert.equal(cookie.secure, true);
  assert.equal(cookie.httpOnly, true);
  assert.equal(cookie.sameSite, "Lax");
  assert(
    !(await page.evaluate(() => document.cookie)).includes(
      "home-media-viewer-user-cookie",
    ),
  );
  await page.reload();
  const me = await page.evaluate(async () => ({
    status: (await fetch("/api/me")).status,
    albums: await (
      await fetch("/api/album/search", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      })
    ).json(),
  }));
  assert.equal(me.status, 200);
  assert.equal(me.albums.ok, true);
  // An ordinary HTTP service origin is not a localhost secure-context exception.
  await page.goto("http://secure.test:3080");
  result = await login();
  assert.equal(result.body.ok, true);
  assert(
    !(await page.cookies()).some(
      (cookie) => cookie.name === "home-media-viewer-user-cookie",
    ),
  );
  const unauthenticated = await page.evaluate(async () => {
    const r = await fetch("/api/album/search", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
      redirect: "manual",
    });
    return r.status;
  });
  assert.notEqual(unauthenticated, 200);
  console.log(
    "HTTPS browser checks passed: Secure/HttpOnly/SameSite, hidden document.cookie, reload/API session, HTTP rejection.",
  );
} finally {
  if (browser) await browser.close();
  await new Promise((resolve) => proxy.close(resolve));
  await new Promise((resolve) => plain.close(resolve));
}
