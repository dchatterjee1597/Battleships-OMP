import { DurableObject } from 'cloudflare:workers';
import { usernameSchema } from '../shared/protocol';
import {
  applyAction,
  cleanExpired,
  connect,
  disconnect,
  initialState,
  restoreState,
  playerMatch,
  capacity,
  revoke,
  snapshot,
  type RoomState,
} from './engine';
import { body, cookie, hash, HttpError, sessionCookie, token } from './auth';

type Attachment = {
  id: string;
  connection: string;
  window: number;
  count: number;
  challengeAt: number;
};
export class BattleshipsRoom extends DurableObject<Env> {
  private state: RoomState;
  private sent = new Map<string, string>();
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.storage.sql.exec(
      'CREATE TABLE IF NOT EXISTS room (id INTEGER PRIMARY KEY, value TEXT NOT NULL)',
    );
    ctx.storage.sql.exec(
      'CREATE TABLE IF NOT EXISTS admin_sessions (hash TEXT PRIMARY KEY, expires INTEGER NOT NULL)',
    );
    ctx.storage.sql.exec(
      'CREATE TABLE IF NOT EXISTS limits (key TEXT PRIMARY KEY, count INTEGER NOT NULL, expires INTEGER NOT NULL)',
    );
    const row = ctx.storage.sql
      .exec<{ value: string }>('SELECT value FROM room WHERE id = 1')
      .toArray()[0];
    const stored = row ? JSON.parse(row.value) : initialState();
    this.state = restoreState(stored);
    if (row && !('schemaVersion' in stored)) {
      // Retain the original v1 value once. Never overwrite it on subsequent starts.
      ctx.storage.transactionSync(() => {
        ctx.storage.sql.exec('INSERT OR IGNORE INTO room(id,value) VALUES(2,?)', row.value);
        ctx.storage.sql.exec('UPDATE room SET value=? WHERE id=1', JSON.stringify(this.state));
      });
    }
    // Hibernation preserves attachments. A full runtime restart may not preserve sockets.
    const active = new Set(
      ctx.getWebSockets().map((ws) => (ws.deserializeAttachment() as Attachment).connection),
    );
    this.mutate((s) => {
      for (const u of s.users)
        if (u.connection && !active.has(u.connection))
          disconnect(s, u.id, u.connection, Date.now());
    });
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
    // A hibernation wake runs this constructor before its due alarm handler.
    // Do not consume that deadline or replace its alarm before it can broadcast.
    ctx.blockConcurrencyWhile(async () => {
      if ((await ctx.storage.getAlarm()) === null) await this.schedule();
    });
  }
  private mutate(change: (draft: RoomState) => void) {
    const draft = structuredClone(this.state);
    change(draft);
    draft.version++;
    this.ctx.storage.sql.exec(
      'INSERT INTO room(id, value) VALUES(1, ?) ON CONFLICT(id) DO UPDATE SET value=excluded.value',
      JSON.stringify(draft),
    );
    this.state = draft;
  }
  private limit(key: string, max: number, period: number) {
    const now = Date.now();
    this.ctx.storage.sql.exec('DELETE FROM limits WHERE expires <= ?', now);
    const row = this.ctx.storage.sql
      .exec<{ count: number; expires: number }>(
        'SELECT count, expires FROM limits WHERE key = ?',
        key,
      )
      .toArray()[0];
    if (row && row.count >= max)
      throw new HttpError(429, 'Too many attempts. Please wait a minute.');
    this.ctx.storage.sql.exec(
      'INSERT INTO limits(key,count,expires) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1',
      key,
      now + period,
    );
  }
  private async identity(request: Request) {
    const credential = cookie(request, 'tideline_device');
    if (!/^[a-f0-9]{64}$/.test(credential)) return undefined;
    const digest = await hash(credential);
    return this.state.users.find((u) => u.credentialHash === digest);
  }
  private async admin(request: Request) {
    const credential = cookie(request, 'tideline_admin');
    if (!/^[a-f0-9]{64}$/.test(credential)) throw new HttpError(401, 'Sign in to command.');
    const digest = await hash(credential);
    const row = this.ctx.storage.sql
      .exec<{ expires: number }>('SELECT expires FROM admin_sessions WHERE hash = ?', digest)
      .toArray()[0];
    if (!row || row.expires <= Date.now())
      throw new HttpError(401, 'Admin session expired. Sign in again.');
  }
  private broadcast(forceId?: string) {
    let failed = false;
    for (const ws of this.ctx.getWebSockets()) {
      const a = ws.deserializeAttachment() as Attachment;
      const u = this.state.users.find((u) => u.id === a.id);
      if (u?.status !== 'approved' || u.connection !== a.connection) continue;
      try {
        const view = snapshot(this.state, a.id);
        // A shot in another match does not send this connection any match update.
        const content = JSON.stringify({ ...view, version: 0, serverNow: 0 });
        if (this.sent.get(a.connection) === content && forceId !== a.id) continue;
        ws.send(JSON.stringify(view));
        this.sent.set(a.connection, content);
      } catch {
        this.drop(ws);
        failed = true;
      }
    }
    if (failed) {
      this.broadcast();
      this.ctx.waitUntil(this.schedule());
    }
  }
  private async schedule() {
    const times = [
      ...this.state.challenges.map((c) => c.expires),
      ...Object.values(this.state.matches).flatMap((m) => [
        ...Object.values(m.disconnected),
        ...(m.resetAt ? [m.resetAt] : []),
      ]),
    ];
    if (times.length) await this.ctx.storage.setAlarm(Math.min(...times));
    else await this.ctx.storage.deleteAlarm();
  }
  async fetch(request: Request): Promise<Response> {
    try {
      const path = new URL(request.url).pathname;
      this.expire();
      if (path === '/api/session' && request.method === 'GET') {
        const user = await this.identity(request);
        return Response.json({
          user: user ? { id: user.id, name: user.name, status: user.status } : null,
          capacity: capacity(this.state, user?.id),
        });
      }
      if (path === '/api/join' && request.method === 'POST') {
        const ip = await hash(request.headers.get('CF-Connecting-IP') ?? 'local');
        this.limit(`join:${ip}`, 12, 60_000);
        const data = await body(request);
        if (
          typeof data.invite !== 'string' ||
          data.invite.length > 256 ||
          !this.env.INVITE_TOKEN ||
          this.env.INVITE_TOKEN.length < 32 ||
          (await hash(data.invite)) !== (await hash(this.env.INVITE_TOKEN))
        )
          throw new HttpError(
            403,
            'This invitation is not valid. Ask your administrator for the private link.',
          );
        const current = await this.identity(request);
        if (current && ['approved', 'pending'].includes(current.status))
          return Response.json({ ok: true });
        const name = usernameSchema.safeParse(data.name);
        if (!name.success)
          throw new HttpError(
            400,
            'Use 2–20 letters, numbers, spaces, dots, underscores, hyphens or apostrophes.',
          );
        const credential = token();
        const credentialHash = await hash(credential);
        // Everything after the last await commits synchronously, including uniqueness checks.
        this.mutate((s) => {
          if (
            s.users.some(
              (u) =>
                ['pending', 'approved'].includes(u.status) &&
                u.name.toLocaleLowerCase() === name.data.toLocaleLowerCase(),
            )
          )
            throw new HttpError(409, 'That callsign is already registered. Choose another.');
          s.users = s.users.filter(
            (u) =>
              ['pending', 'approved'].includes(u.status) || !!u.connection || playerMatch(s, u.id),
          );
          if (s.users.filter((u) => u.status === 'pending').length >= 256)
            throw new HttpError(429, 'Too many pending requests. Contact the administrator.');
          s.users.push({
            id: crypto.randomUUID(),
            name: name.data,
            status: 'pending',
            credentialHash,
            ready: true,
            connection: null,
            created: Date.now(),
          });
        });
        return Response.json(
          { ok: true },
          {
            headers: {
              'Set-Cookie': sessionCookie(request, 'tideline_device', credential, 365 * 86400),
            },
          },
        );
      }
      if (path === '/api/admin/login' && request.method === 'POST') {
        const ip = await hash(request.headers.get('CF-Connecting-IP') ?? 'local');
        this.limit(`admin:${ip}`, 8, 60_000);
        const data = await body(request);
        if (
          typeof data.passphrase !== 'string' ||
          data.passphrase.length > 512 ||
          !this.env.ADMIN_PASSPHRASE ||
          this.env.ADMIN_PASSPHRASE.length < 16 ||
          (await hash(data.passphrase)) !== (await hash(this.env.ADMIN_PASSPHRASE))
        )
          throw new HttpError(401, 'Passphrase not recognized.');
        const credential = token();
        const digest = await hash(credential);
        this.ctx.storage.sql.exec('DELETE FROM admin_sessions WHERE expires <= ?', Date.now());
        this.ctx.storage.sql.exec(
          'INSERT INTO admin_sessions(hash,expires) VALUES(?,?)',
          digest,
          Date.now() + 8 * 3600_000,
        );
        return Response.json(
          { ok: true },
          {
            headers: {
              'Set-Cookie': sessionCookie(request, 'tideline_admin', credential, 8 * 3600),
            },
          },
        );
      }
      if (path.startsWith('/api/admin/')) {
        await this.admin(request);
        if (path === '/api/admin/users' && request.method === 'GET')
          return Response.json({
            users: this.state.users.map((u) => ({
              id: u.id,
              name: u.name,
              status: u.status,
              connected: !!u.connection,
              created: u.created,
            })),
          });
        if (path === '/api/admin/logout' && request.method === 'POST') {
          this.ctx.storage.sql.exec(
            'DELETE FROM admin_sessions WHERE hash = ?',
            await hash(cookie(request, 'tideline_admin')),
          );
          return Response.json(
            { ok: true },
            { headers: { 'Set-Cookie': sessionCookie(request, 'tideline_admin', '', 0) } },
          );
        }
        if (path === '/api/admin/decision' && request.method === 'POST') {
          const data = await body(request);
          if (
            !['approve', 'deny', 'revoke'].includes(String(data.action)) ||
            typeof data.id !== 'string'
          )
            throw new HttpError(400, 'Invalid decision.');
          this.mutate((s) => {
            const u = s.users.find((u) => u.id === data.id);
            if (!u) throw new HttpError(404, 'Device not found.');
            if (data.action === 'approve' && u.status !== 'pending')
              throw new HttpError(409, 'Only pending requests can be approved.');
            if (data.action === 'deny' && u.status !== 'pending')
              throw new HttpError(409, 'Only pending requests can be denied.');
            if (data.action === 'revoke' && u.status !== 'approved')
              throw new HttpError(409, 'Only approved devices can be revoked.');
            if (data.action !== 'approve') revoke(s, u.id, Date.now());
            u.status =
              data.action === 'approve'
                ? 'approved'
                : data.action === 'deny'
                  ? 'denied'
                  : 'revoked';
          });
          for (const ws of this.ctx.getWebSockets())
            if (
              (ws.deserializeAttachment() as Attachment).id === data.id &&
              data.action !== 'approve'
            )
              ws.close(4003, 'Access revoked');
          this.broadcast();
          await this.schedule();
          return Response.json({ ok: true });
        }
      }
      if (path === '/api/ws' && request.headers.get('Upgrade')?.toLowerCase() === 'websocket') {
        const found = await this.identity(request);
        this.expire();
        // Re-read after async credential hashing: approval might have changed meanwhile.
        const user = this.state.users.find((u) => u.id === found?.id);
        if (!user || user.status !== 'approved') throw new HttpError(403, 'Approval required.');
        this.limit(`connect:${user.id}`, 20, 60_000);
        if (!capacity(this.state, user.id).canConnect)
          throw new HttpError(429, 'The community is full. Please wait for a place.');
        const pair = new WebSocketPair();
        const connection = crypto.randomUUID();
        const old = this.ctx
          .getWebSockets()
          .filter((ws) => (ws.deserializeAttachment() as Attachment).id === user.id);
        this.mutate((s) => connect(s, user.id, connection));
        this.ctx.acceptWebSocket(pair[1]);
        pair[1].serializeAttachment({
          id: user.id,
          connection,
          window: Date.now(),
          count: 0,
          challengeAt: 0,
        } satisfies Attachment);
        for (const ws of old) {
          try {
            ws.send(JSON.stringify({ type: 'superseded' }));
            ws.close(4001, 'Control moved to another tab');
          } catch {
            /* stale socket is already superseded */
          }
        }
        this.broadcast();
        await this.schedule();
        return new Response(null, { status: 101, webSocket: pair[0] });
      }
      throw new HttpError(404, 'Endpoint not found.');
    } catch (error) {
      return Response.json(
        { error: error instanceof HttpError ? error.message : 'Unable to complete this request.' },
        { status: error instanceof HttpError ? error.status : 500 },
      );
    }
  }
  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    const a = ws.deserializeAttachment() as Attachment;
    if (this.state.users.find((u) => u.id === a.id)?.connection !== a.connection) return;
    this.expire();
    try {
      if (typeof message !== 'string' || message.length > 4096)
        throw new Error('Invalid message size.');
      const now = Date.now();
      if (now - a.window >= 10_000) {
        a.window = now;
        a.count = 0;
      }
      a.count++;
      ws.serializeAttachment(a);
      if (a.count > 40) {
        ws.close(4008, 'Too many commands');
        this.drop(ws);
        this.broadcast();
        await this.schedule();
        return;
      }
      const raw = JSON.parse(message);
      if (raw?.type === 'challenge') {
        if (now - a.challengeAt < 2000) throw new Error('Wait a moment before another challenge.');
        a.challengeAt = now;
        ws.serializeAttachment(a);
      }
      this.mutate((s) =>
        applyAction(
          s,
          a.id,
          raw,
          now,
          () => crypto.getRandomValues(new Uint32Array(1))[0] / 4294967296,
        ),
      );
      this.broadcast(a.id);
      await this.schedule();
    } catch (error) {
      try {
        ws.send(
          JSON.stringify({
            type: 'error',
            message: error instanceof Error ? error.message : 'Invalid command.',
          }),
        );
        ws.send(JSON.stringify(snapshot(this.state, a.id)));
      } catch {
        this.drop(ws);
        this.broadcast();
        await this.schedule();
      }
    }
  }
  private drop(ws: WebSocket) {
    const a = ws.deserializeAttachment() as Attachment;
    this.sent.delete(a.connection);
    this.mutate((s) => disconnect(s, a.id, a.connection, Date.now()));
  }
  private expire() {
    const now = Date.now();
    if (
      this.state.challenges.some((c) => c.expires <= now) ||
      Object.values(this.state.matches).some(
        (m) =>
          (m.resetAt && m.resetAt <= now) ||
          Object.values(m.disconnected).some((deadline) => deadline <= now),
      )
    ) {
      this.mutate((s) => cleanExpired(s, now));
      this.broadcast();
      this.ctx.waitUntil(this.schedule());
    }
  }
  async webSocketClose(ws: WebSocket, code: number) {
    this.drop(ws);
    try {
      ws.close(code === 1006 ? 1000 : code);
    } catch {
      /* already closed */
    }
    this.broadcast();
    await this.schedule();
  }
  async webSocketError(ws: WebSocket) {
    this.drop(ws);
    try {
      ws.close(1011, 'Connection lost');
    } catch {
      /* already closed */
    }
    this.broadcast();
    await this.schedule();
  }
  async alarm() {
    this.mutate((s) => cleanExpired(s, Date.now()));
    this.broadcast();
    await this.schedule();
  }
}
