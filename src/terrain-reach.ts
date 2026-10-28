import type { GridPoint } from './terrain-surface';
import type { PopulationColor } from './population';
import type { Survival } from './survival';

export interface TerrainReachCharacter {
  population: PopulationColor;
  characterPower: number;
  survival: Survival;
}

/** Only the selected corner/tile center is range-limited; normal paid slope cascades still apply. */
export function withinTerrainReach<C extends TerrainReachCharacter>(
  selection: GridPoint,
  wholeTile: boolean,
  characters: readonly C[],
  human: PopulationColor,
  positionOf: (character: C) => GridPoint,
  radius = 10,
): boolean {
  const x = selection.x + (wholeTile ? 0.5 : 0);
  const z = selection.z + (wholeTile ? 0.5 : 0);
  return characters.some((character) => {
    if (
      character.population !== human ||
      character.characterPower <= 0 ||
      (character.survival.phase !== 'alive' && character.survival.phase !== 'drowning')
    )
      return false;
    const point = positionOf(character);
    return (point.x - x) ** 2 + (point.z - z) ** 2 <= radius ** 2 + 1e-9;
  });
}
