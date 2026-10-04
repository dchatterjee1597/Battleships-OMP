import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { cells, SHIPS, type Placement, type Shot } from '../../src/shared/game';
import { publicSunkFleet } from '../../src/client/publicSunkFleet';
import { Board } from '../../src/client/Board';
import { ShipArt } from '../../src/client/ShipArt';

function sunkShots(ship: Placement): Shot[] {
  const occupied = cells(ship);
  return occupied.map((cell, i) =>
    i === occupied.length - 1
      ? { cell, result: 'HIT & SINK', ship: ship.id, sunkCells: [...occupied].reverse() }
      : { cell, result: 'HIT' },
  );
}

describe('public sunk-piece presentation', () => {
  for (const type of SHIPS)
    for (const vertical of [false, true])
      it(`reveals only the exact sunk ${type.id}, ${vertical ? 'vertical' : 'horizontal'}`, () => {
        const ship = { id: type.id, x: 2, y: 3, vertical };
        const shots = sunkShots(ship);
        expect(publicSunkFleet(shots.slice(0, -1))).toEqual([]);
        expect(publicSunkFleet(shots)).toEqual([ship]);
        const markup = renderToStaticMarkup(createElement(Board, { title: 'Enemy waters', shots }));
        expect(markup).toContain(`class="board-ship ${vertical ? 'vertical' : ''} sunk-public"`);
        expect(markup).toContain('class="ship-damage"');
        expect(markup.match(/class="shot-mark"/g)).toHaveLength(type.length);
      });

  it('does not guess legacy sunk positions or disclose hits on touching unsunk ships', () => {
    const ship: Placement = { id: 'destroyer', x: 3, y: 4, vertical: true };
    const shots: Shot[] = [
      { cell: 42, result: 'HIT' },
      { cell: 44, result: 'HIT' },
      ...sunkShots(ship),
    ];
    expect(publicSunkFleet(shots)).toEqual([ship]);
    expect(publicSunkFleet([{ cell: 53, result: 'HIT & SINK', ship: 'destroyer' }])).toEqual([]);
    expect(publicSunkFleet(shots.map((shot) => ({ ...shot, result: 'HIT' })))).toEqual([]);
  });

  it('rejects metadata containing unknown cells, misses, gaps, row wraps or duplicate cells', () => {
    for (const occupied of [
      [9, 10],
      [0, 2],
      [0, 0],
      [-1, 0],
      [99, 109],
      [0, 0.5],
    ]) {
      const shots: Shot[] = occupied.map((cell) => ({ cell, result: 'HIT' }));
      shots[shots.length - 1] = {
        cell: occupied.at(-1)!,
        result: 'HIT & SINK',
        ship: 'destroyer',
        sunkCells: occupied,
      };
      expect(publicSunkFleet(shots)).toEqual([]);
    }
    const shots = sunkShots({ id: 'destroyer', x: 0, y: 0, vertical: false });
    expect(publicSunkFleet(shots.slice(1))).toEqual([]);
    expect(publicSunkFleet([{ ...shots[0], result: 'MISS' }, shots[1]])).toEqual([]);
  });

  it('keeps private owner and placement models unchanged, without duplicate sunk pieces', () => {
    const ship: Placement = { id: 'destroyer', x: 0, y: 0, vertical: false };
    for (const props of [{ fleet: [ship] }, { fleet: [ship], placement: true }]) {
      const markup = renderToStaticMarkup(
        createElement(Board, {
          title: 'Your home waters',
          shots: sunkShots(ship),
          ...props,
        }),
      );
      expect(markup).not.toContain('class="ship-damage"');
      expect(markup.match(/class="board-ship /g)).toHaveLength(1);
    }
    for (const type of SHIPS) {
      expect(renderToStaticMarkup(createElement(ShipArt, { id: type.id }))).not.toContain(
        'ship-damage',
      );
    }
  });
});
