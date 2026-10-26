import type { GridPoint, TerrainSurface } from './terrain-surface';

export type Spell = 'earthquake' | 'mountain';
export const SPELL_COSTS: Record<Spell, number> = { earthquake: 500, mountain: 2000 };

/** Final changed points include the full cascade, not just the last edited point. */
function recordChanges(surface: TerrainSurface, before: Uint8Array): boolean {
  surface.changedPoints.length = 0;
  for (let i = 0; i < before.length; i++) {
    if (before[i] !== surface.levels[i]) surface.changedPoints.push({ x: i % (surface.size + 1), z: Math.floor(i / (surface.size + 1)) });
  }
  return surface.changedPoints.length > 0;
}

export function earthquake(surface: TerrainSurface, center: GridPoint, random: () => number, radius = 6): boolean {
  const before = surface.levels.slice();
  for (let z = Math.max(0, Math.floor(center.z - radius)); z <= Math.min(surface.size, Math.ceil(center.z + radius)); z++) {
    for (let x = Math.max(0, Math.floor(center.x - radius)); x <= Math.min(surface.size, Math.ceil(center.x + radius)); x++) {
      if (Math.hypot(x - center.x, z - center.z) > radius || random() > 0.45) continue;
      const current = surface.level(x, z);
      const next = Math.max(0, Math.min(8, current + Math.floor(random() * 5) - 2));
      surface.editCorner(x, z, next - current);
    }
  }
  // Even an unlucky random sequence should produce an effect on a valid target.
  if (!recordChanges(surface, before)) {
    const point = surface.nearestCorner(center.x, center.z);
    surface.editCorner(point.x, point.z, surface.level(point.x, point.z) < 8 ? 1 : -1);
  }
  return recordChanges(surface, before);
}

export function mountain(surface: TerrainSurface, visible: readonly GridPoint[], random: () => number, target?: GridPoint): boolean {
  const before = surface.levels.slice();
  const candidates = visible.filter(point => surface.level(point.x, point.z) < 8);
  const selected: GridPoint[] = [];
  if (target && candidates.length) {
    candidates.sort((a, b) => Math.hypot(a.x - target.x, a.z - target.z) - Math.hypot(b.x - target.x, b.z - target.z));
    const nearest = candidates.shift();
    if (nearest) selected.push(nearest);
  }
  while (candidates.length && selected.length < 3) {
    const index = Math.min(candidates.length - 1, Math.floor(random() * candidates.length));
    const point = candidates.splice(index, 1)[0];
    if (selected.some(other => Math.hypot(other.x - point.x, other.z - point.z) < 1.5)) continue;
    selected.push(point);
  }
  for (const point of selected) surface.editCorner(point.x, point.z, 8 - surface.level(point.x, point.z));
  return recordChanges(surface, before);
}
