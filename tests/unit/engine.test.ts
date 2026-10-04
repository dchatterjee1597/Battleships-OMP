import { describe, expect, it } from 'vitest';
import {
  cells,
  randomFleet,
  SHIPS,
  validateFleet,
  validPlacement,
  type Fleet,
} from '../../src/shared/game';
import {
  applyAction,
  playerMatch,
  cleanExpired,
  connect,
  disconnect,
  initialState,
  snapshot,
  type RoomState,
} from '../../src/server/engine';
import { actionSchema, usernameSchema } from '../../src/shared/protocol';

const fleet = (): Fleet => SHIPS.map((s, y) => ({ id: s.id, x: 0, y, vertical: false }));
function room() {
  const s = initialState();
  s.users = ['a', 'b', 'c', 'd'].map((id) => ({
    id,
    name: id.toUpperCase(),
    status: 'approved',
    credentialHash: `secret-${id}`,
    ready: true,
    connection: `connection-${id}`,
    created: 1,
  }));
  return s;
}
function setup() {
  const s = room();
  applyAction(s, 'a', { type: 'challenge', target: 'b' }, 100);
  applyAction(
    s,
    'b',
    { type: 'respond', challenge: s.challenges[0].id, accept: true },
    100,
    () => 0,
  );
  applyAction(s, 'c', { type: 'spectate', match: playerMatch(s, 'a')!.id }, 100);
  return s;
}
function playing() {
  const s = setup();
  for (const id of ['a', 'b'])
    applyAction(s, id, { type: 'fleet', match: playerMatch(s, 'a')!.id, fleet: fleet() });
  return s;
}
function fire(s: RoomState, id: string, targets: number[]) {
  applyAction(
    s,
    id,
    {
      type: 'fire',
      match: playerMatch(s, 'a')!.id,
      revision: playerMatch(s, 'a')!.revision,
      targets,
    },
    1000,
  );
}
function round(s: RoomState, a: number[], b: number[]) {
  fire(s, 'a', a);
  fire(s, 'b', b);
}
function charged() {
  const s = playing();
  round(s, [99], [99]);
  round(s, [98], [98]);
  return s;
}

