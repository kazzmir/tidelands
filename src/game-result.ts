import type { PopulationColor } from './population';

export type GameWinner = PopulationColor | 'draw';
/** Occupied buildings count through their living residents, including housed leaders.
 * Drowning characters can still be rescued; sinking/dead characters cannot recover.
 */
export function eliminationWinner(
  characters: readonly {
    population: PopulationColor;
    characterPower: number;
    survival: { phase: string };
  }[],
): GameWinner | null {
  let red = false,
    blue = false;
  for (const character of characters) {
    if (character.characterPower <= 0 || !['alive', 'drowning'].includes(character.survival.phase))
      continue;
    if (character.population === 'red') red = true;
    else blue = true;
    if (red && blue) return null;
  }
  return red ? 'red' : blue ? 'blue' : 'draw';
}
