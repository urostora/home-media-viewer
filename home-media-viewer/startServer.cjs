const http = require('node:http');
const originalListen = http.Server.prototype.listen;
process.env.NEXT_MANUAL_SIG_HANDLE = 'true';
let shuttingDown = false;
const servers = new Set();
http.Server.prototype.listen = function (...args) {
  servers.add(this);
  return originalListen.apply(this, args);
};
function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  process.env.HMV_SHUTTING_DOWN = '1';
  console.log('Shutdown: draining HTTP requests and stopping media tools');
  const deadline = setTimeout(() => process.exit(1), 170_000);
  deadline.unref();
  Promise.all([...servers].map(server => new Promise(resolve => {
    server.close(resolve);
    server.closeIdleConnections();
  }))).then(() => {
    console.log('Shutdown: HTTP requests drained');
    process.exit(0);
  });
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
require('./server.js');
