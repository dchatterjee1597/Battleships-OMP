import { test, expect, type Page, type BrowserContext } from '@playwright/test';
import type { Snapshot } from '../../src/shared/protocol';
const INVITE = '/join/local-test-invite-not-for-production-1234';
const ADMIN = 'local-test-admin-not-for-production';
const last = new WeakMap<Page, Snapshot>();
function observe(page: Page) {
  page.on('websocket', (ws) =>
    ws.on('framereceived', (frame) => {
      try {
        const data = JSON.parse(String(frame.payload));
        if (data.type === 'snapshot') last.set(page, data);
      } catch {
        /* ping/pong */
      }
    }),
  );
}
async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}
async function returnToLobby(page: Page) {
  await page.getByRole('button', { name: 'Return to Lobby' }).click();
  await expect(page.getByText('Ready room.')).toBeVisible();
}
async function startMatch(a: Page, b: Page, bName: string) {
  await a
    .locator('.crew-row')
    .filter({ hasText: bName })
    .getByRole('button', { name: 'Challenge' })
    .click();
  await b.getByRole('button', { name: 'Accept', exact: true }).click();
  await expect(a.getByText('Fleet deployment.')).toBeVisible();
}
async function ready(page: Page) {
  await page.getByRole('button', { name: 'Randomize Fleet' }).click();
  await page.getByRole('button', { name: 'Ready · Lock fleet' }).click();
}
async function fire(page: Page, cells: number[], salvo = false) {
  await expect(page.getByRole('heading', { name: 'YOUR TURN', exact: true })).toBeVisible();
  if (salvo) await page.getByRole('button', { name: 'Salvo ×3' }).click();
  for (const cell of cells)
    await page.locator('.boards-stack .grid').first().locator(`[data-cell="${cell}"]`).click();
  const before = last.get(page)!.match!.revision;
  await page.getByRole('button', { name: salvo ? 'Fire Salvo' : 'Fire', exact: true }).click();
  await expect.poll(() => last.get(page)?.match?.revision).toBeGreaterThan(before);
}

