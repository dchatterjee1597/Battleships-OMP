import { describe, expect, it } from 'vitest';
import {
  applyAction,
  capacity,
  cleanExpired,
  connect,
  disconnect,
  initialState,
  playerMatch,
  reset,
  restoreState,
  revoke,
  snapshot,
  type RoomState,
  type LegacyState,
} from '../../src/server/engine';
import { SHIPS } from '../../src/shared/game';

function community(count = 12, online = count) {
  const s = initialState();
  s.users = Array.from({ length: count }, (_, i) => ({
    id: `u${i}`,
    name: `Captain ${i}`,
    status: 'approved' as const,
    credentialHash: `secret${i}`,
    ready: true,
    connection: i < online ? `c${i}` : null,
    created: 0,
  }));
  return s;
}
const fleet = SHIPS.map((ship, y) => ({ id: ship.id, x: 0, y, vertical: false }));
function start(s: RoomState, a = 'u0', b = 'u1', playing = true) {
  applyAction(s, a, { type: 'challenge', target: b }, 0);
  const challenge = s.challenges.find((c) => c.from === a)!;
  applyAction(s, b, { type: 'respond', challenge: challenge.id, accept: true }, 1, () => 0);
  const match = playerMatch(s, a)!;
  if (playing)
    for (const id of [a, b]) applyAction(s, id, { type: 'fleet', match: match.id, fleet }, 2);
  return match;
}

describe('independent community matches', () => {
  it('permits four matches, blocks a fifth, and releases finished capacity before cleanup', () => {
    const s = community();
    applyAction(s, 'u8', { type: 'challenge', target: 'u9' }, 0);
    const pending = s.challenges[0].id;
    const matches = Array.from({ length: 4 }, (_, i) => start(s, `u${i * 2}`, `u${i * 2 + 1}`));
    expect(() =>
      applyAction(s, 'u9', { type: 'respond', challenge: pending, accept: true }, 3),
    ).toThrow(/four/);
    expect(() => applyAction(s, 'u10', { type: 'challenge', target: 'u11' }, 3)).toThrow(/four/);
    applyAction(s, 'u0', { type: 'forfeit', match: matches[0].id }, 4);
    applyAction(s, 'u9', { type: 'respond', challenge: pending, accept: true }, 5);
    expect(Object.keys(s.matches)).toHaveLength(5);
    expect(snapshot(s, 'u10').matches).toHaveLength(4);
  });
  it('prevents shared-player and duplicate acceptance while preserving unrelated challenges', () => {
    const s = community();
    applyAction(s, 'u0', { type: 'challenge', target: 'u1' }, 0);
    applyAction(s, 'u2', { type: 'challenge', target: 'u1' }, 0);
    applyAction(s, 'u3', { type: 'challenge', target: 'u4' }, 0);
    const [one, two, independent] = s.challenges;
    applyAction(s, 'u1', { type: 'respond', challenge: one.id, accept: true }, 1);
    for (const challenge of [one, two])
      expect(() =>
        applyAction(s, 'u1', { type: 'respond', challenge: challenge.id, accept: true }, 2),
      ).toThrow();
    expect(s.challenges).toEqual([independent]);
    expect(() => applyAction(s, 'u1', { type: 'challenge', target: 'u5' }, 2)).toThrow();
  });
  it('isolates actions, secrecy, spectator routing, forfeit and cleanup', () => {
    const s = community();
    const a = start(s);
    const b = start(s, 'u2', 'u3');
    applyAction(s, 'u4', { type: 'spectate', match: a.id }, 3);
    applyAction(s, 'u5', { type: 'spectate', match: b.id }, 3);
    const beforeB = structuredClone(b);
    expect(() =>
      applyAction(s, 'u0', { type: 'fire', match: b.id, revision: b.revision, targets: [0] }, 4),
    ).toThrow(/Spectators/);
    applyAction(s, 'u0', { type: 'fire', match: a.id, revision: a.revision, targets: [0] }, 4);
    expect(b).toEqual(beforeB);
    expect(snapshot(s, 'u5').match!.events).not.toContain(a.events.at(-1));
    expect(snapshot(s, 'u6').match).toBeNull();
    for (const viewer of ['u4', 'u5'])
      expect(JSON.stringify(snapshot(s, viewer))).not.toMatch(
        /credentialHash|secret\d|"fleet"|"vertical"/,
      );
    expect(
      snapshot(s, 'u0')
        .match!.boards.filter((board) => board.fleet)
        .map((board) => board.player),
    ).toEqual(['u0']);
    disconnect(s, 'u0', 'c0', 5);
    cleanExpired(s, 90_005);
    expect(b).toEqual(beforeB);
    applyAction(s, 'u1', { type: 'lobby', match: a.id }, 90_006);
    expect(s.users[4].watching).toBeUndefined();
    expect(s.users[5].watching).toBe(b.id);
    expect(b).toEqual(beforeB);
  });
  it('spectators leave before switching or challenging and restore readiness', () => {
    const s = community();
    const a = start(s);
    const b = start(s, 'u2', 'u3');
    applyAction(s, 'u4', { type: 'ready', ready: false }, 2);
    applyAction(s, 'u5', { type: 'challenge', target: 'u6' }, 2);
    applyAction(s, 'u5', { type: 'spectate', match: a.id }, 3);
    expect(s.challenges).toHaveLength(0);
    applyAction(s, 'u4', { type: 'spectate', match: a.id }, 3);
    expect(snapshot(s, 'u6').users.find((u) => u.id === 'u5')).toMatchObject({
      activity: 'spectating',
      ready: false,
      matchId: a.id,
    });
    expect(() => applyAction(s, 'u5', { type: 'spectate', match: b.id }, 4)).toThrow(/lobby/);
    expect(() => applyAction(s, 'u6', { type: 'challenge', target: 'u5' }, 4)).toThrow();
    expect(() => applyAction(s, 'u5', { type: 'forfeit', match: a.id }, 4)).toThrow();
    applyAction(s, 'u5', { type: 'leaveSpectating' }, 4);
    expect(snapshot(s, 'u5').users.find((u) => u.id === 'u5')!.ready).toBe(true);
    applyAction(s, 'u5', { type: 'spectate', match: b.id }, 5);
    reset(s, a.id);
    expect(s.users[4].ready).toBe(false);
    expect(s.users[5].watching).toBe(b.id);
  });
});

