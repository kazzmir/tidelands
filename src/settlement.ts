import type { TerrainSurface } from './terrain-surface';

export interface SettlementTile { x: number; z: number; tree: boolean; house: boolean }
export interface Resident<T extends SettlementTile> { tile: T; home: T | null }

/** A house needs a horizontal, dry surface, not merely a coplanar hillside. */
export function isHabitable(surface: TerrainSurface, tile: SettlementTile): boolean {
  const height = surface.level(tile.x, tile.z);
  return height > 0 && surface.tileCorners(tile.x, tile.z).every(point => surface.level(point.x, point.z) === height);
}

export function trySettle<T extends SettlementTile>(resident: Resident<T>, surface: TerrainSurface): boolean {
  const tile = resident.tile;
  if (resident.home || tile.house || tile.tree || !isHabitable(surface, tile)) return false;
  tile.house = true;
  resident.home = tile;
  return true;
}

/** Release residents before rebuilding terrain scenery, including after cascaded edits. */
export function releaseInvalidHomes<T extends SettlementTile>(residents: readonly Resident<T>[], surface: TerrainSurface): void {
  for (const resident of residents) {
    if (!resident.home || isHabitable(surface, resident.home)) continue;
    resident.tile = resident.home;
    resident.home.house = false;
    resident.home = null;
  }
}