test('private multiplayer lifecycle, secrecy, control transfer, disconnect and responsive placement', async ({
  browser,
  page,
  context,
}, info) => {
  const contexts: BrowserContext[] = [];
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const adminContext = await browser.newContext({
    baseURL: process.env.BATTLESHIPS_TEST_URL ?? 'http://127.0.0.1:8788',
  });
  contexts.push(adminContext);
  const admin = await adminContext.newPage();
  const bContext = await browser.newContext({
    baseURL: process.env.BATTLESHIPS_TEST_URL ?? 'http://127.0.0.1:8788',
    viewport: { width: 1280, height: 900 },
  });
  contexts.push(bContext);
  const b = await bContext.newPage();
  const spectatorContext = await browser.newContext({
    baseURL: process.env.BATTLESHIPS_TEST_URL ?? 'http://127.0.0.1:8788',
  });
  contexts.push(spectatorContext);
  const spectator = await spectatorContext.newPage();
  const suffix = Date.now().toString(36).slice(-6);
  const names = [`Maya-${suffix}`, `Arjun-${suffix}`, `Shore-${suffix}`];
  const ids: string[] = [];
  try {
    await admin.goto('/admin');
    await admin.getByLabel('Admin passphrase').fill(ADMIN);
    await admin.getByRole('button', { name: 'Enter command' }).click();
    await expect(admin.getByRole('heading', { name: 'Access control.' })).toBeVisible();
    for (const [i, p] of [page, b, spectator].entries()) {
      observe(p);
      await p.goto(INVITE);
      await p.getByLabel('Your callsign').fill(names[i]);
      await p.getByRole('button', { name: 'Request Access' }).click();
      await expect(p.getByText('Waiting for approval', { exact: false })).toBeVisible();
      await admin
        .locator('.admin-user')
        .filter({ hasText: names[i] })
        .getByRole('button', { name: 'Approve', exact: true })
        .click();
      await expect(p.getByText('Ready room.')).toBeVisible();
      ids.push(last.get(p)!.me.id);
    }
    // Returning approved browser remembers identity without typing or another approval.
    await page.reload();
    await expect(page.getByText('Ready room.')).toBeVisible();
    expect((await context.cookies()).find((c) => c.name === 'tideline_device')?.httpOnly).toBe(
      true,
    );
    await noOverflow(page);
    await page.screenshot({ path: info.outputPath('lobby.png'), fullPage: true });
    await startMatch(page, b, names[1]);
    await expect(spectator.getByText('Ready room.')).toBeVisible();
    await spectator.getByRole('button', { name: 'Spectate', exact: true }).click();
    // Real pointer placement: start at fleet tray and drag into the board.
    const ship = page.locator('.tray-ship[data-ship="carrier"]');
    const grid = page.locator('.placement-grid');
    const sb = (await ship.boundingBox())!;
    const gb = (await grid.boundingBox())!;
    if (info.project.name === 'phone') {
      await ship.scrollIntoViewIfNeeded();
      const s = (await ship.boundingBox())!;
      const g = (await grid.boundingBox())!;
      const cdp = await context.newCDPSession(page);
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [{ x: s.x + 30, y: s.y + 20 }],
      });
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ x: g.x + g.width * 0.05, y: g.y + g.height * 0.05 }],
      });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await cdp.detach();
    } else if (info.project.name === 'webkit-phone') {
      await ship.tap();
      await grid.locator('[data-cell="0"]').tap();
    } else {
      await page.mouse.move(sb.x + 30, sb.y + 20);
      await page.mouse.down();
      await page.mouse.move(gb.x + gb.width * 0.05, gb.y + gb.height * 0.05, { steps: 10 });
      await page.mouse.up();
    }
    await expect(page.locator('.board-ship')).toHaveCount(1);
    await ship.click();
    await page.getByRole('button', { name: 'Rotate' }).click();
    await expect(page.locator('.board-ship.vertical')).toHaveCount(1);
    await noOverflow(page);
    await page.evaluate(() => scrollTo(0, 0));
    await page.screenshot({ path: info.outputPath('placement.png'), fullPage: true });
    await ready(page);
    await ready(b);
    await expect.poll(() => last.get(page)?.match?.phase).toBe('playing');
    await expect.poll(() => last.get(spectator)?.match?.phase).toBe('playing');
    // Inspect wire snapshots rather than just hidden DOM elements.
    for (const p of [page, b])
      expect(
        last
          .get(p)!
          .match!.boards.filter((board) => board.fleet)
          .map((board) => board.player),
      ).toEqual([last.get(p)!.me.id]);
    expect(last.get(spectator)!.match!.boards.every((board) => !('fleet' in board))).toBe(true);
    expect(JSON.stringify(last.get(spectator))).not.toMatch(/credentialHash|vertical|"x":|"y":/);
    // Late spectator gets all public history and no private positions.
    const first = last.get(page)!.match!.turn === ids[0] ? page : b;
    const second = first === page ? b : page;
    for (let i = 0; i < 2; i++) {
      await fire(first, [99 - i]);
      await fire(second, [99 - i]);
    }
    await expect(first.getByText('Salvo available', { exact: true })).toBeVisible();
    await fire(first, [97, 96, 95], true);
    await expect(first.getByText('2 normal firing turns until ready')).toBeVisible();
    await spectator.reload();
    await spectator.getByRole('button', { name: 'Spectate', exact: true }).click();
    await expect
      .poll(() =>
        last.get(spectator)?.match?.boards.reduce((n, board) => n + board.shots.length, 0),
      )
      .toBe(7);
    expect(last.get(spectator)!.match!.boards.every((board) => !board.fleet)).toBe(true);
    await noOverflow(page);
    const boards = page.locator('.boards-stack .board-panel');
    const top = (await boards.nth(0).boundingBox())!;
    const bottom = (await boards.nth(1).boundingBox())!;
    expect(bottom.y).toBeGreaterThan(top.y + top.height);
    expect(Math.abs(bottom.x - top.x)).toBeLessThan(5);
    if (info.project.name.includes('phone')) {
      const dock = (await page.locator('.fire-dock').boundingBox())!;
      expect(dock.y + dock.height).toBeLessThanOrEqual(845);
    }
    await page.evaluate(() => scrollTo(0, 0));
    await page.screenshot({ path: info.outputPath('battle.png'), fullPage: true });
    await spectator.screenshot({ path: info.outputPath('spectator.png'), fullPage: true });
    if (!info.project.name.includes('phone')) {
      const log = page.locator('.event-feed');
      if ((await log.getAttribute('open')) === null) await log.locator('summary').click();
      await page.evaluate(() => scrollTo(0, 500));
      for (const selector of ['.crew-sidebar', '.battle-controls']) {
        const bounds = (await page.locator(selector).boundingBox())!;
        expect(bounds.y).toBeGreaterThanOrEqual(19);
        expect(bounds.y).toBeLessThanOrEqual(21);
        expect(bounds.height).toBeLessThanOrEqual(961);
      }
      await page.screenshot({ path: info.outputPath('sticky-panels-expanded-log.png') });
      await log.locator('summary').click();
      await page.evaluate(() => scrollTo(0, 650));
      expect((await page.locator('.battle-controls').boundingBox())!.y).toBeLessThanOrEqual(21);
    }
    // New controlling tab supersedes the old; closing it cannot forfeit.
    const replacement = await context.newPage();
    observe(replacement);
    await replacement.goto(INVITE);
    await expect(page.getByText('Command has moved.')).toBeVisible();
    await page.close();
    await expect.poll(() => last.get(replacement)?.match?.phase).toBe('playing');
    // A lost controlling connection pauses; the same approved browser can resume.
    await replacement.close();
    await expect(b.getByText('Match paused — waiting for reconnection.')).toBeVisible();
    expect(last.get(b)!.match!.phase).toBe('playing');
    const resumed = await context.newPage();
    observe(resumed);
    await resumed.goto(INVITE);
    await expect
      .poll(() => Object.keys(last.get(resumed)?.match?.disconnected ?? { waiting: 0 }).length)
      .toBe(0);
    await expect(b.getByText('Match paused — waiting for reconnection.')).toBeHidden();
    await resumed.getByRole('button', { name: 'Forfeit Match', exact: true }).click();
    await resumed.getByRole('button', { name: 'Confirm forfeit' }).click();
    await returnToLobby(b);
    await resumed.close();
    await expect(spectator.getByText('Ready room.')).toBeVisible();
    const returning = await context.newPage();
    observe(returning);
    await returning.goto(INVITE);
    await expect(returning.getByText('Ready room.')).toBeVisible();
    await startMatch(returning, b, names[1]);
    await returning.getByRole('button', { name: 'Randomize Fleet' }).click();
    await returning.reload();
    await expect(returning.locator('.board-ship')).toHaveCount(5);
    await returning.getByRole('button', { name: 'Forfeit Match', exact: true }).click();
    await returning.getByRole('button', { name: 'Confirm forfeit' }).click();
    await expect(b.getByText('Ready room.')).toBeVisible();
    await returning.close();
    // Explicit forfeit confirmation and automatic alarm cleanup.
    const final = await context.newPage();
    observe(final);
    await final.goto(INVITE);
    await expect(final.getByText('Ready room.')).toBeVisible();
    await startMatch(final, b, names[1]);
    await ready(final);
    await ready(b);
    await expect.poll(() => last.get(final)?.match?.phase).toBe('playing');
    await final.getByRole('button', { name: 'Forfeit Match', exact: true }).click();
    expect(last.get(final)!.match!.phase).toBe('playing');
    await final.getByRole('button', { name: 'Confirm forfeit' }).click();
    await expect(b.getByText(`${names[1]} wins at sea.`)).toBeVisible();
    await expect(b.getByText('Ready room.')).toBeVisible({ timeout: 20_000 });
    await expect(final.getByText('Ready room.')).toBeVisible();
    await final.close();
    expect(errors).toEqual([]);
  } finally {
    await bContext.close();
    await spectatorContext.close();
    for (const id of ids)
      await admin
        .evaluate(async (id) => {
          await fetch('/api/admin/decision', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id, action: 'revoke' }),
          });
        }, id)
        .catch(() => {});
    await adminContext.close();
  }
});

