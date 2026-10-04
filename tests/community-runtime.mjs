// Isolated real Worker / SQLite / WebSocket tests, including a real 90-second alarm.
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { unstable_dev } from 'wrangler';
import WebSocket from 'ws';

const persistTo = `.wrangler/community-${randomUUID()}`;
const options = {
  ip: '127.0.0.1',
  port: 0,
  inspectorPort: 0,
  local: true,
  persist: true,
  persistTo,
  logLevel: 'error',
  experimental: { disableExperimentalWarning: true, disableDevRegistry: true, watch: false },
};
let worker;
let origin;
const sockets = [];
const ids = ['carrier', 'battleship', 'cruiser', 'submarine', 'destroyer'];
const fleet = ids.map((id, y) => ({ id, x: 0, y, vertical: false }));
const credentials = Array.from({ length: 300 }, (_, i) => (i + 1).toString(16).padStart(64, '0'));
const hash = (value) => createHash('sha256').update(value).digest('hex');
const legacy = {
  version: 30,
  notice: '',
  challenges: [],
  users: credentials.map((key, i) => ({
    id: `u${i}`,
    name: `Runtime ${i}`,
    status: 'approved',
    credentialHash: hash(key),
    ready: true,
    connection: i < 2 ? `old${i}` : null,
    created: 1,
  })),
  match: {
    id: 'legacy-match',
    players: ['u0', 'u1'],
    phase: 'playing',
    turn: 'u0',
    revision: 2,
    boards: Object.fromEntries(
      ['u0', 'u1'].map((id) => [id, { fleet, shots: [], turns: 0, cooldown: 2 }]),
    ),
    events: ['Legacy match restored.'],
  },
};

async function start(fixture = false) {
  worker = await unstable_dev(fixture ? 'tests/fixtures/legacy-room.ts' : 'src/server/index.ts', {
    ...options,
    config: fixture ? 'tests/legacy.wrangler.jsonc' : 'tests/wrangler.jsonc',
  });
  origin = `http://${worker.address}:${worker.port}`;
}
async function stop() {
  for (const client of sockets) client.ws.terminate();
  sockets.length = 0;
  await worker?.stop();
}
async function api(path, data, cookie = '', status = 200) {
  const response = await fetch(`${origin}/api${path}`, {
    method: data === undefined ? 'GET' : 'POST',
    headers: { Origin: origin, Cookie: cookie, 'Content-Type': 'application/json' },
    ...(data === undefined ? {} : { body: JSON.stringify(data) }),
  });
  assert.equal(response.status, status, `${path}: ${response.status}`);
  return { data: await response.json(), cookie: response.headers.get('set-cookie')?.split(';')[0] };
}
const cookie = (i) => `tideline_device=${credentials[i]}`;
async function until(fn, timeout = 8000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (fn()) return;
    await delay(30);
  }
  throw new Error(`Condition did not arrive within ${timeout}ms`);
}
async function open(i, expected = 101) {
  const client = {
    ws: new WebSocket(origin.replace('http:', 'ws:') + '/api/ws', {
      headers: { Origin: origin, Cookie: cookie(i) },
    }),
    messages: [],
    state: null,
  };
  const rejected = new Promise((resolve, reject) => {
    client.ws.on('unexpected-response', (_request, response) => {
      response.resume();
      resolve(response.statusCode);
      client.ws.terminate();
    });
    client.ws.on('error', (error) => {
      if (expected === 101) reject(error);
    });
    client.ws.on('message', (raw) => {
      const message = JSON.parse(String(raw));
      client.messages.push(message);
      if (message.type === 'snapshot') client.state = message;
    });
    client.ws.on('open', () => resolve(101));
  });
  assert.equal(await rejected, expected);
  if (expected !== 101) return client;
  sockets.push(client);
  await until(() => client.state);
  return client;
}
async function command(client, action, error = false) {
  const offset = client.messages.length;
  client.ws.send(JSON.stringify(action));
  await until(() =>
    client.messages.slice(offset).some((m) => m.type === (error ? 'error' : 'snapshot')),
  );
  if (!error)
    assert.equal(
      client.messages.slice(offset).some((m) => m.type === 'error'),
      false,
      JSON.stringify(client.messages.slice(offset)),
    );
}
async function match(a, b) {
  await command(a, { type: 'challenge', target: b.state.me.id });
  await until(() => b.state.challenges.length);
  await command(b, { type: 'respond', challenge: b.state.challenges[0].id, accept: true });
  const id = b.state.match.id;
  await command(a, { type: 'fleet', match: id, fleet });
  await command(b, { type: 'fleet', match: id, fleet });
  return id;
}

