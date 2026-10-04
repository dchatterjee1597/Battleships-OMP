import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { unstable_dev } from 'wrangler';

// Own the runtime outside Playwright's module loader and Windows shell teardown.
const worker = await unstable_dev('src/server/index.ts', {
  config: 'tests/wrangler.jsonc',
  ip: '127.0.0.1',
  port: 0,
  inspectorPort: 0,
  local: true,
  persist: true,
  persistTo: `.wrangler/e2e-${randomUUID()}`,
  logLevel: 'error',
  experimental: { disableExperimentalWarning: true, disableDevRegistry: true, watch: false },
});
try {
  console.log('Local browser-test Worker ready.');
  const child = spawn(
    process.execPath,
    ['node_modules/@playwright/test/cli.js', 'test', ...process.argv.slice(2)],
    {
      stdio: 'inherit',
      windowsHide: true,
      env: {
        ...process.env,
        BATTLESHIPS_TEST_URL: `http://${worker.address}:${worker.port}`,
        BATTLESHIPS_TEST_OUTPUT: `test-results/run-${Date.now()}`,
      },
    },
  );
  process.exitCode = await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code) => resolve(code ?? 1));
  });
} finally {
  await worker.stop();
}
