import { TerrainSurface } from './terrain-surface';
import type { GridPoint } from './terrain-surface';
import { earthquake, flood, swampTargets, volcano } from './spells';
import type { Spell } from './spells';

export type TerrainSpell = Exclude<Spell, 'pole' | 'knight' | 'armageddon'>;
export interface SpellPlan<T> {
  preview: TerrainSurface;
  marsh: T[];
  changed: boolean;
}

/** Shared deterministic spell planning for the renderer and headless games; no live mutation/payment. */
export function planTerrainSpell<T extends GridPoint & { swamp?: boolean }>(
  surface: TerrainSurface,
  spell: TerrainSpell,
  target: T | undefined,
  lookup: (x: number, z: number) => T | undefined,
  random: () => number,
): SpellPlan<T> {
  const preview = new TerrainSurface(surface.size, surface.levels.slice(), surface.step);
  let marsh: T[] = [];
  let changed = false;
  if (spell === 'swamp' && target) {
    marsh = swampTargets(surface, target, lookup, random);
    changed = marsh.length > 0;
  } else if (spell === 'flood') changed = flood(preview);
  else if (target) {
    const center = { x: target.x + 0.5, z: target.z + 0.5 };
    if (spell === 'earthquake') changed = earthquake(preview, center, random);
    else {
      const nearby: GridPoint[] = [];
      for (let z = Math.max(0, target.z - 2); z <= Math.min(surface.size, target.z + 3); z++)
        for (let x = Math.max(0, target.x - 2); x <= Math.min(surface.size, target.x + 3); x++)
          if (Math.hypot(x - center.x, z - center.z) <= 3) nearby.push({ x, z });
      changed = volcano(preview, nearby, random, center);
    }
  }
  return { preview, marsh, changed };
}
export function safeForAllies<T extends GridPoint>(
  surface: TerrainSurface,
  plan: SpellPlan<T>,
  allies: readonly { point: GridPoint; home: GridPoint | null; castle: boolean }[],
): boolean {
  return !allies.some((actor) => {
    if (actor.home) {
      const radius = actor.castle ? 1 : 0;
      for (let z = actor.home.z - radius; z <= actor.home.z + radius + 1; z++)
        for (let x = actor.home.x - radius; x <= actor.home.x + radius + 1; x++)
          if (surface.level(x, z) !== plan.preview.level(x, z)) return true;
    } else if (
      Math.abs(
        surface.sample(actor.point.x, actor.point.z) -
          plan.preview.sample(actor.point.x, actor.point.z),
      ) > 1e-6
    )
      return true;
    const point = actor.home ?? { x: Math.floor(actor.point.x), z: Math.floor(actor.point.z) };
    const radius = actor.home && actor.castle ? 1 : 0;
    return plan.marsh.some(
      (tile) => Math.abs(tile.x - point.x) <= radius && Math.abs(tile.z - point.z) <= radius,
    );
  });
}
