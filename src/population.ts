import type { Resident, SettlementTile } from './settlement';

export const INITIAL_CHARACTER_POWER = 10;
export const BIRTH_THRESHOLD = 20;
export const GROWTH_PER_BUILDING_LEVEL = 1;
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
    resident.characterPower += seconds * resident.power * GROWTH_PER_BUILDING_LEVEL;
    while (resident.characterPower > threshold) {
      const tile = findSpawnTile(resident.home);
      if (!tile) break; // Keep the power until there is a safe place for the newborn.
      resident.characterPower /= 2;
      births.push({ tile, characterPower: resident.characterPower });
    }
  }
  return births;
}
