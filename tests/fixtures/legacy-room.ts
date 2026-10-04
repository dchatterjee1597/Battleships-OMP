// Local migration fixture only. Never imported by the production Worker.
import { DurableObject } from 'cloudflare:workers';
export class BattleshipsRoom extends DurableObject<Env> {
  async fetch(request: Request) {
    this.ctx.storage.sql.exec(
      'CREATE TABLE IF NOT EXISTS room (id INTEGER PRIMARY KEY, value TEXT NOT NULL)',
    );
    if (request.method === 'POST') {
      const value = await request.text();
      this.ctx.storage.sql.exec('INSERT INTO room(id,value) VALUES(1,?)', value);
      return Response.json({ ok: true });
    }
    return Response.json(
      this.ctx.storage.sql.exec('SELECT id,value FROM room ORDER BY id').toArray(),
    );
  }
}
export default {
  fetch(request: Request, env: Env) {
    return env.ROOM.getByName('private-community-v1').fetch(request);
  },
};
