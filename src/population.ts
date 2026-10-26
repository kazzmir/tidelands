import type { HousePower, Resident, SettlementTile } from './settlement';

export const INITIAL_CHARACTER_POWER = 10;
export const BIRTH_THRESHOLD = 20;
/** Nominal cycle from half the threshold: 2 minutes at level 1, 30 seconds at level 5. */
export function birthInterval(level: HousePower): number {
  return level === 0 ? Infinity : 120 - (level - 1) * 22.5;
}

export function characterGrowthRate(level: HousePower): number {
  return (BIRTH_THRESHOLD / 2) / birthInterval(level);
}
export interface Newborn<T> { tile: T; characterPower: number }

/** Residents gain character power; a birth divides the resident's power equally. */
export function growPopulation<T extends SettlementTile>(
  residents: readonly Resident<T>[],
  seconds: number,
  findSpawnTile: (home: T) => T | null,
  threshold = BIRTH_THRESHOLD,
): Newborn<T>[] {
  const births: Newborn<T>[] = [];
  if (!Number.isFinite(seconds) || seconds <= 0) return births;
  if (!Number.isFinite(threshold) || threshold <= 0) throw new Error('Birth threshold must be positive');
  for (const resident of residents) {
    if (!resident.home) continue;
    resident.characterPower += seconds * characterGrowthRate(resident.power);
    while (resident.characterPower > threshold) {
      const tile = findSpawnTile(resident.home);
      if (!tile) break; // Keep the power until there is a safe place for the newborn.
      resident.characterPower /= 2;
      births.push({ tile, characterPower: resident.characterPower });
    }
  }
  return births;
}