try {
  await start(true);
  const seeded = await fetch(origin, { method: 'POST', body: JSON.stringify(legacy) });
  assert.equal(seeded.status, 200);
  await stop();
  await start();
  const admin = await api('/admin/login', { passphrase: 'local-test-admin-not-for-production' });
  assert.equal((await api('/admin/users', undefined, admin.cookie)).data.users.length, 300);
  const people = [];
  for (let i = 0; i < 25; i++) people.push(await open(i));
  assert.equal(people[0].state.match.id, 'legacy-match');
  await until(() => Object.keys(people[0].state.match.disconnected).length === 0);
  assert.deepEqual(people[0].state.match.boards[0].fleet, fleet);
  assert.equal(people[0].state.match.boards[1].fleet, undefined);
  assert.equal((await api('/session', undefined, cookie(25))).data.capacity.canConnect, false);
  await open(25, 429);
  people[0].ws.close();
  await until(() => people[1].state.match.disconnected.u0);
  assert.equal((await api('/session', undefined, cookie(25))).data.capacity.canConnect, false);
  people[0] = await open(0);
  const old = people[1];
  people[1] = await open(1);
  await until(() => old.messages.some((m) => m.type === 'superseded'));
  old.ws.close();
  assert.deepEqual(people[1].state.match.disconnected, {});
  const a = 'legacy-match';
  const b = await match(people[2], people[3]);
  await match(people[4], people[5]);
  await match(people[6], people[7]);
  await command(people[8], { type: 'challenge', target: 'u9' }, true);
  await command(people[8], { type: 'spectate', match: a });
  await command(people[9], { type: 'spectate', match: b });
  await command(
    people[0],
    { type: 'fire', match: b, revision: people[2].state.match.revision, targets: [0] },
    true,
  );
  await delay(100);
  const otherCount = people[9].messages.length;
  await command(people[0], {
    type: 'fire',
    match: a,
    revision: people[0].state.match.revision,
    targets: [0],
  });
  await delay(200);
  assert.equal(
    people[9].messages.length,
    otherCount,
    'Other match spectator received an unrelated shot update',
  );
  assert.equal(
    people[8].state.match.boards.some((board) => board.fleet),
    false,
  );
  assert.equal(people[10].state.match, null);
  await command(people[8], { type: 'leaveSpectating' });
  await command(people[8], { type: 'spectate', match: b });
  people[0].ws.close();
  await until(() => people[1].state.match.disconnected.u0);
  const deadline = people[1].state.match.disconnected.u0;
  const frozenB = structuredClone(people[2].state.match);
  console.log(
    'PASS: legacy conversion, 300 approvals, admission/takeover, four matches and wire isolation. Waiting for the real 90-second alarm.',
  );
  await until(() => people[1].state.match?.phase === 'finished', 100_000);
  assert.ok(Date.now() >= deadline, 'Forfeit happened before the deadline');
  assert.equal(people[1].state.match.winner, 'u1');
  assert.deepEqual(people[2].state.match, frozenB);
  await command(people[1], { type: 'lobby', match: a });
  people[25] = await open(25);
  assert.equal(people[25].state.capacity.used, 25);
  // Restore a live second match across an actual Worker restart, retaining its grace deadline.
  people[2].ws.close();
  await until(() => people[3].state.match.disconnected.u2);
  const restartDeadline = people[3].state.match.disconnected.u2;
  await stop();
  await start();
  assert.equal((await api('/admin/users', undefined, admin.cookie)).data.users.length, 300);
  const resumed2 = await open(2);
  assert.equal(resumed2.state.match.id, b);
  const resumed3 = await open(3);
  await until(() => Object.keys(resumed3.state.match.disconnected).length === 0);
  assert.deepEqual(
    resumed3.state.match.boards,
    frozenB.boards.map((board) => {
      const { fleet: _fleet, ...publicBoard } = board;
      return board.player === 'u3' ? { ...publicBoard, fleet } : publicBoard;
    }),
  );
  assert.ok(Date.now() < restartDeadline);
  await api('/admin/decision', { id: 'u2', action: 'revoke' }, admin.cookie);
  await until(() => resumed3.state.match.phase === 'finished');
  assert.equal(resumed3.state.match.winner, 'u3');
  await stop();
  await start(true);
  const rows = await (await fetch(origin)).json();
  assert.equal(rows.length, 2);
  assert.deepEqual(JSON.parse(rows.find((row) => row.id === 2).value), legacy);
  const stored = JSON.parse(rows.find((row) => row.id === 1).value);
  assert.equal(stored.schemaVersion, 2);
  assert.equal(stored.users.find((user) => user.id === 'u2').status, 'revoked');
  console.log(
    'PASS: real timeout, match-local cleanup, recovery across restart, immediate revocation and immutable legacy backup.',
  );
} finally {
  await stop();
}
