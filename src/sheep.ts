import type { GridPoint } from './terrain-surface';

export interface GrazingSheep<T> {
  tile: T;
  target: T | null;
}

/** Keep a valid flock and fill available grazing spaces without exceeding two sheep per building. */
export function planFlock<T, S extends GrazingSheep<T>>(
  flock: readonly S[],
  farmland: ReadonlySet<T>,
  buildings: number,
  canGraze: (tile: T) => boolean,
): { keep: S[]; spawn: T[] } {
  const limit = Math.max(0, Math.floor(buildings) * 2);
  const keep = flock
    .filter((sheep) => farmland.has(sheep.tile) && canGraze(sheep.tile))
    .slice(0, limit);
  const occupied = new Set(
    keep.flatMap((sheep) => (sheep.target ? [sheep.tile, sheep.target] : [sheep.tile])),
  );
  const spawn: T[] = [];
  for (const tile of farmland) {
    if (keep.length + spawn.length >= limit) break;
    if (occupied.has(tile) || !canGraze(tile)) continue;
    occupied.add(tile);
    spawn.push(tile);
  }
  return { keep, spawn };
}

export function grazingNeighbors<T extends GridPoint>(
  tile: T,
  farmland: ReadonlySet<T>,
  lookup: (x: number, z: number) => T | undefined,
  canGraze: (tile: T) => boolean,
): T[] {
  const result: T[] = [];
  for (const [dx, dz] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ]) {
    const next = lookup(tile.x + dx, tile.z + dz);
    if (next && farmland.has(next) && canGraze(next)) result.push(next);
  }
  return result;
}
