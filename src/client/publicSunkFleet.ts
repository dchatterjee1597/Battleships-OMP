import { cells, SHIPS, type Fleet, type Placement, type Shot } from '../shared/game';

/** Reconstruct only exact, fully hit geometry supplied by a public sink result. */
export function publicSunkFleet(shots: readonly Shot[]): Fleet {
  const fleet: Fleet = [];
  for (const shot of shots) {
    if (shot.result !== 'HIT & SINK' || !shot.ship || !shot.sunkCells) continue;
    const type = SHIPS.find((ship) => ship.id === shot.ship);
    const occupied = [...shot.sunkCells].sort((a, b) => a - b);
    if (
      !type ||
      occupied.length !== type.length ||
      new Set(occupied).size !== type.length ||
      !occupied.includes(shot.cell) ||
      occupied.some(
        (cell) =>
          !Number.isInteger(cell) ||
          cell < 0 ||
          cell > 99 ||
          !shots.some((hit) => hit.cell === cell && hit.result !== 'MISS'),
      )
    )
      continue;
    const origin = occupied[0];
    const ship: Placement = {
      id: shot.ship,
      x: origin % 10,
      y: Math.floor(origin / 10),
      vertical: occupied[1] - origin === 10,
    };
    // Reject gaps, diagonals and row wrapping rather than guessing hidden geometry.
    if (
      ship.x + (ship.vertical ? 1 : type.length) <= 10 &&
      ship.y + (ship.vertical ? type.length : 1) <= 10 &&
      cells(ship).every((cell, i) => cell === occupied[i]) &&
      !fleet.some((sunk) => sunk.id === ship.id)
    )
      fleet.push(ship);
  }
  return fleet;
}
