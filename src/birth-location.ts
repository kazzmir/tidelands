import type { SettlementTile } from './settlement';
import type { TerrainSurface } from './terrain-surface';

/** Shared breadth-first birth exit, including traversal out of the parent's own castle footprint. */
export function birthLocation<T extends SettlementTile>(
  home: T,
  surface: TerrainSurface,
  lookup: (x: number, z: number) => T | undefined,
  walkable: (tile: T) => boolean,
  neighbors: (tile: T) => readonly T[],
  hasTree: (tile: T) => boolean,
): T | null {
  const queue = [home],
    visited = new Set(queue);
  for (let head = 0; head < queue.length; head++) {
    const tile = queue[head];
    if (!tile.swamp && walkable(tile) && neighbors(tile).length > 0) return tile;
    for (const [dx, dz] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const next = lookup(tile.x + dx, tile.z + dz);
      if (!next || visited.has(next)) continue;
      visited.add(next);
      const ownCastle =
        home.reserved && Math.abs(next.x - home.x) <= 1 && Math.abs(next.z - home.z) <= 1;
      if (
        next.house ||
        (next.reserved && !ownCastle) ||
        hasTree(next) ||
        surface.sample(next.x + 0.5, next.z + 0.5) <= 0.08 ||
        Math.abs(
          surface.sample(next.x + 0.5, next.z + 0.5) - surface.sample(tile.x + 0.5, tile.z + 0.5),
        ) >
          surface.step + 1e-6 ||
        surface.sample(tile.x + 0.5 + dx / 2, tile.z + 0.5 + dz / 2) <= 0.08
      )
        continue;
      queue.push(next);
    }
  }
  return null;
}
