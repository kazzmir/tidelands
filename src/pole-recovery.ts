import type { PopulationColor } from './population';
import type { Survival } from './survival';
import type { GridPoint } from './terrain-surface';

export interface PoleCollector {
  population: PopulationColor;
  characterPower: number;
  home: unknown | null;
  survival: Survival;
}

/** Find the nearest living roaming teammate; keep buildings and busy fighters out of recovery. */
export function nearestPoleCollector<C extends PoleCollector>(
  target: GridPoint,
  population: PopulationColor,
  characters: readonly C[],
  positionOf: (character: C) => GridPoint,
  available: (character: C) => boolean,
): C | null {
  let closest: C | null = null;
  let best = Infinity;
  for (const character of characters) {
    if (
      character.population !== population ||
      character.home ||
      character.characterPower <= 0 ||
      character.survival.phase !== 'alive' ||
      !available(character)
    )
      continue;
    const point = positionOf(character);
    const distance = (point.x - target.x) ** 2 + (point.z - target.z) ** 2;
    if (distance < best) {
      best = distance;
      closest = character;
    }
  }
  return closest;
}
