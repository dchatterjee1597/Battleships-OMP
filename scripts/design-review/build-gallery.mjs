// Validate study PNGs or (--final) actual app captures and build an offline index.
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { inflateSync } from 'node:zlib';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const review = path.join(root, 'design-review');
const final = process.argv.includes('--final');
const destination = path.join(review, final ? 'final-tabletop-implementation' : 'notes');
const sets = final
  ? [['final-tabletop-implementation', 'Implemented BATTLESHIPS frontend']]
  : [
      ['baseline-screenshots', 'Baseline'],
      ['cold-war-ops-room', 'Cold War Ops Room'],
      ['premium-tabletop-strategy', 'Premium Tabletop Strategy Game'],
    ];
const names = [
  'desktop-admin',
  'desktop-lobby',
  'desktop-match',
  'mobile-admin',
  'mobile-lobby',
  'mobile-match',
];
if (final) names.splice(2, 0, 'desktop-placement');
if (final) names.splice(6, 0, 'mobile-placement');
const heading = final
  ? 'BATTLESHIPS · Final Tabletop Implementation'
  : 'Battleships · Design Review';
const description = final
  ? 'Eight screenshots from the actual running React app. Desktop 1440 × 1000; mobile 390 × 844. No image generation.'
  : 'Six actual UI captures, two alternative visual themes. Select a screen to compare all three versions.';
const imagePath = (directory, name) => (final ? `${name}.png` : `../${directory}/${name}.png`);
const catalog = [];
for (const [directory] of sets)
  for (const name of names) {
    const relative = `${directory}/${name}.png`;
    const png = await readFile(path.join(review, relative));
    if (!png.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])))
      throw new Error(`Not PNG: ${relative}`);
    const data = [];
    let ended = false;
    for (let offset = 8; offset < png.length;) {
      const length = png.readUInt32BE(offset);
      if (offset + length + 12 > png.length) throw new Error(`Truncated PNG: ${relative}`);
      const type = png.toString('ascii', offset + 4, offset + 8);
      if (type === 'IDAT') data.push(png.subarray(offset + 8, offset + 8 + length));
      if (type === 'IEND') ended = true;
      offset += length + 12;
    }
    if (!ended || inflateSync(Buffer.concat(data)).length === 0)
      throw new Error(`Invalid image data: ${relative}`);
    catalog.push({
      file: relative,
      width: png.readUInt32BE(16),
      height: png.readUInt32BE(20),
      bytes: png.length,
      sha256: createHash('sha256').update(png).digest('hex'),
    });
  }
await writeFile(
  path.join(destination, 'image-catalog.json'),
  JSON.stringify(catalog, null, 2) + '\n',
);
await writeFile(
  path.join(destination, 'index.md'),
  `# ${heading}\n\n[Open the offline gallery](index.html)${final ? ' · [Implementation notes](implementation-notes.md) · [Capture metadata](capture-metadata.json)' : ' · [Read the summary](design-review-summary.md)'}\n\n${description}\n\n` +
    (final
      ? '| Screen | Actual app |\n| --- | --- |\n'
      : '| Screen | Baseline | Cold War Ops Room | Premium Tabletop Strategy Game |\n| --- | --- | --- | --- |\n') +
    names
      .map(
        (name) =>
          `| ${name} | ${sets.map(([directory]) => `[View](${imagePath(directory, name)})`).join(' | ')} |`,
      )
      .join('\n') +
    (final
      ? '\n\nAdditional access, challenge, spectator and result captures are in `qa/`. [Normal mobile fixed action bar](qa/mobile-match-viewport.png). Historical references remain in [the original study gallery](../notes/index.html).\n'
      : '\n'),
);
const cards = names
  .map(
    (name, i) =>
      `<section data-screen="${name}" ${i ? 'hidden' : ''}><h2>${name.replaceAll('-', ' ')}</h2><div class="comparison">${sets.map(([directory, title]) => `<article><h3>${title}</h3><a href="${imagePath(directory, name)}" target="_blank" rel="noopener"><img src="${imagePath(directory, name)}" alt="${title} ${name}" loading="lazy"></a><p><a href="${imagePath(directory, name)}" target="_blank" rel="noopener">Open full PNG</a></p></article>`).join('')}</div></section>`,
  )
  .join('\n');