describe('fleet geometry', () => {
  it('accepts exact fleet lengths, horizontal, vertical and touching', () => {
    expect(() => validateFleet(fleet())).not.toThrow();
    const vertical = SHIPS.map((s, x) => ({ id: s.id, x, y: 0, vertical: true }));
    expect(() => validateFleet(vertical)).not.toThrow();
    expect(fleet().map((s) => cells(s).length)).toEqual([5, 4, 3, 3, 2]);
    expect(cells(vertical[0])).toEqual([0, 10, 20, 30, 40]);
  });
  it('rejects overlap, bounds, missing/duplicate ships and fractional coordinates', () => {
    const f = fleet();
    f[1].y = 0;
    expect(() => validateFleet(f)).toThrow();
    for (const x of [-1, 6, 0.5, NaN]) expect(validPlacement({ ...fleet()[0], x }, [])).toBe(false);
    expect(validPlacement({ ...fleet()[0], y: 6, vertical: true }, [])).toBe(false);
    expect(() => validateFleet(fleet().slice(1))).toThrow();
    expect(() => validateFleet([...fleet().slice(1), fleet()[1]])).toThrow();
  });
  it('randomizes 1000 legal complete fleets', () => {
    for (let i = 0; i < 1000; i++) expect(() => validateFleet(randomFleet())).not.toThrow();
  });
});
describe('firing and victory', () => {
  it('resolves miss, hit, named sink, and turn switching', () => {
    const s = playing();
    fire(s, 'a', [99]);
    expect(playerMatch(s, 'a')!.turn).toBe('b');
    expect(playerMatch(s, 'a')!.boards.b.shots[0].result).toBe('MISS');
    fire(s, 'b', [99]);
    fire(s, 'a', [40]);
    expect(playerMatch(s, 'a')!.boards.b.shots[1]).toEqual({ cell: 40, result: 'HIT' });
    fire(s, 'b', [98]);
    fire(s, 'a', [41]);
    expect(playerMatch(s, 'a')!.boards.b.shots[2]).toEqual({
      cell: 41,
      result: 'HIT & SINK',
      ship: 'destroyer',
    });
  });
  it('rejects out-of-turn, duplicate, stale, malformed and spectator shots', () => {
    const s = playing();
    expect(() => fire(s, 'b', [99])).toThrow(/turn/);
    expect(() => fire(s, 'c', [99])).toThrow(/Spectators/);
    expect(() => fire(s, 'a', [100])).toThrow(/Malformed/);
    expect(() => fire(s, 'a', [2.5])).toThrow();
    round(s, [99], [99]);
    expect(() => fire(s, 'a', [99])).toThrow(/already/);
    expect(() =>
      applyAction(s, 'a', {
        type: 'fire',
        match: playerMatch(s, 'a')!.id,
        revision: 0,
        targets: [98],
      }),
    ).toThrow(/stale/);
  });
  it('ends only when all five vessels are destroyed', () => {
    const s = playing();
    const hits = fleet().flatMap(cells);
    hits.forEach((cell, i) => {
      fire(s, 'a', [cell]);
      if (i < hits.length - 1) fire(s, 'b', [99 - i]);
    });
    expect(playerMatch(s, 'a')!.phase).toBe('finished');
    expect(playerMatch(s, 'a')!.winner).toBe('a');
    expect(playerMatch(s, 'a')!.boards.b.shots.filter((s) => s.ship)).toHaveLength(5);
    expect(() => fire(s, 'b', [70])).toThrow();
  });
  it('locks both fleets and rejects any later mutation', () => {
    const s = setup();
    applyAction(s, 'a', { type: 'fleet', match: playerMatch(s, 'a')!.id, fleet: fleet() });
    expect(() =>
      applyAction(s, 'a', { type: 'fleet', match: playerMatch(s, 'a')!.id, fleet: randomFleet() }),
    ).toThrow(/locked/);
    expect(playerMatch(s, 'a')!.phase).toBe('placement');
    applyAction(s, 'b', { type: 'fleet', match: playerMatch(s, 'a')!.id, fleet: fleet() });
    expect(playerMatch(s, 'a')!.phase).toBe('playing');
    expect(() =>
      applyAction(s, 'b', { type: 'fleet', match: playerMatch(s, 'a')!.id, fleet: fleet() }),
    ).toThrow();
  });
  it('rejects fire in placement or against a previous match id', () => {
    const s = setup();
    expect(() => fire(s, 'a', [0])).toThrow();
    expect(() => applyAction(s, 'a', { type: 'fleet', match: 'old', fleet: fleet() })).toThrow(
      /ended/,
    );
  });
});
describe('salvo timing', () => {
  it('is unavailable on own turns 1 and 2, available on own turn 3 independently', () => {
    const s = playing();
    expect(() => fire(s, 'a', [96, 97, 98])).toThrow(/available/);
    round(s, [99], [99]);
    expect(() => fire(s, 'a', [96, 97, 98])).toThrow(/available/);
    fire(s, 'a', [98]);
    expect(playerMatch(s, 'a')!.boards.a.cooldown).toBe(0);
    expect(playerMatch(s, 'a')!.boards.b.cooldown).toBe(1);
    fire(s, 'b', [98]);
    fire(s, 'a', [97, 96, 95]);
    expect(
      playerMatch(s, 'a')!
        .boards.b.shots.slice(-3)
        .map((s) => s.cell),
    ).toEqual([97, 96, 95]);
    expect(playerMatch(s, 'a')!.boards.a.cooldown).toBe(2);
  });
  it('requires exactly 3 distinct unshot cells and validates all before resolution', () => {
    const s = charged();
    for (const targets of [
      [1, 2],
      [1, 1, 2],
      [1, 2, 99],
      [1, 2, 100],
    ])
      expect(() => fire(s, 'a', targets)).toThrow();
    expect(playerMatch(s, 'a')!.boards.b.shots).toHaveLength(2);
    expect(playerMatch(s, 'a')!.turn).toBe('a');
  });
  it('preserves unused availability without stacking and resets cooldown after use', () => {
    const s = charged();
    round(s, [97], [97]);
    round(s, [96], [96]);
    expect(playerMatch(s, 'a')!.boards.a.cooldown).toBe(0);
    round(s, [95, 94, 93], [95]);
    expect(playerMatch(s, 'a')!.boards.a.cooldown).toBe(2);
    expect(() => fire(s, 'a', [92, 91, 90])).toThrow();
    round(s, [92], [94]);
    expect(playerMatch(s, 'a')!.boards.a.cooldown).toBe(1);
    round(s, [91], [93]);
    expect(playerMatch(s, 'a')!.boards.a.cooldown).toBe(0);
    fire(s, 'a', [90, 89, 88]);
    expect(playerMatch(s, 'a')!.boards.a.cooldown).toBe(2);
  });
  it('resolves all three shots even when the first wins the game', () => {
    const s = playing();
    const hits = fleet().flatMap(cells);
    hits.slice(0, -1).forEach((cell, i) => round(s, [cell], [99 - i]));
    fire(s, 'a', [hits.at(-1)!, 98, 99]);
    expect(playerMatch(s, 'a')!.winner).toBe('a');
    expect(
      playerMatch(s, 'a')!
        .boards.b.shots.slice(-3)
        .map((s) => s.result),
    ).toEqual(['HIT & SINK', 'MISS', 'MISS']);
  });
});
describe('lobby authority and races', () => {
  it('independent accepted challenges own separate matches', () => {
    const s = room();
    applyAction(s, 'a', { type: 'challenge', target: 'b' });
    applyAction(s, 'c', { type: 'challenge', target: 'd' });
    const [one, two] = s.challenges;
    applyAction(s, 'b', { type: 'respond', challenge: one.id, accept: true });
    const match = playerMatch(s, 'a')!.id;
    applyAction(s, 'd', { type: 'respond', challenge: two.id, accept: true });
    expect(playerMatch(s, 'c')!.id).not.toBe(match);
    expect(() => applyAction(s, 'c', { type: 'challenge', target: 'd' })).toThrow();
    expect(playerMatch(s, 'a')!.id).toBe(match);
    expect(s.challenges).toEqual([]);
  });
  it('rejects unauthorized, disconnected, unready and self challenges', () => {
    const s = room();
    s.users[0].status = 'pending';
    expect(() => applyAction(s, 'a', { type: 'ready', ready: true })).toThrow(/approved/);
    expect(() => snapshot(s, 'a')).toThrow();
    s.users[0].status = 'approved';
    s.users[0].connection = null;
    expect(() => applyAction(s, 'a', { type: 'ready', ready: true })).toThrow(/Connect/);
    s.users[0].connection = 'x';
    expect(() => applyAction(s, 'a', { type: 'challenge', target: 'a' })).toThrow();
    s.users[1].ready = false;
    expect(() => applyAction(s, 'a', { type: 'challenge', target: 'b' })).toThrow();
  });
  it('expires, declines and cancels challenges, and not-ready clears them', () => {
    const s = room();
    applyAction(s, 'a', { type: 'challenge', target: 'b' }, 0);
    const id = s.challenges[0].id;
    expect(() =>
      applyAction(s, 'b', { type: 'respond', challenge: id, accept: true }, 60001),
    ).toThrow(/expired/);
    applyAction(s, 'a', { type: 'challenge', target: 'b' });
    applyAction(s, 'b', { type: 'respond', challenge: s.challenges[0].id, accept: false });
    expect(s.challenges).toHaveLength(0);
    applyAction(s, 'a', { type: 'challenge', target: 'b' });
    applyAction(s, 'a', { type: 'cancelChallenge', challenge: s.challenges[0].id });
    expect(s.challenges).toHaveLength(0);
    applyAction(s, 'a', { type: 'challenge', target: 'b' });
    applyAction(s, 'b', { type: 'ready', ready: false });
    expect(s.challenges).toHaveLength(0);
  });
});
describe('privacy and lifecycle', () => {
  for (const vertical of [false, true])
    it(`publishes only fully sunk cells for all five ${vertical ? 'vertical' : 'horizontal'} vessels`, () => {
      const s = setup();
      const targetFleet = SHIPS.map((ship, i) => ({
        id: ship.id,
        x: vertical ? i : 0,
        y: vertical ? 0 : i,
        vertical,
      }));
      applyAction(s, 'a', { type: 'fleet', match: playerMatch(s, 'a')!.id, fleet: fleet() });
      applyAction(s, 'b', { type: 'fleet', match: playerMatch(s, 'a')!.id, fleet: targetFleet });
      let returnCell = 99;
      for (const ship of targetFleet) {
        const occupied = cells(ship);
        for (const [i, cell] of occupied.entries()) {
          fire(s, 'a', [cell]);
          const publicBoard = snapshot(s, 'c').match!.boards[1];
          const result = publicBoard.shots.at(-1)!;
          if (i === occupied.length - 1) {
            expect(result.sunkCells).toEqual(occupied);
            expect(result.ship).toBe(ship.id);
          } else {
            expect(result.sunkCells).toBeUndefined();
            expect(result.ship).toBeUndefined();
          }
          expect(publicBoard.fleet).toBeUndefined();
          expect(playerMatch(s, 'a')!.boards.b.shots.at(-1)).not.toHaveProperty('sunkCells');
          if (playerMatch(s, 'a')!.phase === 'playing') fire(s, 'b', [returnCell--]);
        }
      }
      expect(snapshot(s, 'c').match!.boards[1].sunk).toHaveLength(5);
    });

  it('only the owner receives own coordinates, never credentials or connection ids', () => {
    const s = playing();
    for (const id of ['a', 'b', 'c']) {
      const view = snapshot(s, id);
      expect(view.match!.boards.filter((b) => b.fleet).map((b) => b.player)).toEqual(
        id === 'c' ? [] : [id],
      );
      expect(JSON.stringify(view)).not.toMatch(/credentialHash|secret-|connection-/);
    }
    fire(s, 'a', [40]);
    expect(JSON.stringify(snapshot(s, 'c'))).not.toContain('destroyer');
    expect(snapshot(s, 'c').match!.boards[1].shots[0]).toEqual({ cell: 40, result: 'HIT' });
    fire(s, 'b', [99]);
    fire(s, 'a', [41]);
    expect(snapshot(s, 'c').match!.boards[1].sunk).toEqual(['destroyer']);
    for (const viewer of ['a', 'b', 'c']) {
      expect(snapshot(s, viewer).match!.boards[1].shots.at(-1)).toEqual({
        cell: 41,
        result: 'HIT & SINK',
        ship: 'destroyer',
        sunkCells: [40, 41],
      });
    }
    // The public rendering metadata never enters persisted match history.
    expect(playerMatch(s, 'a')!.boards.b.shots.at(-1)).not.toHaveProperty('sunkCells');
    applyAction(s, 'b', { type: 'forfeit', match: playerMatch(s, 'a')!.id });
    expect(snapshot(s, 'c').match!.boards.every((b) => !b.fleet)).toBe(true);
    expect(snapshot(s, 'a').match!.boards[1].fleet).toBeUndefined();
  });
  it('forfeits after 90 seconds; spectator drop has no effect', () => {
    const s = playing();
    disconnect(s, 'c', 'connection-c', 500);
    expect(playerMatch(s, 'a')!.phase).toBe('playing');
    disconnect(s, 'a', 'connection-a', 500);
    expect(playerMatch(s, 'a')!.phase).toBe('playing');
    cleanExpired(s, 90_500);
    expect(playerMatch(s, 'a')!.phase).toBe('finished');
    expect(playerMatch(s, 'a')!.winner).toBe('b');
    connect(s, 'a', 'new', 90_501);
    expect(playerMatch(s, 'a')!.phase).toBe('finished');
    cleanExpired(s, 105_500);
    expect(playerMatch(s, 'a')).toBeUndefined();
  });
  it('cancels setup after the reconnect deadline', () => {
    const s = setup();
    disconnect(s, 'a', 'connection-a', 0);
    expect(playerMatch(s, 'a')!.phase).toBe('placement');
    cleanExpired(s, 90_000);
    expect(playerMatch(s, 'a')).toBeUndefined();
    expect(s.users[0].notice).toContain('cancelled');
  });
  it('newer connection takes over without a forfeit; old close cannot remove it', () => {
    const s = playing();
    connect(s, 'a', 'new');
    disconnect(s, 'a', 'connection-a', 0);
    expect(playerMatch(s, 'a')!.phase).toBe('playing');
    expect(s.users[0].connection).toBe('new');
    disconnect(s, 'a', 'new', 0);
    cleanExpired(s, 90_000);
    expect(playerMatch(s, 'a')!.winner).toBe('b');
  });
  it('resets all match state and allows a fresh match without admin', () => {
    const s = playing();
    applyAction(s, 'a', { type: 'forfeit', match: playerMatch(s, 'a')!.id });
    applyAction(s, 'b', { type: 'lobby', match: playerMatch(s, 'a')!.id });
    expect(playerMatch(s, 'a')).toBeUndefined();
    expect(s.users.every((u) => u.ready)).toBe(true);
    applyAction(s, 'a', { type: 'challenge', target: 'b' });
    applyAction(s, 'b', { type: 'respond', challenge: s.challenges[0].id, accept: true });
    expect(playerMatch(s, 'a')!.boards.a).toEqual({
      fleet: null,
      shots: [],
      turns: 0,
      cooldown: 2,
    });
  });
  it('rejects spectator forfeit and cleanup', () => {
    const s = playing();
    expect(() => applyAction(s, 'c', { type: 'forfeit', match: playerMatch(s, 'a')!.id })).toThrow(
      /Spectators/,
    );
    applyAction(s, 'a', { type: 'forfeit', match: playerMatch(s, 'a')!.id });
    expect(() => applyAction(s, 'c', { type: 'lobby', match: playerMatch(s, 'a')!.id })).toThrow(
      /Spectators/,
    );
  });
  it('validates username and protocol shapes', () => {
    for (const name of ['A', '<script>', 'x'.repeat(21)])
      expect(usernameSchema.safeParse(name).success).toBe(false);
    expect(usernameSchema.parse(' Maya ')).toBe('Maya');
    expect(usernameSchema.parse('अर्जुन')).toBe('अर्जुन');
    expect(actionSchema.safeParse({ type: 'fire', targets: [1], winner: 'a' }).success).toBe(false);
  });
});
