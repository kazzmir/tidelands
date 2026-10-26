import type { GridPoint } from './terrain-surface';

export interface GrazingSheep<T> {
  tile: T;
  target: T | null;
}

/** Limit global spawning to one chance per ten simulation seconds, with no catch-up bursts. */
export class SheepSpawner {
  private elapsed = 0;

  constructor(
    readonly interval = 10,
    readonly chance = 0.5,
  ) {
    if (!Number.isFinite(interval) || interval <= 0)
      throw new Error('Sheep spawn interval must be positive');
    if (!Number.isFinite(chance) || chance < 0 || chance > 1)
      throw new Error('Sheep spawn chance must be between zero and one');
  }

  advance(seconds: number, eligible: boolean, random: () => number): boolean {
    if (!eligible) {
      this.elapsed = 0;
      return false;
    }
    if (!Number.isFinite(seconds) || seconds <= 0) return false;
    this.elapsed += seconds;
    if (this.elapsed + 1e-9 < this.interval) return false;
    this.elapsed = 0;
    return random() < this.chance;
  }

  reset(): void {
    this.elapsed = 0;
  }
}

/** Keep a valid flock and suggest free grazing spaces without exceeding two sheep per building. */
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
