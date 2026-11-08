// Task-network-only CDP bridge. No host ports; removed with the isolated Compose project.
const http = require('node:http');
const net = require('node:net');
const puppeteer = require('/app/node_modules/puppeteer');
let browser;
let server;
(async () => {
  browser = await puppeteer.launch({
    executablePath: '/usr/bin/chromium',
    headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--autoplay-policy=no-user-gesture-required'],
  });
  const upstream = new URL(browser.wsEndpoint());
  server = http.createServer(async (req, res) => {
    try {
      const response = await fetch(`http://127.0.0.1:${upstream.port}${req.url}`);
      const json = await response.json();
      if (json.webSocketDebuggerUrl)
        json.webSocketDebuggerUrl = browser.wsEndpoint().replace(`127.0.0.1:${upstream.port}`, 'browser:9223');
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(json));
    } catch {
      res.writeHead(503).end();
    }
  });
  server.on('upgrade', (req, socket, head) => {
    const target = net.connect(Number(upstream.port), '127.0.0.1', () => {
      const headers = Object.entries({ ...req.headers, host: `127.0.0.1:${upstream.port}` })
        .map(([key, value]) => `${key}: ${value}`)
        .join('\r\n');
      target.write(`${req.method} ${req.url} HTTP/1.1\r\n${headers}\r\n\r\n`);
      if (head.length) target.write(head);
      target.pipe(socket);
      socket.pipe(target);
    });
    target.on('error', () => socket.destroy());
    socket.on('error', () => target.destroy());
    socket.on('close', () => target.destroy());
  });
  server.listen(9223, '0.0.0.0');
})().catch(() => {
  console.error('Task Chromium startup failed');
  process.exitCode = 1;
});
process.on('SIGTERM', async () => {
  if (browser) await browser.close();
  if (server) server.close();
  process.exit(0);
});
