import {
  cells,
  coordinate,
  validateFleet,
  shipName,
  type Fleet,
  type Shot,
  type ShipId,
} from '../shared/game';
import {
  actionSchema,
  MAX_MATCHES,
  MAX_PLAYERS,
  RECONNECT_MS,
  type AccessStatus,
  type Challenge,
  type Snapshot,
  type Capacity,
} from '../shared/protocol';

export type User = {
  id: string;
  name: string;
  status: AccessStatus;
  credentialHash: string;
  ready: boolean;
  connection: string | null;
  created: number;
  watching?: string;
  notice?: string;
};
type Board = { fleet: Fleet | null; shots: Shot[]; turns: number; cooldown: number };
export type Match = {
  id: string;
  phase: 'placement' | 'playing' | 'finished';
  players: [string, string];
  turn: string;
  revision: number;
  boards: Record<string, Board>;
  events: string[];
  winner?: string;
  reason?: string;
  resetAt?: number;
  disconnected: Record<string, number>;
};
export type RoomState = {
  schemaVersion: 2;
  version: number;
  users: User[];
  challenges: Challenge[];
  matches: Record<string, Match>;
};
export const initialState = (): RoomState => ({
  schemaVersion: 2,
  version: 0,
  users: [],
  challenges: [],
  matches: {},
});
export type LegacyState = Omit<RoomState, 'schemaVersion' | 'matches'> & {
  match: Omit<Match, 'disconnected'> | null;
  notice: string;
};
/** One-way, idempotent application-state upgrade; DO identity and SQL schema stay intact. */
export function restoreState(stored: RoomState | LegacyState): RoomState {
  if ('schemaVersion' in stored) {
    if (stored.schemaVersion !== 2) throw new Error('Unsupported community schema.');
    return structuredClone(stored);
  }
  if (!('match' in stored) || !Array.isArray(stored.users))
    throw new Error('Invalid legacy state.');
  const s = initialState();
  s.version = stored.version;
  s.users = structuredClone(stored.users);
  s.challenges = structuredClone(stored.challenges);
  if (stored.match)
    s.matches[stored.match.id] = { ...structuredClone(stored.match), disconnected: {} };
  for (const u of s.users) u.notice = stored.notice;
  return s;
}
export const playerMatch = (s: RoomState, id: string) =>
  Object.values(s.matches).find((m) => m.players.includes(id));
export const getMatch = (s: RoomState, id: string) =>
  Object.hasOwn(s.matches, id) ? s.matches[id] : undefined;
export const activeMatches = (s: RoomState) =>
  Object.values(s.matches).filter((m) => m.phase !== 'finished');
export const reserved = (s: RoomState, id: string) => !!playerMatch(s, id)?.disconnected[id];
export function capacity(s: RoomState, id?: string): Capacity {
  const used = s.users.filter(
    (u) => u.status === 'approved' && (!!u.connection || reserved(s, u.id)),
  ).length;
  return {
    used,
    limit: MAX_PLAYERS,
    canConnect:
      used < MAX_PLAYERS ||
      !!s.users.find((u) => u.id === id && (u.connection || reserved(s, u.id))),
  };
}
const available = (s: RoomState, u: User) =>
  !!u.connection && u.ready && !u.watching && !playerMatch(s, u.id);
