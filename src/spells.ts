import type { GridPoint, TerrainSurface } from './terrain-surface';

export type Spell = 'earthquake' | 'mountain' | 'flood';
export const SPELL_COSTS: Record<Spell, number> = { earthquake: 500, mountain: 2000, flood: 3000 };
export const SPELL_NAMES: Record<Spell, string> = {
  earthquake: 'Earthquake',
  mountain: 'Mountain',
  flood: 'Flood',
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
        rises.push({ x, z, height: Math.min(8, current + 1 + Math.floor(random() * 2)) });
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

export function mountain(
  surface: TerrainSurface,
  visible: readonly GridPoint[],
  random: () => number,
  target?: GridPoint,
): boolean {
  const before = surface.levels.slice();
  const candidates = visible.filter((point) => surface.level(point.x, point.z) < 8);
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
    surface.editCorner(point.x, point.z, 8 - surface.level(point.x, point.z));
  return recordChanges(surface, before);
}
