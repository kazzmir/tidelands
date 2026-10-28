import type { GridPoint, TerrainSurface } from './terrain-surface';

export type Spell = 'earthquake' | 'volcano' | 'flood' | 'swamp' | 'knight' | 'armageddon';
export const SPELL_COSTS: Record<Spell, number> = {
  earthquake: 500,
  knight: 1000,
  volcano: 2000,
  flood: 3000,
  swamp: 1500,
  armageddon: 6000,
};
export const SPELL_NAMES: Record<Spell, string> = {
  earthquake: 'Earthquake',
  knight: 'Knight',
  volcano: 'Volcano',
  flood: 'Flood',
  swamp: 'Swamp',
  armageddon: 'Armageddon',
};

/** Final changed points include the full cascade, not just the last edited point. */
function recordChanges(surface: TerrainSurface, before: Uint8Array): boolean {
  surface.changedPoints.length = 0;
  for (let i = 0; i < before.length; i++) {
    if (before[i] !== surface.levels[i])
      surface.changedPoints.push({
        x: i % (surface.size + 1),
        z: Math.floor(i / (surface.size + 1)),
      });
  }
  return surface.changedPoints.length > 0;
}

export function earthquake(
  surface: TerrainSurface,
  center: GridPoint,
  random: () => number,
  radius = 6,
): boolean {
  const before = surface.levels.slice();
  const rises: Array<GridPoint & { height: number }> = [];
  const falls: Array<GridPoint & { height: number }> = [];
  for (
    let z = Math.max(0, Math.floor(center.z - radius));
    z <= Math.min(surface.size, Math.ceil(center.z + radius));
    z++
  ) {
    for (
      let x = Math.max(0, Math.floor(center.x - radius));
      x <= Math.min(surface.size, Math.ceil(center.x + radius));
      x++
    ) {
      if (Math.hypot(x - center.x, z - center.z) > radius) continue;
      const current = surface.level(x, z);
      if (random() < 0.1) {
        rises.push({
          x,
          z,
          height: Math.min(surface.maxHeight, current + 1 + Math.floor(random() * 2)),
        });
      } else {
        falls.push({ x, z, height: Math.max(0, current - 1 - Math.floor(random() * current)) });
      }
    }
  }
  // Resolve uplift first, then subsidence so upward cascades cannot undo the flooding.
  for (const point of rises) {
    const current = surface.level(point.x, point.z);
    if (point.height > current) surface.editCorner(point.x, point.z, point.height - current);
  }
  for (const point of falls) {
    const current = surface.level(point.x, point.z);
    if (point.height < current) surface.editCorner(point.x, point.z, point.height - current);
  }
  return recordChanges(surface, before);
}

/** Plan a targeted conversion without mutating tiles before the spell cost is paid. */
export function swampTargets<T extends GridPoint & { swamp?: boolean }>(
  surface: TerrainSurface,
  center: GridPoint,
  lookup: (x: number, z: number) => T | undefined,
  random: () => number,
  radius = 10,
): T[] {
  const targets: T[] = [];
  for (
    let z = Math.max(0, center.z - radius);
    z <= Math.min(surface.size - 1, center.z + radius);
    z++
  ) {
    for (
      let x = Math.max(0, center.x - radius);
      x <= Math.min(surface.size - 1, center.x + radius);
      x++
    ) {
      if (
        Math.hypot(x - center.x, z - center.z) > radius ||
        surface.sample(x + 0.5, z + 0.5) <= 0.08
      )
        continue;
      const tile = lookup(x, z);
      if (tile && !tile.swamp && random() < 0.75) targets.push(tile);
    }
  }
  return targets;
}

/** Submerging a swamp destroys it rather than hiding it for a later terrain raise. */
export function clearSubmergedSwamps<T extends GridPoint & { swamp?: boolean }>(
  surface: TerrainSurface,
  tiles: Set<T>,
): void {
  for (const tile of tiles) {
    if (surface.sample(tile.x + 0.5, tile.z + 0.5) > 0.08) continue;
    tile.swamp = false;
    tiles.delete(tile);
  }
}

/** A world-wide sea-level rise, represented by lowering all nonzero terrain by one. */
export function flood(surface: TerrainSurface): boolean {
  surface.changedPoints.length = 0;
  const width = surface.size + 1;
  for (let index = 0; index < surface.levels.length; index++) {
    if (surface.levels[index] === 0) continue;
    surface.levels[index]--;
    surface.changedPoints.push({ x: index % width, z: Math.floor(index / width) });
  }
  return surface.changedPoints.length > 0;
}

export function volcano(
  surface: TerrainSurface,
  visible: readonly GridPoint[],
  random: () => number,
  target?: GridPoint,
): boolean {
  const before = surface.levels.slice();
  const candidates = visible.filter((point) => surface.level(point.x, point.z) < surface.maxHeight);
  const selected: GridPoint[] = [];
  if (target && candidates.length) {
    candidates.sort(
      (a, b) =>
        Math.hypot(a.x - target.x, a.z - target.z) - Math.hypot(b.x - target.x, b.z - target.z),
    );
    const nearest = candidates.shift();
    if (nearest) selected.push(nearest);
  }
  while (candidates.length && selected.length < 3) {
    const index = Math.min(candidates.length - 1, Math.floor(random() * candidates.length));
    const point = candidates.splice(index, 1)[0];
    if (selected.some((other) => Math.hypot(other.x - point.x, other.z - point.z) < 1.5)) continue;
    selected.push(point);
  }
  for (const point of selected)
    surface.editCorner(point.x, point.z, surface.maxHeight - surface.level(point.x, point.z));
  return recordChanges(surface, before);
}