test('two independent battles, explicit spectating, presence and local cleanup', async ({
  browser,
}, info) => {
  const contexts: BrowserContext[] = [];
  const pages: Page[] = [];
  const userIds: string[] = [];
  const origin = process.env.BATTLESHIPS_TEST_URL ?? 'http://127.0.0.1:8788';
  const headers = { Origin: origin };
  const admin = await browser.newContext({ baseURL: origin });
  const suffix = Date.now().toString(36).slice(-6);
  const names = Array.from({ length: 6 }, (_, i) => `Crew${i}-${suffix}`);
  try {
    expect(
      (await admin.request.post('/api/admin/login', { headers, data: { passphrase: ADMIN } })).ok(),
    ).toBe(true);
    for (let i = 0; i < names.length; i++) {
      const context = await browser.newContext({ ...info.project.use, baseURL: origin });
      contexts.push(context);
      expect(
        (
          await context.request.post('/api/join', {
            headers: { ...headers, 'CF-Connecting-IP': `local-${suffix}-${i}` },
            data: { name: names[i], invite: INVITE.slice(6) },
          })
        ).ok(),
      ).toBe(true);
      const session = await (await context.request.get('/api/session')).json();
      userIds.push(session.user.id);
      expect(
        (
          await admin.request.post('/api/admin/decision', {
            headers,
            data: { id: session.user.id, action: 'approve' },
          })
        ).ok(),
      ).toBe(true);
      const page = await context.newPage();
      observe(page);
      pages.push(page);
      await page.goto('/');
      await expect(page.getByText('Ready room.')).toBeVisible();
    }
    const [a, b, c, d, s, lobby] = pages;
    await startMatch(a, b, names[1]);
    await startMatch(c, d, names[3]);
    for (const page of [a, b, c, d]) await ready(page);
    await expect.poll(() => last.get(a)?.match?.phase).toBe('playing');
    await expect.poll(() => last.get(c)?.match?.phase).toBe('playing');
    await expect(lobby.locator('.battle-list-row')).toHaveCount(2);
    await s
      .locator('.battle-list-row')
      .filter({ hasText: names[0] })
      .getByRole('button', { name: 'Spectate' })
      .click();
    await expect.poll(() => last.get(s)?.match?.id).toBe(last.get(a)!.match!.id);
    expect(last.get(s)!.match!.boards.every((board) => !board.fleet)).toBe(true);
    await expect(lobby.locator('.crew-row').filter({ hasText: names[4] })).toContainText(
      `Spectating ${names[0]} vs ${names[1]}`,
    );
    await noOverflow(lobby);
    await lobby.screenshot({ path: info.outputPath('two-battles-lobby.png'), fullPage: true });
    await s.getByRole('button', { name: 'Return to lobby', exact: true }).click();
    await s
      .locator('.battle-list-row')
      .filter({ hasText: names[2] })
      .getByRole('button', { name: 'Spectate' })
      .click();
    const second = last.get(c)!.match!.id;
    await expect.poll(() => last.get(s)?.match?.id).toBe(second);
    await a.getByRole('button', { name: 'Forfeit Match', exact: true }).click();
    await a.getByRole('button', { name: 'Confirm forfeit' }).click();
    await returnToLobby(b);
    expect(last.get(s)!.match!.id).toBe(second);
    expect(last.get(c)!.match!.phase).toBe('playing');
    await expect(lobby.locator('.battle-list-row')).toHaveCount(1);
    await c.getByRole('button', { name: 'Forfeit Match', exact: true }).click();
    await c.getByRole('button', { name: 'Confirm forfeit' }).click();
    await returnToLobby(d);
    await expect(s.getByText('Ready room.')).toBeVisible();
  } finally {
    for (const id of userIds)
      await admin.request.post('/api/admin/decision', { headers, data: { id, action: 'revoke' } });
    await Promise.all(contexts.map((context) => context.close()));
    await admin.close();
  }
});