await writeFile(
  path.join(destination, 'index.html'),
  `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${heading}</title><style>
*{box-sizing:border-box}body{margin:0;background:#eaece8;color:#203642;font:15px/1.5 system-ui,sans-serif}header,main{max-width:1720px;margin:auto;padding:24px 32px}header{border-bottom:1px solid #c5cec9}h1{font-size:32px;margin:0 0 8px}h2{text-transform:capitalize;margin:16px 0}h3{font-size:16px;margin:0;padding:14px 16px;border-bottom:1px solid #d4dcd7}p{margin:8px 0}a{color:#285b71}nav{display:flex;flex-wrap:wrap;gap:8px;margin-top:20px}button{font:inherit;border:1px solid #bdcac3;background:#f6f8f5;border-radius:8px;padding:9px 16px;cursor:pointer}button[aria-pressed=true]{background:#233d4b;color:white;border-color:#233d4b}.comparison{display:grid;grid-template-columns:repeat(${final ? 1 : 3},minmax(0,1fr));gap:20px;align-items:start}article{background:#f8faf7;border:1px solid #c9d2cb;border-radius:10px;overflow:hidden}article img{display:block;width:100%;height:auto}article p{padding:8px 16px}small{display:block;color:#526771;margin-top:8px}[hidden]{display:none!important}@media(max-width:850px){header,main{padding:20px 16px}.comparison{grid-template-columns:1fr}}
</style></head><body><header><h1>${heading}</h1><p>${description}</p><p>${final ? '<a href="implementation-notes.md">Implementation notes</a> · <a href="../notes/index.html">Original design study</a>' : '<a href="design-review-summary.md">Summary and rerun instructions</a> · <a href="generation-prompts.md">Historical generation prompts</a>'} · <a href="image-catalog.json">Image dimensions and hashes</a></p><small>${final ? 'Actual populated app states. Full-page mobile match capture relocates the fixed dock into footer space; qa/mobile-match-viewport.png shows its normal position.' : 'Historical concepts retain pre-rebrand labels and generated proportions. Mobile concepts condense long scroll captures.'} Click any image for its full PNG.</small><nav aria-label="Choose screen">${names.map((name, i) => `<button type="button" data-choice="${name}" aria-pressed="${i === 0}">${name.replaceAll('-', ' ')}</button>`).join('')}</nav></header><main>${cards}</main><script>
document.querySelectorAll('[data-choice]').forEach(button=>button.addEventListener('click',()=>{document.querySelectorAll('[data-choice]').forEach(item=>item.setAttribute('aria-pressed',String(item===button)));document.querySelectorAll('[data-screen]').forEach(section=>section.hidden=section.dataset.screen!==button.dataset.choice);}));
</script></body></html>\n`,
);
console.log(
  `Validated ${catalog.length} PNGs and built ${path.relative(root, destination)}/index.html`,
);
for (const file of catalog) console.log(`${file.file}: ${file.width} × ${file.height}`);

if (process.argv.includes('--verify-browser')) {
  const { chromium, expect } = await import('@playwright/test');
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(pathToFileURL(path.join(destination, 'index.html')).href);
    for (const name of names) {
      await page.locator(`[data-choice="${name}"]`).click();
      const section = page.locator(`[data-screen="${name}"]`);
      await expect(section).toBeVisible();
      for (const image of await section.locator('img').all()) {
        await image.scrollIntoViewIfNeeded();
        await expect
          .poll(() => image.evaluate((element) => element.complete && element.naturalWidth > 0))
          .toBe(true);
      }
    }
    expect(errors).toEqual([]);
    console.log(
      'Offline gallery verified: all selectors and decoded local images, no page errors.',
    );
  } finally {
    await browser.close();
  }
}
