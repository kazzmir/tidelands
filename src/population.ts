import type { HousePower, Resident, SettlementTile } from './settlement';

export type PopulationColor = 'red' | 'blue';

/** Uniform, opposing team colors: human red and enemy blue. */
export function populationShirtColor(population: PopulationColor): string {
  return population === 'red' ? '#d33136' : '#2d64d6';
}

export const INITIAL_CHARACTER_POWER = 10;
export const BIRTH_THRESHOLD = 20;
/** Nominal cycle from half the threshold: 2 minutes at level 1, 30 seconds at level 5. */
export function birthInterval(level: HousePower, rock = false): number {
  return level === 0 ? Infinity : (120 - (level - 1) * 22.5) * (rock ? 2 : 1);
}

export function characterGrowthRate(level: HousePower, rock = false): number {
  return BIRTH_THRESHOLD / 2 / birthInterval(level, rock);
}
export interface Newborn<T> {
  population?: PopulationColor;
  tile: T;
  characterPower: number;
}

/** Residents gain character power; a birth divides the resident's power equally. */
export function growPopulation<T extends SettlementTile>(
  residents: readonly Resident<T>[],
  seconds: number,
  findSpawnTile: (home: T) => T | null,
  threshold = BIRTH_THRESHOLD,
): Newborn<T>[] {
  const births: Newborn<T>[] = [];
  if (!Number.isFinite(seconds) || seconds <= 0) return births;
  if (!Number.isFinite(threshold) || threshold <= 0)
    throw new Error('Birth threshold must be positive');
  for (const resident of residents) {
    if (!resident.home) continue;
    resident.characterPower +=
      seconds * characterGrowthRate(resident.power, Boolean(resident.home.rock));
    while (resident.characterPower > threshold) {
      const tile = findSpawnTile(resident.home);
      if (!tile) break; // Keep the power until there is a safe place for the newborn.
      resident.characterPower /= 2;
      births.push({
        tile,
        characterPower: resident.characterPower,
        population: resident.population,
      });
    }
  }
  return births;
}
