export const SHIPS = [
  { id: 'carrier', name: 'Aircraft Carrier', length: 5, color: '#a8bed7' },
  { id: 'battleship', name: 'Battleship', length: 4, color: '#b7b0d0' },
  { id: 'cruiser', name: 'Cruiser', length: 3, color: '#97c6bd' },
  { id: 'submarine', name: 'Submarine', length: 3, color: '#d2bc9e' },
  { id: 'destroyer', name: 'Destroyer', length: 2, color: '#d5adb3' },
] as const;
export type ShipId = (typeof SHIPS)[number]['id'];
export type Placement = { id: ShipId; x: number; y: number; vertical: boolean };
export type Fleet = Placement[];
export type Shot = {
  cell: number;
  result: 'MISS' | 'HIT' | 'HIT & SINK';
  ship?: ShipId;
  /** Public presentation metadata: already-hit cells of a fully sunk vessel. */
  sunkCells?: number[];
};
export const coordinate = (cell: number) =>
  `${String.fromCharCode(65 + (cell % 10))}${Math.floor(cell / 10) + 1}`;
export const shipName = (id: ShipId) => SHIPS.find((s) => s.id === id)!.name;
export function cells(ship: Placement): number[] {
  const type = SHIPS.find((s) => s.id === ship.id);
  if (!type) throw new Error('Unknown vessel.');
  return Array.from(
    { length: type.length },
    (_, i) => (ship.y + (ship.vertical ? i : 0)) * 10 + ship.x + (ship.vertical ? 0 : i),
  );
}
export function validPlacement(ship: Placement, others: Fleet): boolean {
  const type = SHIPS.find((s) => s.id === ship.id);
  if (
    !type ||
    !Number.isInteger(ship.x) ||
    !Number.isInteger(ship.y) ||
    typeof ship.vertical !== 'boolean'
  )
    return false;
  if (
    ship.x < 0 ||
    ship.y < 0 ||
    ship.x + (ship.vertical ? 1 : type.length) > 10 ||
    ship.y + (ship.vertical ? type.length : 1) > 10
  )
    return false;
  const occupied = new Set(others.filter((s) => s.id !== ship.id).flatMap(cells));
  return cells(ship).every((c) => !occupied.has(c));
}
export function validateFleet(fleet: Fleet): void {
  if (
    !Array.isArray(fleet) ||
    fleet.length !== 5 ||
    new Set(fleet.map((s) => s.id)).size !== 5 ||
    !fleet.every((s) => validPlacement(s, fleet))
  )
    throw new Error('Place all five vessels inside the board without overlap.');
}
export function randomFleet(random: () => number = Math.random): Fleet {
  const fleet: Fleet = [];
  for (const type of SHIPS) {
    // Enumerating legal choices avoids unbounded retry loops.
    const choices: Placement[] = [];
    for (let y = 0; y < 10; y++)
      for (let x = 0; x < 10; x++)
        for (const vertical of [false, true]) {
          const ship = { id: type.id, x, y, vertical };
          if (validPlacement(ship, fleet)) choices.push(ship);
        }
    fleet.push(choices[Math.min(choices.length - 1, Math.floor(random() * choices.length))]);
  }
  return fleet;
}
