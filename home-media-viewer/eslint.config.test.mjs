import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { ESLint } from 'eslint';

const eslint = new ESLint({ cwd: fileURLToPath(new URL('.', import.meta.url)) });

async function messages(code, filePath) {
  const [result] = await eslint.lintText(code, { filePath });
  assert.equal(result.fatalErrorCount, 0, JSON.stringify(result.messages));
  return result.messages;
}

test('CommonJS scripts accept Node globals and require, and still detect undefined names', async () => {
  assert.deepEqual(await messages("const http = require('node:http'); module.exports = http;", 'startServer.cjs'), []);
  const diagnostics = await messages('module.exports = missingName;', 'startServer.cjs');
  assert.ok(diagnostics.some(({ ruleId, severity }) => ruleId === 'no-undef' && severity === 2));
});

test('TypeScript rules cover source, tests, Prisma, and module extensions', async () => {
  for (const file of ['src/probe.ts', '__tests__/probe.test.ts', 'prisma/probe.ts', 'probe.mts', 'probe.cts']) {
    const diagnostics = await messages('export const value: any = 1;', file);
    assert.ok(
      diagnostics.some(({ ruleId, severity }) => ruleId === '@typescript-eslint/no-explicit-any' && severity === 2),
      file,
    );
    assert.ok(!diagnostics.some(({ ruleId }) => ruleId === 'no-undef'), file);
  }
});

test('React accepts the automatic JSX runtime and detects conditional hooks', async () => {
  assert.deepEqual(await messages('export function Example() { return <div />; }', 'src/components/probe.tsx'), []);
  const diagnostics = await messages(
    "import { useEffect } from 'react'; export function Example({ enabled }: { enabled: boolean }) { if (enabled) { useEffect(() => {}, []); } return <div />; }",
    'src/components/probe.tsx',
  );
  assert.ok(diagnostics.some(({ ruleId, severity }) => ruleId === 'react-hooks/rules-of-hooks' && severity === 2));
});

test('React reports missing effect dependencies', async () => {
  const diagnostics = await messages(
    "import { useEffect } from 'react'; export function Example({ value }: { value: string }) { useEffect(() => { console.log(value); }, []); return <div />; }",
    'src/components/probe.tsx',
  );
  assert.ok(diagnostics.some(({ ruleId }) => ruleId === 'react-hooks/exhaustive-deps'));
});

test('generated files and coverage are ignored', async () => {
  for (const file of ['.next/probe.ts', 'out/probe.js', 'build/probe.js', 'coverage/probe.js', 'next-env.d.ts']) {
    assert.equal(await eslint.isPathIgnored(file), true, file);
  }
});