const clearChallenges = (s: RoomState, ids: string[]) => {
  s.challenges = s.challenges.filter((c) => !ids.includes(c.from) && !ids.includes(c.to));
};
const requireThat: (condition: unknown, message: string) => asserts condition = (
  condition,
  message,
) => {
  if (!condition) throw new Error(message);
};
export const approved = (s: RoomState, id: string) => {
  const user = s.users.find((u) => u.id === id);
  requireThat(user?.status === 'approved', 'This device is not approved.');
  return user;
};
export function connect(s: RoomState, id: string, connection: string, now = Date.now()) {
  cleanExpired(s, now);
  const user = approved(s, id);
  requireThat(capacity(s, id).canConnect, 'The community is full. Please wait for a place.');
  const m = playerMatch(s, id);
  if (!user.connection && !m) user.ready = true;
  user.connection = connection;
  if (m) delete m.disconnected[id];
}
export function finish(
  s: RoomState,
  m: Match,
  winner: string | undefined,
  reason: string,
  now: number,
) {
  m.phase = 'finished';
  m.winner = winner;
  m.reason = reason;
  m.resetAt = now + 15_000;
  m.disconnected = {};
  m.events.push(
    winner
      ? `${s.users.find((u) => u.id === winner)?.name ?? 'Opponent'} wins — ${reason}.`
      : 'Match abandoned — both captains disconnected.',
  );
}
export function reset(
  s: RoomState,
  matchId: string,
  notice = 'Waters clear. Ready for the next match.',
) {
  const m = getMatch(s, matchId);
  if (!m) return;
  for (const u of s.users) {
    if (m.players.includes(u.id)) {
      u.ready = true;
      u.notice = notice;
    }
    if (u.watching === matchId) {
      delete u.watching;
      u.notice = notice;
    }
  }
  delete s.matches[matchId];
}
export function disconnect(s: RoomState, id: string, connection: string, now: number) {
  const u = s.users.find((u) => u.id === id);
  if (!u || u.connection !== connection) return;
  u.connection = null;
  clearChallenges(s, [id]);
  delete u.watching;
  const m = playerMatch(s, id);
  if (m && m.phase !== 'finished') m.disconnected[id] ??= now + RECONNECT_MS;
}
export function revoke(s: RoomState, id: string, now: number) {
  const u = s.users.find((u) => u.id === id);
  if (!u) return;
  u.connection = null;
  delete u.watching;
  clearChallenges(s, [id]);
  const m = playerMatch(s, id);
  if (m?.phase === 'placement')
    reset(s, m.id, `${u.name}'s access was revoked. Fleet setup cancelled.`);
  else if (m?.phase === 'playing')
    finish(
      s,
      m,
      m.players.find((p) => p !== id)!,
      'opponent access revoked / forfeit',
      now,
    );
}
export function cleanExpired(s: RoomState, now: number) {
  s.challenges = s.challenges.filter((c) => c.expires > now);
  for (const m of Object.values(s.matches)) {
    if (m.phase === 'finished') {
      if (m.resetAt && m.resetAt <= now) reset(s, m.id);
      continue;
    }
    if (!Object.values(m.disconnected).some((deadline) => deadline <= now)) continue;
    if (m.phase === 'placement') reset(s, m.id, 'Reconnect window expired. Fleet setup cancelled.');
    else {
      const connected = m.players.filter((id) => s.users.find((u) => u.id === id)?.connection);
      finish(
        s,
        m,
        connected.length === 1 ? connected[0] : undefined,
        connected.length === 1 ? 'opponent disconnected / forfeit' : 'both captains disconnected',
        now,
      );
    }
  }
}
export function applyAction(
  s: RoomState,
  id: string,
  raw: unknown,
  now = Date.now(),
  random = Math.random,
) {
  const parsed = actionSchema.safeParse(raw);
  requireThat(parsed.success, 'Malformed action. Please synchronize and try again.');
  const a = parsed.data;
  const user = approved(s, id);
  requireThat(user.connection, 'Connect before taking an action.');
  cleanExpired(s, now);
  if (a.type === 'leaveSpectating') {
    requireThat(user.watching, 'You are not spectating a match.');
    delete user.watching;
    return;
  }
  if (a.type === 'spectate') {
    requireThat(
      !playerMatch(s, id) && !user.watching,
      'Return to the lobby before choosing a match.',
    );
    const target = getMatch(s, a.match);
    requireThat(target && target.phase !== 'finished', 'This match has ended.');
    user.watching = target.id;
    clearChallenges(s, [id]);
    return;
  }
  if (a.type === 'ready') {
    requireThat(!playerMatch(s, id) && !user.watching, 'Return to the lobby to change readiness.');
    user.ready = a.ready;
    if (!a.ready) s.challenges = s.challenges.filter((c) => c.from !== id && c.to !== id);
    return;
  }
  if (a.type === 'challenge') {
    requireThat(activeMatches(s).length < MAX_MATCHES, 'All four match slots are occupied.');
    const target = approved(s, a.target);
    requireThat(
      id !== a.target && available(s, user) && available(s, target),
      'Both captains must be connected and ready.',
    );
    requireThat(
      !s.challenges.some((c) => c.from === id),
      'You already have an outgoing challenge.',
    );
    s.challenges.push({ id: crypto.randomUUID(), from: id, to: a.target, expires: now + 60_000 });
    return;
  }
  if (a.type === 'cancelChallenge' || a.type === 'respond') {
    const challenge = s.challenges.find((c) => c.id === a.challenge);
    requireThat(challenge, 'This challenge has expired or was cancelled.');
    if (a.type === 'cancelChallenge') {
      requireThat(challenge.from === id, 'Only the challenger can cancel.');
      s.challenges = s.challenges.filter((c) => c.id !== challenge.id);
      return;
    }
    requireThat(challenge.to === id, 'This challenge is for another captain.');
    if (!a.accept) {
      s.challenges = s.challenges.filter((c) => c.id !== challenge.id);
      return;
    }
    const other = approved(s, challenge.from);
    requireThat(activeMatches(s).length < MAX_MATCHES, 'All four match slots are occupied.');
    requireThat(available(s, user) && available(s, other), 'Both captains must still be ready.');
    const players: [string, string] = [other.id, id];
    const match: Match = {
      id: crypto.randomUUID(),
      players,
      phase: 'placement',
      turn: players[random() < 0.5 ? 0 : 1],
      revision: 0,
      boards: Object.fromEntries(
        players.map((p) => [p, { fleet: null, shots: [], turns: 0, cooldown: 2 }]),
      ),
      events: ['Captains selected. Deploy your fleets.'],
      disconnected: {},
    };
    s.matches[match.id] = match;
    clearChallenges(s, players);
    user.notice = '';
    other.notice = '';
    return;
  }
  const m = getMatch(s, a.match);
  requireThat(m && m.id === a.match, 'This match has ended.');
  requireThat(m.players.includes(id), 'Spectators cannot change a match.');
  if (a.type === 'lobby') {
    requireThat(m.phase === 'finished', 'The match is still active.');
    reset(s, m.id);
    return;
  }
  if (a.type === 'forfeit') {
    requireThat(m.phase !== 'finished', 'The match has already ended.');
    if (m.phase === 'placement') reset(s, m.id, `${user.name} cancelled fleet setup.`);
    else
      finish(
        s,
        m,
        m.players.find((p) => p !== id)!,
        'opponent forfeited',
        now,
      );
    return;
  }
  requireThat(!Object.keys(m.disconnected).length, 'Match paused while a captain reconnects.');
  const own = m.boards[id];
  if (a.type === 'fleet') {
    requireThat(m.phase === 'placement' && !own.fleet, 'This fleet is already locked.');
    validateFleet(a.fleet);
    own.fleet = structuredClone(a.fleet);
    m.events.push(`${user.name} locked their fleet.`);
    if (m.players.every((p) => m.boards[p].fleet)) {
      m.phase = 'playing';
      m.events.push('Both fleets deployed. Weapons online.');
    }
    m.revision++;
    return;
  }
  requireThat(m.phase === 'playing' && m.turn === id, 'Wait for your firing turn.');
  requireThat(
    m.revision === a.revision,
    'That firing command is stale. Select your targets again.',
  );
  const targetId = m.players.find((p) => p !== id)!;
  const target = m.boards[targetId];
  const salvo = a.targets.length === 3;
  requireThat(a.targets.length === 1 || salvo, 'Fire exactly one shot or three salvo shots.');
  requireThat(!salvo || own.cooldown === 0, 'Salvo is not available yet.');
  requireThat(new Set(a.targets).size === a.targets.length, 'Choose distinct target cells.');
  requireThat(
    a.targets.every((c) => !target.shots.some((shot) => shot.cell === c)),
    'That cell has already been targeted.',
  );
  if (salvo) m.events.push(`${user.name} launched a SALVO.`);
  for (const cell of a.targets) {
    const ship = target.fleet!.find((ship) => cells(ship).includes(cell));
    let result: Shot['result'] = ship ? 'HIT' : 'MISS';
    if (
      ship &&
      cells(ship).every((c) => c === cell || target.shots.some((shot) => shot.cell === c))
    )
      result = 'HIT & SINK';
    // Ship name is public only on sinking, avoiding extra information from partial hits.
    const shot: Shot = { cell, result, ...(result === 'HIT & SINK' ? { ship: ship!.id } : {}) };
    target.shots.push(shot);
    m.events.push(
      `${user.name} · ${coordinate(cell)} — ${result}${shot.ship ? ` — ${shipName(shot.ship)}` : ''}`,
    );
  }
  own.turns++;
  own.cooldown = salvo ? 2 : Math.max(0, own.cooldown - 1);
  m.revision++;
  if (
    target.fleet!.every((ship) =>
      cells(ship).every((c) => target.shots.some((shot) => shot.cell === c)),
    )
  )
    finish(s, m, id, 'fleet destroyed', now);
  else m.turn = targetId;
}

