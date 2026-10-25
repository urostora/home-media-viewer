const assert = require('node:assert/strict');
const { mkdtemp, copyFile, writeFile, rm } = require('node:fs/promises');
const { spawn } = require('node:child_process');
const path = require('node:path');
const os = require('node:os');
(async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'hmv-drain-'));
  let child;
  try {
    await copyFile(path.join(__dirname, '../../home-media-viewer/startServer.cjs'), path.join(directory, 'startServer.cjs'));
    await writeFile(path.join(directory, 'server.js'), `
      require('node:http').createServer((req, res) => {
        console.log('accepted');
        setTimeout(() => res.end('drained'), 300);
      }).listen(0, '127.0.0.1', function() { console.log('port=' + this.address().port); });
    `);
    child = spawn(process.execPath, ['startServer.cjs'], { cwd: directory, stdio: ['ignore', 'pipe', 'inherit'] });
    const exited = new Promise(resolve => child.on('exit', code => resolve(code)));
    let output = '';
    const port = await new Promise(resolve => child.stdout.on('data', data => {
      output += data;
      const match = output.match(/port=(\d+)/);
      if (match) resolve(Number(match[1]));
    }));
    const response = fetch(`http://127.0.0.1:${port}`);
    await new Promise(resolve => {
      if (output.includes('accepted')) resolve();
      else child.stdout.on('data', () => { if (output.includes('accepted')) resolve(); });
    });
    child.kill('SIGTERM');
    assert.equal(await (await response).text(), 'drained');
    assert.equal(await exited, 0);
    assert.match(output, /HTTP requests drained/);
    console.log('Shutdown launcher drains accepted requests after SIGTERM and exits zero');
  } finally {
    if (child?.exitCode === null) child.kill('SIGKILL');
    await rm(directory, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