test('HTTP authorization, invitation, approval denial and CSRF boundaries', async ({
  page,
  request,
  browser,
}) => {
  await page.goto('/');
  await expect(page).toHaveTitle('Battleships OMP v1.1');
  await expect(page.getByRole('heading', { name: 'BATTLESHIPS', exact: true })).toBeVisible();
  await expect(page.locator('body')).not.toContainText(/tideline|battleships club/i);
  expect((await request.get('/api/admin/users')).status()).toBe(401);
  expect(
    (await request.post('/api/join', { data: { invite: 'bad', name: 'Nobody' } })).status(),
  ).toBe(403);
  const invalid = await page.evaluate(async () => {
    const r = await fetch('/api/join', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ invite: 'bad', name: 'Nobody' }),
    });
    return r.status;
  });
  expect(invalid).toBe(403);
  const unauth = await page.evaluate(async () => {
    const r = await fetch('/api/admin/decision', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: 'fake', action: 'approve' }),
    });
    return r.status;
  });
  expect(unauth).toBe(401);
  const response = await request.get('/');
  expect(response.headers()['content-security-policy']).toContain("frame-ancestors 'none'");
  expect(response.headers()['referrer-policy']).toBe('no-referrer');
  const adminContext = await browser.newContext({
    baseURL: process.env.BATTLESHIPS_TEST_URL ?? 'http://127.0.0.1:8788',
  });
  const admin = await adminContext.newPage();
  const name = `Denied-${Date.now().toString(36).slice(-6)}`;
  try {
    await admin.goto('/admin');
    await admin.getByLabel('Admin passphrase').fill(ADMIN);
    await admin.getByRole('button', { name: 'Enter command' }).click();
    await page.goto(INVITE);
    await page.getByLabel('Your callsign').fill(name);
    await page.getByRole('button', { name: 'Request Access' }).click();
    await expect(page.getByText('Waiting for approval', { exact: false })).toBeVisible();
    const denial = await page.evaluate(
      () =>
        new Promise<number>((resolve) => {
          const ws = new WebSocket(`ws://${location.host}/api/ws`);
          ws.onclose = (e) => resolve(e.code);
          ws.onopen = () => {
            ws.close();
            resolve(101);
          };
        }),
    );
    expect(denial).not.toBe(101);
    await admin
      .locator('.admin-user')
      .filter({ hasText: name })
      .getByRole('button', { name: 'Deny', exact: true })
      .click();
    await expect(
      page.getByText('Your previous access was denied.', { exact: false }),
    ).toBeVisible();
    await page.getByLabel('Your callsign').fill(`${name}B`);
    await page.getByRole('button', { name: 'Request Access' }).click();
    await admin
      .locator('.admin-user')
      .filter({ hasText: `${name}B` })
      .getByRole('button', { name: 'Approve', exact: true })
      .click();
    await expect(page.getByText('Ready room.')).toBeVisible();
    const id = await page.evaluate(async () => {
      const r = await fetch('/api/session');
      return ((await r.json()) as { user: { id: string } }).user.id;
    });
    await admin.evaluate(async (id) => {
      await fetch('/api/admin/decision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action: 'revoke' }),
      });
    }, id);
    await expect(
      page.getByText('Your previous access was revoked.', { exact: false }),
    ).toBeVisible();
  } finally {
    await adminContext.close();
  }
});
