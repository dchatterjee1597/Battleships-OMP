// Writes reproducible prompts for the built-in Codex imagegen tool; no API key or SDK.
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const notes = path.join(root, 'design-review/notes');
const captain = JSON.parse(
  await readFile(path.join(notes, 'capture-metadata.json'), 'utf8'),
).activeCaptain;
const opponent = captain === 'Maya' ? 'Arjun' : 'Maya';
const shared = `Use case: ui-mockup. Asset type: high fidelity redesigned screenshot of the existing BATTLESHIPS naval strategy game.
Image 1 is the structural source screenshot, authoritative for layout, content, panel order, board logic and responsive composition. If Image 2 is supplied, it is a STYLE reference only; use its colors, materials and type system, never its layout or content.
Create ONE flat digital product screenshot, edge to edge, with the same full-page framing and aspect ratio as Image 1. No device frame, photograph, perspective view, moodboard, annotations or multiple screens. Use BATTLESHIPS / NAVAL STRATEGY branding while preserving, original screen purpose, headings, names, counts, statuses, actions and footer. Keep text readable and accurately spelled. Apply the aesthetic through surfaces, typography, borders, local original iconography and subtle depth, preserving information architecture. No unrelated features, charts, navigation, currencies, rankings or invented controls. No external assets or third-party game artwork. Avoid clutter and illegible ornamental text. All panels shown in Image 1 must appear, including lower panels; do not crop or omit content. Preserve enabled/disabled button distinctions. This is a visual concept only; game rules remain unchanged.`;
const themes = [
  {
    directory: 'cold-war-ops-room',
    title: 'Cold War Ops Room',
    style: `Coherent design system: military/naval Cold War operations room rendered as a polished usable digital product. Charcoal #111a20 background, slate/navy #1b2a34 panels, fine desaturated olive borders, warm ivory text, restrained phosphor green #a5c88f for ready/active states, amber #d3ad65 for primary actions and targeting, desaturated red #bb7770 for hits and destructive actions. Crisp industrial sans serif headings, monospaced small tactical labels and coordinates, subtle plotting-grid texture, precise hairline dividers and tiny instrument-inspired markers. Squared corners with a small radius, restrained bevels. Atmospheric and elegant, no movie-prop wall, no excessive glow or grain. Admin feels like command/clearance management, lobby like a ready room and fleet briefing board, match like a tactical engagement console.`,
  },
  {
    directory: 'premium-tabletop-strategy',
    title: 'Premium Tabletop Strategy Game',
    style: `Coherent design system: elegant crafted premium tabletop strategy game rendered as a polished digital product. Warm linen #ece5d6 page, parchment #f8f3e8 cards, deep enamel blue #183a4c headings and selected states, muted brass #a78950 fine trim and primary actions, sage ready states and restrained terracotta hit/danger marks. Refined editorial serif headings paired with clean legible sans serif body and small monospaced coordinates. Very subtle paper/linen and wood cues, finely chamfered card edges, soft realistic shadows, tactile enamel tokens and premium ship pieces confined to the existing illustrations and board cells. Keep a flat usable interface with subtle physicality, not a photographed board or decorative tabletop scene. Admin feels like polished player clearance management, lobby like fleets staging before engagement, match like a luxury strategy board in play.`,
  },
];
const screens = {
  admin: `Preserve the header, ADMINISTRATION eyebrow, "Crew command.", browser/device approval explanation and "Sign out". Access requests 2: Nikhil and Sana with Approve and Deny. Approved devices 4: Maya, Arjun, Shore, Leena, Connected statuses and Revoke buttons. Denied devices 0 / Nothing here. All clear. Revoked devices 1 / Old device / Offline. Preserve device metadata as in source. Desktop has two columns and two rows of management panels; mobile has all four panels stacked vertically in the same order. Do not invent security controls.`,
  lobby: `Preserve the header and Live status; "PRIVATE WATERS. FRIENDLY RIVALRIES.", "A quiet sea.", "A worthy opponent.", original descriptive text and the three pills "10 × 10 waters", "5 vessels", "3-shot salvo". Keep the three original naval vessels in the existing hero illustration area. "THE READY LOBBY", "Find your next rival.", "4 online". Maya / you is Ready, Arjun and Shore Ready for a challenge with enabled Challenge buttons; Leena Not ready with disabled Challenge. Desktop retains the fieldcraft briefing at right, all three numbered steps and disconnect note. Mobile retains the existing single-column order: hero text, naval illustration, full crew panel; the briefing is hidden as in the source.`,
  match: `Preserve "02 / ENGAGEMENT", "Trust your coordinates.", "Captain · Private room", Crew manifest 4, captains Maya and Arjun, spectators Shore and Leena. Active captain is ${captain}; enemy is ${opponent}. Preserve TWO vertically stacked 10 × 10 grids with exactly columns A–J and rows 1–10. Enemy waters above home waters. Enemy hidden fleet remains hidden: only public hit/miss/sunk marks and selected targets may be shown. Preserve private five-ship fleet geometry on home grid and exact shot markers from source. Preserve sunk Destroyer status, all board legends and status strips. Controls retain FIRE CONTROL, YOUR TURN, Normal Shot, Salvo ×3, Salvo available, selected C1 · D1 · E1, enabled Fire Salvo, Forfeit Match and Signal log. Desktop retains crew at left, boards in the center and controls at right. Mobile retains the expanded crew disclosure, enemy board, fire-control panel, home board and fixed bottom firing bar in the exact source sequence. Do not convert vertically stacked grids into side-by-side grids; do not add or reveal enemy vessels, extra grids or new gameplay controls.`,
};
const jobs = [];
for (const theme of themes)
  for (const device of ['desktop', 'mobile'])
    for (const screen of ['admin', 'lobby', 'match']) {
      const filename = `${device}-${screen}.png`;
      const prompt = `${shared}\n\nTheme: ${theme.title}.\n${theme.style}\n\nScreen constraints: ${screens[screen]}\nResponsive variant: ${device}. Preserve the full source composition, proportions and content. ${device === 'mobile' ? 'This is a tall narrow full-page mobile scroll capture, not a compressed desktop layout. Preserve every vertical section, readable mobile text and the original narrow width.' : 'This is a full-page desktop capture. Preserve the existing generous layout and sidebar locations.'}${device === 'mobile' && screen === 'match' ? '\nMobile match canvas refinement: Produce a full-width 1:3 portrait canvas (approximately 768 × 2304). The UI must fill the image width with small normal mobile edge gutters only. No broad blank side bands or narrow screenshot centered on a wider background. This overrides the request for exact source aspect ratio because the source is a very tall scroll capture. Compact vertical whitespace and the signal-log rows sufficiently to fit, keeping both 10 × 10 grids square, all existing sections in the same order, the home fleet visible, and the firing dock at the bottom. Keep header, crew with spectators, enemy board, controls, home board, footer and firing dock; omit none of them.' : ''}`;
      jobs.push({
        id: `${theme.directory}/${filename}`,
        reference: `design-review/baseline-screenshots/${filename}`,
        styleReference:
          filename === 'desktop-admin.png'
            ? null
            : `design-review/${theme.directory}/desktop-admin.png`,
        destination: `design-review/${theme.directory}/${filename}`,
        prompt,
        transparent_background: false,
      });
    }
await mkdir(notes, { recursive: true });
await writeFile(
  path.join(notes, 'generation-jobs.json'),
  JSON.stringify(
    {
      tool: 'image_gen.imagegen',
      model: 'Built-in imagegen route; user accepted GPT Image 2 / ChatGPT Images 2',
      jobs,
    },
    null,
    2,
  ) + '\n',
);
await writeFile(
  path.join(notes, 'generation-prompts.md'),
  '# Image generation prompts\n\nUse the built-in image_gen.imagegen tool once per job. Inspect each local reference with view_image before generation. Image 1 is the baseline; Image 2, where listed, is the generated desktop admin style anchor. Use referenced_image_paths, transparent_background: false, and the exact prompt below. Copy the resulting local PNG to Destination without resampling. Generate desktop-admin first for each theme.\n\n' +
    jobs
      .map(
        (job) =>
          `## ${job.id}\n\nReference: ${job.reference}\n\nStyle reference: ${job.styleReference ?? 'None (establishes this theme)'}\n\nDestination: ${job.destination}\n\n\`\`\`text\n${job.prompt}\n\`\`\`\n`,
      )
      .join('\n'),
);
console.log(`Prepared ${jobs.length} built-in imagegen jobs in design-review/notes/`);
