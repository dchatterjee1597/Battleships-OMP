import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { Board } from './Board';
import { ShipArt } from './ShipArt';
import {
  SHIPS,
  randomFleet,
  validPlacement,
  type Fleet,
  type Placement as Placed,
  type ShipId,
} from '../shared/game';
export function Placement({
  draftKey,
  locked,
  busy,
  onReady,
}: {
  draftKey: string;
  locked?: Fleet;
  busy: boolean;
  onReady: (fleet: Fleet) => void;
}) {
  const [fleet, setFleet] = useState<Fleet>(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(draftKey) ?? '[]') as Fleet;
      if (
        Array.isArray(saved) &&
        saved.length <= 5 &&
        new Set(saved.map((s) => s.id)).size === saved.length &&
        saved.every((s) => s && validPlacement(s, saved))
      )
        return saved;
    } catch {
      /* Storage may be unavailable or contain an old draft. */
    }
    return [];
  });
  useEffect(() => {
    try {
      if (locked) sessionStorage.removeItem(draftKey);
      else sessionStorage.setItem(draftKey, JSON.stringify(fleet));
    } catch {
      /* In-memory placement still works when browser storage is disabled. */
    }
  }, [draftKey, fleet, locked]);
  const [selected, setSelected] = useState<ShipId>('carrier');
  const [vertical, setVertical] = useState(false);
  const [preview, setPreview] = useState<Placed | null>(null);
  const [message, setMessage] = useState(
    'Drag a vessel onto the grid, or select a vessel and tap its starting cell.',
  );
  const board = useRef<HTMLDivElement>(null);
  const drag = useRef<{
    id: ShipId;
    x: number;
    y: number;
    moved: boolean;
    vertical: boolean;
  } | null>(null);
  const ignoreClick = useRef(false);
  const active = SHIPS.find((s) => s.id === selected)!;
  function place(ship: Placed) {
    if (!validPlacement(ship, fleet)) {
      setMessage('Invalid position: keep the entire vessel inside the grid, clear of other ships.');
      return;
    }
    const next = [...fleet.filter((s) => s.id !== ship.id), ship];
    setFleet(next);
    setMessage(
      `${SHIPS.find((s) => s.id === ship.id)!.name} positioned. ${next.length}/5 vessels deployed.`,
    );
    const remaining = SHIPS.find((s) => !next.some((p) => p.id === s.id));
    if (remaining) setSelected(remaining.id);
  }
  function pointerDown(e: PointerEvent<HTMLDivElement>) {
    if (locked || busy || e.button !== 0) return;
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-ship]');
    const id = el?.dataset.ship as ShipId | undefined;
    if (!id) return;
    const existing = fleet.find((s) => s.id === id);
    const direction = existing?.vertical ?? vertical;
    setSelected(id);
    setVertical(direction);
    drag.current = { id, x: e.clientX, y: e.clientY, moved: false, vertical: direction };
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function position(e: PointerEvent<HTMLDivElement>): Placed | null {
    const bounds = board.current?.getBoundingClientRect();
    if (!bounds || !drag.current) return null;
    return {
      id: drag.current.id,
      x: Math.floor((e.clientX - bounds.left) / (bounds.width / 10)),
      y: Math.floor((e.clientY - bounds.top) / (bounds.height / 10)),
      vertical: drag.current.vertical,
    };
  }
  function move(e: PointerEvent<HTMLDivElement>) {
    if (!drag.current) return;
    if (Math.hypot(e.clientX - drag.current.x, e.clientY - drag.current.y) > 5)
      drag.current.moved = true;
    if (drag.current.moved) {
      setPreview(position(e));
      e.preventDefault();
    }
  }
  function up(e: PointerEvent<HTMLDivElement>) {
    if (drag.current?.moved) {
      const p = position(e);
      if (p) place(p);
      ignoreClick.current = true;
      setTimeout(() => {
        ignoreClick.current = false;
      }, 0);
    }
    drag.current = null;
    setPreview(null);
  }
  function rotate() {
    setVertical((v) => !v);
    const existing = fleet.find((s) => s.id === selected);
    if (existing) {
      const rotated = { ...existing, vertical: !existing.vertical };
      if (validPlacement(rotated, fleet)) {
        setFleet((f) => f.map((s) => (s.id === selected ? rotated : s)));
        setMessage(`${active.name} rotated.`);
      } else {
        setMessage('Cannot rotate here: move the vessel into open water first.');
        setVertical(existing.vertical);
      }
    }
  }
  return (
    <div
      className="placement-layout"
      onPointerDown={pointerDown}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={() => {
        drag.current = null;
        setPreview(null);
      }}
    >
      <div>
        <Board
          title="Your home waters"
          subtitle="DEPLOYMENT / PRIVATE GRID"
          fleet={locked ?? fleet}
          placement
          boardRef={board}
          interactive={!locked && !busy}
          preview={preview}
          validPreview={preview ? validPlacement(preview, fleet) : false}
          onCell={(cell) => {
            if (ignoreClick.current) {
              ignoreClick.current = false;
              return;
            }
            const existing = fleet.find((s) => s.id === selected);
            place({
              id: selected,
              x: cell % 10,
              y: Math.floor(cell / 10),
              vertical: existing?.vertical ?? vertical,
            });
          }}
        />
        <p className="placement-help" role="status">
          {locked
            ? 'Fleet locked. Waiting for your opponent to finish deployment.'
            : preview
              ? validPlacement(preview, fleet)
                ? 'Release to deploy here.'
                : 'Invalid position — overlap or outside the grid.'
              : message}
        </p>
      </div>
      <aside className="panel deployment-controls">
        <span className="eyebrow">FLEET MANIFEST</span>
        <h2>{locked ? 'Fleet locked.' : 'Deploy your fleet.'}</h2>
        <p className="muted">
          Five vessels. One formation.
          <br />
          Your positions stay private.
        </p>
        <div className="fleet-tray">
          {SHIPS.map((ship) => (
            <button
              key={ship.id}
              data-ship={ship.id}
              aria-pressed={selected === ship.id}
              className={`tray-ship ${selected === ship.id ? 'selected' : ''}`}
              disabled={!!locked || busy}
              onClick={() => {
                setSelected(ship.id);
                setVertical(fleet.find((s) => s.id === ship.id)?.vertical ?? vertical);
              }}
            >
              <ShipArt id={ship.id} />
              <span>
                {ship.name}
                <small>
                  {ship.length} cells ·{' '}
                  {(locked ?? fleet).some((s) => s.id === ship.id) ? 'Deployed' : 'In reserve'}
                </small>
              </span>
            </button>
          ))}
        </div>
        {!locked ? (
          <>
            <button className="secondary full" onClick={rotate} disabled={busy}>
              ↻ Rotate · {vertical ? 'Vertical' : 'Horizontal'}
            </button>
            <button
              className="secondary full"
              disabled={busy}
              onClick={() => {
                setFleet(randomFleet());
                setMessage('Fleet randomized. Drag any vessel to adjust it before locking.');
              }}
            >
              ⤨ Randomize Fleet
            </button>
            <button
              className="primary full"
              disabled={fleet.length !== 5 || busy}
              onClick={() => onReady(fleet)}
            >
              Ready · Lock fleet →
            </button>
            <small className="muted">Ready locks your fleet for this match.</small>
          </>
        ) : (
          <div className="notice mint">✓ Fleet locked · awaiting opponent</div>
        )}
      </aside>
    </div>
  );
}
