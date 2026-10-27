import type { GridPoint, TerrainSurface } from './terrain-surface';

export interface RockTile extends GridPoint {
  rock?: boolean;
  swamp?: boolean;
}

/** Convert every surface touched by the volcano's complete height cascade into volcanic rock. */
export function markVolcanicRock<T extends RockTile>(
  surface: TerrainSurface,
  lookup: (x: number, z: number) => T | undefined,
  rocks: Set<T>,
  swamps?: Set<T>,
): void {
  for (const point of surface.changedPoints) {
    for (const neighbor of surface.affectedTiles(point.x, point.z)) {
      const tile = lookup(neighbor.x, neighbor.z);
      if (!tile || surface.sample(tile.x + 0.5, tile.z + 0.5) <= 0.08) continue;
      tile.rock = true;
      tile.swamp = false;
      rocks.add(tile);
      swamps?.delete(tile);
    }
  }
}

/** Water destroys the rock substrate; raising the ground later restores ordinary terrain. */
export function clearSubmergedRock<T extends RockTile>(
  surface: TerrainSurface,
  rocks: Set<T>,
): void {
  for (const tile of rocks) {
    if (surface.sample(tile.x + 0.5, tile.z + 0.5) > 0.08) continue;
    tile.rock = false;
    rocks.delete(tile);
  }
}
