// Captures actual UI via an isolated test Worker; --sunk checks public sunk-piece rendering.
import { chromium, expect } from '@playwright/test';
import { unstable_dev } from 'wrangler';
import WebSocket from 'ws';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
let baseURL;
const v11 = process.argv.includes('--v11');
const final = v11 || process.argv.includes('--final');
const sunkReview = process.argv.includes('--sunk');
const output = path.join(
  root,
  'design-review',
  v11
    ? 'v1.1-implementation'
    : final || sunkReview
      ? 'final-tabletop-implementation'
      : 'baseline-screenshots',
);
const runtime = path.join(root, 'design-review/.runtime', String(Date.now()));
const desktop = { width: 1440, height: 1000 };
const mobile = { width: 390, height: 844 };
const invite = '/join/local-test-invite-not-for-production-1234';
const adminPassphrase = 'local-test-admin-not-for-production';
const snapshots = new WeakMap();
const errors = [];
let browser;
let worker;
const admissionSockets = [];

async function observe(page) {
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('websocket', (socket) =>
    socket.on('framereceived', (frame) => {
      try {
        const data = JSON.parse(String(frame.payload));
        if (data.type === 'snapshot') snapshots.set(page, data);
      } catch {
        /* transport ping */
      }
    }),
  );
}

async function shot(page, cells, salvo = false) {
  await expect(page.getByRole('heading', { name: 'YOUR TURN', exact: true })).toBeVisible();
  if (salvo) await page.getByRole('button', { name: 'Salvo ×3' }).click();
  for (const cell of cells) {
    await page.locator('.boards-stack .grid').first().locator(`[data-cell="${cell}"]`).click();
  }
  const revision = snapshots.get(page).match.revision;
  await page.getByRole('button', { name: salvo ? 'Fire Salvo' : 'Fire', exact: true }).click();
  await expect.poll(() => snapshots.get(page)?.match?.revision).toBeGreaterThan(revision);
}

async function capture(page, name, viewport, match = false) {
  await page.setViewportSize(viewport);
  await expect(page).toHaveTitle('Battleships OMP v1.1');
  await expect(page.locator('body')).not.toContainText(/tideline|battleships club/i);
  if (match) {
    // Open the app's existing disclosure so player and spectator names are reviewable.
    const crew = page.locator('.crew-sidebar');
    if (!((await crew.getAttribute('open')) !== null)) await crew.locator('summary').click();
  }
  await page.evaluate(() => scrollTo(0, 0));
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    .toBe(true);
  await page.screenshot({
    path: path.join(output, `${name}.png`),
    fullPage: true,
    animations: 'disabled',
    // Full-page capture otherwise paints the fixed firing dock across grid rows.
    // Screenshot-only CSS puts that same dock in the existing blank footer space.
    style:
      match && viewport.width < 600
        ? `.fire-dock { position: absolute !important; top: ${await page.evaluate(() => document.documentElement.scrollHeight - 95)}px !important; bottom: auto !important; }`
        : undefined,
  });
  console.log(`Captured ${name}`);
}

