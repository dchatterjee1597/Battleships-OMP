import type { CSSProperties, PointerEventHandler } from 'react';
import { cells, coordinate, SHIPS, type Fleet, type Placement, type Shot } from '../shared/game';
import { ShipArt } from './ShipArt';
import { publicSunkFleet } from './publicSunkFleet';
type Props = {
  title: string;
  subtitle?: string;
  fleet?: Fleet;
  shots?: Shot[];
  targets?: number[];
  interactive?: boolean;
  preview?: Placement | null;
  validPreview?: boolean;
  onCell?: (cell: number) => void;
  onPointerDown?: PointerEventHandler<HTMLDivElement>;
  boardRef?: React.RefObject<HTMLDivElement | null>;
  placement?: boolean;
};
export function Board({
  title,
  subtitle,
  fleet = [],
  shots = [],
  targets = [],
  interactive = false,
  preview,
  validPreview,
  onCell,
  onPointerDown,
  boardRef,
  placement,
}: Props) {
  const previewCells = preview ? cells(preview) : [];
  const sunkFleet = !fleet.length && !placement ? publicSunkFleet(shots) : [];
  const visibleFleet = fleet.length ? fleet : sunkFleet;
  return (
    <section className="board-panel" aria-label={title}>
      <div className="board-heading">
        <div>
          <span className="eyebrow">{subtitle ?? 'TACTICAL GRID'}</span>
          <h2>{title}</h2>
        </div>
        <span className="grid-code">10 × 10</span>
      </div>
      <div className="board-frame">
        <div className="column-labels" aria-hidden="true">
          {'ABCDEFGHIJ'.split('').map((c) => (
            <span key={c}>{c}</span>
          ))}
        </div>
        <div className="row-labels" aria-hidden="true">
          {Array.from({ length: 10 }, (_, i) => (
            <span key={i}>{i + 1}</span>
          ))}
        </div>
        <div
          ref={boardRef}
          className={`grid ${placement ? 'placement-grid' : ''}`}
          onPointerDown={onPointerDown}
        >
          {Array.from({ length: 100 }, (_, cell) => {
            const shot = shots.find((s) => s.cell === cell);
            const selected = targets.indexOf(cell);
            const ship = visibleFleet.find((s) => cells(s).includes(cell));
            const isPreview = previewCells.includes(cell);
            return (
              <button
                key={cell}
                type="button"
                data-cell={cell}
                data-ship={ship?.id}
                className={`cell ${shot ? (shot.result === 'MISS' ? 'miss' : 'hit') : ''} ${shot?.result === 'HIT & SINK' ? 'sink' : ''} ${!fleet.length && ship ? 'public-sunk' : ''} ${selected >= 0 ? 'targeted' : ''} ${isPreview ? (validPreview ? 'preview-valid' : 'preview-invalid') : ''}`}
                aria-label={`${coordinate(cell)}${shot ? ` ${shot.result}` : ''}${selected >= 0 ? ` target ${selected + 1}` : ''}${ship ? ` ${SHIPS.find((s) => s.id === ship.id)!.name}` : ''}`}
                disabled={!interactive || !!shot}
                onClick={() => onCell?.(cell)}
              >
                {selected >= 0 ? (
                  <span className="target-marker">{selected + 1}</span>
                ) : shot ? (
                  <span className="shot-mark" aria-hidden="true">
                    {shot.result === 'MISS' ? '•' : '×'}
                  </span>
                ) : null}
              </button>
            );
          })}
          <div className="fleet-overlay" aria-hidden="true">
            {visibleFleet.map((ship) => {
              const length = SHIPS.find((s) => s.id === ship.id)!.length;
              return (
                <div
                  key={ship.id}
                  className={`board-ship ${ship.vertical ? 'vertical' : ''} ${!fleet.length ? 'sunk-public' : ''}`}
                  data-ship={ship.id}
                  style={
                    {
                      left: `${ship.x * 10}%`,
                      top: `${ship.y * 10}%`,
                      width: `${length * 10}%`,
                      height: '10%',
                      '--ship-length': length,
                    } as CSSProperties
                  }
                >
                  <ShipArt id={ship.id} variant={!fleet.length ? 'sunk-public' : undefined} />
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <div className="board-legend">
        <span>
          <i className="legend-dot water" /> Uncharted
        </span>
        <span>
          <i className="legend-dot miss-dot" /> Miss
        </span>
        <span>
          <i className="legend-dot hit-dot" /> Hit
        </span>
        {fleet.length > 0 && (
          <span>
            <i className="legend-dot fleet-dot" /> Your fleet
          </span>
        )}
      </div>
    </section>
  );
}
