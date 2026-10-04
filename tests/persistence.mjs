// Real runtime restart test; no mocked storage or test-only application endpoints.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { unstable_dev } from 'wrangler';

const options = {
  config: 'tests/wrangler.jsonc',
  ip: '127.0.0.1',
  port: 0,
  inspectorPort: 0,
  local: true,
  persist: true,
  persistTo: `.wrangler/persistence-${randomUUID()}`,
  logLevel: 'error',
  experimental: { disableExperimentalWarning: true, disableDevRegistry: true, watch: false },
};
let worker;
async function start() {
  worker = await unstable_dev('src/server/index.ts', options);
}
async function call(path, data, cookie = '') {
  const origin = `http://${worker.address}:${worker.port}`;
  const response = await fetch(`${origin}/api${path}`, {
    method: data === undefined ? 'GET' : 'POST',
    headers: { Origin: origin, Cookie: cookie, 'Content-Type': 'application/json' },
    ...(data === undefined ? {} : { body: JSON.stringify(data) }),
  });
  assert.equal(response.status, 200, `Unexpected status at ${path}`);
  return { data: await response.json(), cookie: response.headers.get('set-cookie')?.split(';')[0] };
}
try {
  await start();
  const admin = await call('/admin/login', { passphrase: 'local-test-admin-not-for-production' });
  const device = await call('/join', {
    name: 'Persistence captain',
    invite: 'local-test-invite-not-for-production-1234',
  });
  const pending = await call('/session', undefined, device.cookie);
  assert.equal(pending.data.user.status, 'pending');
  await call('/admin/decision', { id: pending.data.user.id, action: 'approve' }, admin.cookie);
  await worker.stop();

  await start();
  const restored = await call('/session', undefined, device.cookie);
  assert.equal(restored.data.user.id, pending.data.user.id);
  assert.equal(restored.data.user.status, 'approved');
  const listing = await call('/admin/users', undefined, admin.cookie);
  assert.equal(listing.data.users[0].connected, false);
  assert.equal(JSON.stringify(listing.data).includes('credentialHash'), false);
  await call('/admin/decision', { id: pending.data.user.id, action: 'revoke' }, admin.cookie);
  await worker.stop();

  await start();
  const revoked = await call('/session', undefined, device.cookie);
  assert.equal(revoked.data.user.status, 'revoked');
  console.log(
    'PASS: approval, admin session, identity and revocation survive two real Worker restarts.',
  );
} finally {
  await worker?.stop();
}