/** Whitelist serialization: never spread internal users, matches or boards here. */
export function snapshot(s: RoomState, id: string): Snapshot {
  const me = approved(s, id);
  const m = playerMatch(s, id) ?? (me.watching ? getMatch(s, me.watching) : undefined);
  return {
    type: 'snapshot',
    version: s.version,
    serverNow: Date.now(),
    me: { id: me.id, name: me.name, status: me.status },
    users: s.users
      .filter(
        (u) =>
          u.status === 'approved' &&
          (u.connection || reserved(s, u.id) || m?.players.includes(u.id)),
      )
      .map((u) => {
        const playing = playerMatch(s, u.id);
        return {
          id: u.id,
          name: u.name,
          ready: available(s, u),
          connected: !!u.connection,
          activity: u.watching
            ? 'spectating'
            : playing?.disconnected[u.id]
              ? 'reconnecting'
              : playing
                ? playing.phase
                : u.ready
                  ? 'ready'
                  : 'unready',
          matchId: playing?.id ?? u.watching,
        };
      }),
    challenges: s.challenges.filter((c) => c.from === id || c.to === id).map((c) => ({ ...c })),
    notice: me.notice ?? '',
    capacity: capacity(s, id),
    matches: activeMatches(s).map((match) => ({
      id: match.id,
      players: [...match.players],
      phase: match.phase,
      reconnecting: Object.keys(match.disconnected),
      spectators: s.users.filter((u) => u.connection && u.watching === match.id).length,
    })),
    match: m
      ? {
          id: m.id,
          phase: m.phase,
          players: [...m.players],
          turn: m.turn,
          revision: m.revision,
          events: [...m.events],
          winner: m.winner,
          reason: m.reason,
          resetAt: m.resetAt,
          disconnected: { ...m.disconnected },
          boards: m.players.map((player) => {
            const b = m.boards[player];
            return {
              player,
              locked: !!b.fleet,
              shots: b.shots.map((shot) => {
                const sunkShip =
                  shot.result === 'HIT & SINK'
                    ? b.fleet?.find((ship) => ship.id === shot.ship)
                    : undefined;
                const sunkCells = sunkShip ? cells(sunkShip) : [];
                return {
                  ...shot,
                  // Presentation only, derived on read; never publish an unhit cell.
                  ...(sunkCells.length &&
                  sunkCells.every((cell) =>
                    b.shots.some((hit) => hit.cell === cell && hit.result !== 'MISS'),
                  )
                    ? { sunkCells }
                    : {}),
                };
              }),
              sunk: b.shots.flatMap((shot) => (shot.ship ? [shot.ship as ShipId] : [])),
              turns: b.turns,
              cooldown: b.cooldown,
              ...(player === id && b.fleet ? { fleet: structuredClone(b.fleet) } : {}),
            };
          }),
        }
      : null,
  };
}