describe('reconnect lifecycle', () => {
  for (const playing of [false, true])
    it(`restores ${playing ? 'combat' : 'placement'} without changing game state`, () => {
      const s = community();
      const m = start(s, 'u0', 'u1', playing);
      const before = structuredClone(m);
      disconnect(s, 'u0', 'c0', 100);
      expect(m.disconnected).toEqual({ u0: 90_100 });
      const action = playing
        ? { type: 'fire', match: m.id, revision: m.revision, targets: [99] }
        : { type: 'fleet', match: m.id, fleet };
      expect(() => applyAction(s, 'u1', action, 101)).toThrow(/paused/);
      disconnect(s, 'u0', 'c0', 500);
      expect(m.disconnected.u0).toBe(90_100);
      connect(s, 'u0', 'new', 90_099);
      expect(m).toEqual(before);
      disconnect(s, 'u0', 'c0', 90_100);
      cleanExpired(s, 90_100);
      expect(m).toEqual(before);
    });
  it('expires exactly at deadline, cannot revive a finished match, and is idempotent', () => {
    const s = community();
    const m = start(s);
    disconnect(s, 'u0', 'c0', 0);
    connect(s, 'u0', 'new', 90_000);
    expect(m).toMatchObject({ phase: 'finished', winner: 'u1', disconnected: {} });
    const before = structuredClone(m);
    cleanExpired(s, 90_001);
    cleanExpired(s, 90_001);
    expect(m).toEqual(before);
  });
  it('abandons if both are absent; one returning before expiry can win', () => {
    for (const returns of [false, true]) {
      const s = community();
      const m = start(s);
      disconnect(s, 'u0', 'c0', 100);
      disconnect(s, 'u1', 'c1', 200);
      if (returns) connect(s, 'u1', 'new', 90_000);
      cleanExpired(s, 90_100);
      expect(m.phase).toBe('finished');
      expect(m.winner).toBe(returns ? 'u1' : undefined);
      expect(m.disconnected).toEqual({});
    }
  });
  it('revocation of a disconnected captain and explicit forfeits are immediate', () => {
    const s = community();
    const a = start(s);
    const b = start(s, 'u2', 'u3');
    disconnect(s, 'u0', 'c0', 10);
    revoke(s, 'u0', 11);
    expect(a).toMatchObject({ phase: 'finished', winner: 'u1' });
    disconnect(s, 'u2', 'c2', 10);
    applyAction(s, 'u3', { type: 'forfeit', match: b.id }, 11);
    expect(b).toMatchObject({ phase: 'finished', winner: 'u2' });
  });
});

describe('admission and storage compatibility', () => {
  it('counts unique online users and reservations, allowing takeover and reserved return at 25', () => {
    const s = community(300, 25);
    const m = start(s);
    expect(capacity(s, 'u25')).toEqual({ used: 25, limit: 25, canConnect: false });
    expect(() => connect(s, 'u25', 'new', 3)).toThrow(/full/);
    connect(s, 'u1', 'takeover', 3);
    disconnect(s, 'u0', 'c0', 4);
    expect(capacity(s, 'u25').canConnect).toBe(false);
    expect(capacity(s, 'u0').canConnect).toBe(true);
    connect(s, 'u0', 'returned', 5);
    expect(capacity(s).used).toBe(25);
    disconnect(s, 'u0', 'returned', 6);
    cleanExpired(s, 90_006);
    expect(m.phase).toBe('finished');
    connect(s, 'u25', 'new', 90_007);
    expect(capacity(s).used).toBe(25);
    expect(s.users).toHaveLength(300);
    expect(snapshot(s, 'u25').users).toHaveLength(25);
  });
  it('upgrades legacy identity and match state once, preserving secrets and persisted deadlines', () => {
    const s = community();
    const m = start(s);
    const { disconnected: _, ...oldMatch } = m;
    const legacy: LegacyState = {
      version: 20,
      users: s.users,
      challenges: [],
      match: oldMatch,
      notice: 'Welcome',
    };
    const upgraded = restoreState(legacy);
    expect(upgraded.schemaVersion).toBe(2);
    expect(upgraded.users[0].credentialHash).toBe('secret0');
    expect(playerMatch(upgraded, 'u0')).toEqual(m);
    expect(restoreState(upgraded)).toEqual(upgraded);
    disconnect(upgraded, 'u0', 'c0', 100);
    const restored = restoreState(JSON.parse(JSON.stringify(upgraded)));
    expect(playerMatch(restored, 'u0')!.disconnected).toEqual({ u0: 90_100 });
    connect(restored, 'u0', 'restored', 90_099);
    expect(playerMatch(restored, 'u0')!.phase).toBe('playing');
    expect(() => restoreState({ ...upgraded, schemaVersion: 99 } as unknown as RoomState)).toThrow(
      /Unsupported/,
    );
  });
});