try {
  await mkdir(output, { recursive: true });
  await mkdir(runtime, { recursive: true });
  for (const theme of ['cold-war-ops-room', 'premium-tabletop-strategy', 'notes']) {
    await mkdir(path.join(root, 'design-review', theme), { recursive: true });
  }
  worker = await unstable_dev('src/server/index.ts', {
    config: 'tests/wrangler.jsonc',
    ip: '127.0.0.1',
    port: 0,
    inspectorPort: 0,
    local: true,
    persist: true,
    persistTo: runtime,
    logLevel: 'error',
    experimental: { disableExperimentalWarning: true, disableDevRegistry: true, watch: false },
  });
  baseURL = 'http://' + worker.address + ':' + worker.port;
  browser = await chromium.launch();
  const newPage = async () => {
    const context = await browser.newContext({
      baseURL,
      viewport: desktop,
      locale: 'en-GB',
      timezoneId: 'Asia/Calcutta',
      reducedMotion: 'reduce',
      deviceScaleFactor: 1,
    });
    const page = await context.newPage();
    await observe(page);
    return page;
  };
  const admin = await newPage();
  await admin.goto('/admin');
  await expect(admin).toHaveTitle('Battleships OMP v1.1');
  if (final) {
    await mkdir(path.join(output, 'qa'), { recursive: true });
    const publicPage = await newPage();
    await publicPage.goto('/');
    await expect(
      publicPage.getByRole('heading', { name: 'BATTLESHIPS', exact: true }),
    ).toBeVisible();
    await capture(publicPage, 'qa/desktop-landing', desktop);
    await capture(publicPage, 'qa/mobile-landing', mobile);
    await publicPage.close();
    await capture(admin, 'qa/desktop-admin-login', desktop);
    await capture(admin, 'qa/mobile-admin-login', mobile);
    await admin.setViewportSize(desktop);
  }
  await admin.getByLabel('Admin passphrase').fill(adminPassphrase);
  await admin.getByRole('button', { name: 'Enter command' }).click();
  await expect(admin.getByRole('heading', { name: 'Access control.' })).toBeVisible();
  const users = [];
  const roster = [
    ['Maya', 'approved'],
    ['Arjun', 'approved'],
    ['Shore', 'approved'],
    ['Leena', 'approved'],
    ['Nikhil', 'pending'],
    ['Sana', 'pending'],
    ['Guest', 'denied'],
    ['Old device', 'revoked'],
  ];
  for (const [name, status] of sunkReview ? roster.slice(0, 4) : roster) {
    const page = await newPage();
    await page.goto(invite);
    await page.getByLabel('Your callsign').fill(name);
    await page.getByRole('button', { name: 'Request Access' }).click();
    await expect(page.getByText('Waiting for approval', { exact: false })).toBeVisible();
    if (final && name === 'Maya') {
      await capture(page, 'qa/desktop-waiting', desktop);
      await capture(page, 'qa/mobile-waiting', mobile);
      await page.setViewportSize(desktop);
    }
    const row = admin.locator('.admin-user').filter({ hasText: name });
    await expect(row).toBeVisible();
    if (status === 'approved' || status === 'revoked') {
      await row.getByRole('button', { name: 'Approve', exact: true }).click();
      await expect(page.getByText('Ready room.')).toBeVisible();
      if (status === 'revoked') {
        admin.once('dialog', (dialog) => dialog.accept());
        await row.getByRole('button', { name: 'Revoke', exact: true }).click();
      }
    } else if (status === 'denied') {
      await row.getByRole('button', { name: 'Deny', exact: true }).click();
    }
    users.push({ name, status, page });
  }
  const [a, b, spectator, shoreBreak] = users.slice(0, 4).map((user) => user.page);
  await shoreBreak.getByRole('button', { name: 'Ready', exact: true }).click();
  await expect(shoreBreak.getByText('Not ready for a match')).toBeVisible();
  if (!sunkReview) {
    await capture(admin, 'desktop-admin', desktop);
    await capture(admin, 'mobile-admin', mobile);
    await capture(a, 'desktop-lobby', desktop);
    await capture(a, 'mobile-lobby', mobile);
  }
  await a.setViewportSize(desktop);
  await a
    .locator('.crew-row')
    .filter({ hasText: 'Arjun' })
    .getByRole('button', { name: 'Challenge' })
    .click();
  if (final) {
    await capture(b, 'qa/desktop-challenge', desktop);
    await capture(b, 'qa/mobile-challenge', mobile);
    await b.setViewportSize(desktop);
  }
  await b.getByRole('button', { name: 'Accept', exact: true }).click();
  await spectator.getByRole('button', { name: 'Spectate', exact: true }).click();
  await shoreBreak.getByRole('button', { name: 'Spectate', exact: true }).click();
  for (const page of [a, b]) {
    await expect(page.getByText('Fleet deployment.')).toBeVisible();
    for (const [id, cell] of [
      ['carrier', 0],
      ['battleship', 22],
      ['cruiser', 46],
      ['submarine', 61],
      ['destroyer', 85],
    ]) {
      await page.locator(`.tray-ship[data-ship="${id}"]`).click();
      if (sunkReview && id === 'destroyer')
        await page.getByRole('button', { name: 'Rotate' }).click();
      await page.locator('.placement-grid').locator(`[data-cell="${cell}"]`).click();
    }
    await expect(page.locator('.board-ship')).toHaveCount(5);
    if (final && page === a) {
      await capture(page, 'desktop-placement', desktop, true);
      await capture(page, 'mobile-placement', mobile, true);
      await page.setViewportSize(desktop);
    }
    await page.getByRole('button', { name: 'Ready · Lock fleet' }).click();
  }
  await expect.poll(() => snapshots.get(a)?.match?.phase).toBe('playing');
  const first = snapshots.get(a).match.turn === snapshots.get(a).me.id ? a : b;
  let second = first === a ? b : a;
  // Real alternating turns: mixed hits/misses, a sunk destroyer, and one legal salvo.
  for (let i = 0; i < 2; i++) {
    await shot(first, [85 + i * (sunkReview ? 10 : 1)]);
    if (sunkReview) {
      // A partial hit never reveals a model; the exact vertical sink does.
      await expect(
        first.locator('.boards-stack .board-panel').first().locator('.board-ship'),
      ).toHaveCount(i);
      await expect(spectator.locator('.board-ship')).toHaveCount(i);
    }
    await shot(second, [i === 0 ? 22 : 99]);
  }
  await shot(first, [0, 1, 98], true);
  await shot(second, [23]);
  await shot(first, [46]);
  await shot(second, [97]);
  await shot(first, [47]);
  await shot(second, [96]);
  await expect
    .poll(() =>
      snapshots.get(first)?.match?.boards.reduce((total, board) => total + board.shots.length, 0),
    )
    .toBe(12);
  if (sunkReview) {
    // Also sink a horizontal cruiser while the carrier stays only partially hit.
    await shot(first, [48]);
    await shot(second, [94]);
    const enemy = first.locator('.boards-stack .board-panel').first();
    await expect(enemy.locator('.board-ship')).toHaveCount(2);
    await expect(enemy.locator('.sunk-public.vertical[data-ship="destroyer"]')).toHaveCount(1);
    await expect(enemy.locator('.sunk-public[data-ship="cruiser"]:not(.vertical)')).toHaveCount(1);
    await expect(enemy.locator('.board-ship[data-ship="carrier"]')).toHaveCount(0);
    await expect(enemy.locator('.ship-damage')).toHaveCount(2);
    await expect(enemy.locator('.cell.hit .shot-mark')).toHaveCount(7);
    await expect(spectator.locator('.sunk-public .ship-damage')).toHaveCount(2);
    await expect(spectator.locator('.board-ship[data-ship="carrier"]')).toHaveCount(0);
    await expect(
      first.locator('.boards-stack .board-panel').last().locator('.ship-damage'),
    ).toHaveCount(0);
    for (const page of [first, spectator])
      for (const board of snapshots.get(page).match.boards)
        for (const shot of board.shots) {
          if (shot.result === 'HIT & SINK') {
            expect(shot.sunkCells).toBeDefined();
            expect(
              shot.sunkCells.every((cell) =>
                board.shots.some((hit) => hit.cell === cell && hit.result !== 'MISS'),
              ),
            ).toBe(true);
          } else expect(shot.sunkCells).toBeUndefined();
        }
  }
  await expect.poll(() => snapshots.get(spectator)?.match?.phase).toBe('playing');
  expect(snapshots.get(spectator).match.boards.every((board) => !('fleet' in board))).toBe(true);
  expect(
    snapshots
      .get(first)
      .match.boards.filter((board) => board.fleet)
      .map((board) => board.player),
  ).toEqual([snapshots.get(first).me.id]);
  await expect(first.getByRole('button', { name: 'Salvo ×3' })).toBeEnabled();
  await first.getByRole('button', { name: 'Salvo ×3' }).click();
  for (const cell of [2, 3, 4])
    await first.locator('.boards-stack .grid').first().locator(`[data-cell="${cell}"]`).click();
  await expect(first.getByRole('button', { name: 'Fire Salvo' })).toBeEnabled();
  await capture(first, sunkReview ? 'desktop-match-sunk-ship' : 'desktop-match', desktop, true);
  await capture(first, sunkReview ? 'mobile-match-sunk-ship' : 'mobile-match', mobile, true);
  if (sunkReview) {
    await capture(spectator, 'desktop-spectator-sunk-ship', desktop, true);
    await capture(spectator, 'mobile-spectator-sunk-ship', mobile, true);
  }
  if (final) {
    await capture(spectator, 'qa/desktop-spectator', desktop, true);
    await capture(spectator, 'qa/mobile-spectator', mobile, true);
    // Check the native fixed dock in a real viewport as well as full-page review captures.
    await first.evaluate(() => scrollTo(0, 0));
    const dock = await first.locator('.fire-dock').boundingBox();
    expect(dock.y + dock.height).toBeLessThanOrEqual(mobile.height);
    await first.screenshot({
      path: path.join(output, 'qa/mobile-match-viewport.png'),
      animations: 'disabled',
    });
    for (const width of [320, 360, 768, 1024]) {
      await first.setViewportSize({ width, height: 900 });
      expect(await first.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
    }
    await first.setViewportSize(desktop);
    if (v11) {
      const returningContext = second.context();
      const before = snapshots.get(first).match;
      await second.close();
      await expect(first.getByText('Match paused — waiting for reconnection.')).toBeVisible();
      await expect(first.getByRole('button', { name: 'Fire', exact: true })).toBeDisabled();
      await capture(first, 'qa/desktop-reconnect', desktop, true);
      await capture(first, 'qa/mobile-reconnect', mobile, true);
      second = await returningContext.newPage();
      await observe(second);
      await second.goto('/');
      await expect(first.getByText('Match paused — waiting for reconnection.')).toBeHidden();
      expect(snapshots.get(first).match.id).toBe(before.id);
      expect(snapshots.get(first).match.turn).toBe(before.turn);
      expect(snapshots.get(first).match.boards).toEqual(before.boards);
      await first.setViewportSize(desktop);
    }
    await first.getByRole('button', { name: 'Forfeit Match', exact: true }).click();
    await first.getByRole('button', { name: 'Confirm forfeit' }).click();
    await expect(first.locator('.result-card.defeat')).toBeVisible();
    await capture(first, 'qa/desktop-defeat', desktop, true);
    await capture(second, 'qa/desktop-victory', desktop, true);
    await capture(first, 'qa/mobile-defeat', mobile, true);
    await capture(second, 'qa/mobile-victory', mobile, true);
  }
  if (v11) {
    // Fill real admission slots without launching 21 additional rendered game pages.
    let waiting;
    for (let i = 0; i < 22; i++) {
      const context = await browser.newContext({ baseURL });
      const headers = { Origin: baseURL, 'CF-Connecting-IP': `capture-${i}` };
      expect(
        (
          await context.request.post('/api/join', {
            headers,
            data: { name: `Reserve ${i + 1}`, invite: invite.slice(6) },
          })
        ).ok(),
      ).toBe(true);
      const session = await (await context.request.get('/api/session')).json();
      expect(
        (
          await admin.request.post('/api/admin/decision', {
            headers,
            data: { id: session.user.id, action: 'approve' },
          })
        ).ok(),
      ).toBe(true);
      if (i === 21) {
        waiting = await context.newPage();
        await observe(waiting);
        await waiting.goto('/');
      } else {
        const cookie = (await context.cookies()).map((c) => `${c.name}=${c.value}`).join('; ');
        const ws = new WebSocket(baseURL.replace('http:', 'ws:') + '/api/ws', {
          headers: { Origin: baseURL, Cookie: cookie },
        });
        admissionSockets.push(ws);
        await new Promise((resolve, reject) => {
          ws.once('open', resolve);
          ws.once('error', reject);
        });
      }
    }
    await expect(waiting.getByRole('heading', { name: 'The community is full.' })).toBeVisible();
    await capture(waiting, 'qa/desktop-community-full', desktop);
    await capture(waiting, 'qa/mobile-community-full', mobile);
    admissionSockets[0].close();
    await expect(waiting.getByText('Ready room.')).toBeVisible({ timeout: 15_000 });
  }
  expect(errors).toEqual([]);
  await writeFile(
    sunkReview
      ? path.join(output, 'sunk-ship-capture-metadata.json')
      : final
        ? path.join(output, 'capture-metadata.json')
        : path.join(root, 'design-review/notes/capture-metadata.json'),
    JSON.stringify(
      {
        capturedAt: new Date().toISOString(),
        baseURL,
        desktop,
        mobile,
        fullPage: true,
        approved: ['Maya', 'Arjun', 'Shore', 'Leena'],
        pending: sunkReview ? [] : ['Nikhil', 'Sana'],
        activeCaptain: snapshots.get(first).me.name,
        matchShots: sunkReview ? 14 : 12,
        ...(sunkReview
          ? {
              publicSunkShips: ['destroyer (vertical)', 'cruiser (horizontal)'],
              partialHitRemainsHidden: true,
            }
          : {}),
        selectedTargets: ['C1', 'D1', 'E1'],
        spectators: ['Shore', 'Leena'],
        privacyVerified: true,
        ...(v11 ? { reconnectPreserved: true, fullCommunityRetryVerified: true } : {}),
        pageErrors: errors,
      },
      null,
      2,
    ) + '\n',
  );
} finally {
  for (const ws of admissionSockets) ws.terminate();
  if (browser) await browser.close();
  await worker?.stop();
}
