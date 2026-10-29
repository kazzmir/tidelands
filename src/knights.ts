import type { PopulationColor } from './population';
import type { Survival } from './survival';
import type { GridPoint } from './terrain-surface';

export interface CombatCharacter {
  population: PopulationColor;
  characterPower: number;
  knight: boolean;
  home: unknown | null;
  survival: Survival;
}
export type KnightConversion =
  | 'converted'
  | 'no-leader'
  | 'housed'
  | 'already-knight'
  | 'unavailable'
  | 'insufficient';

/** Character power is also HP. Apply the permanent multiplier exactly once, only after payment. */
export function convertLeaderToKnight(
  leader: CombatCharacter | null,
  spend: () => boolean,
): KnightConversion {
  if (!leader) return 'no-leader';
  if (leader.knight) return 'already-knight';
  if (leader.home) return 'housed';
  if (leader.survival.phase !== 'alive' || leader.characterPower <= 0) return 'unavailable';
  if (!spend()) return 'insufficient';
  leader.knight = true;
  leader.characterPower *= 1.5;
  return 'converted';
}

export function nearestEnemy<C extends CombatCharacter>(
  character: C,
  population: readonly C[],
  tileOf: (character: C) => GridPoint,
): C | null {
  const origin = tileOf(character);
  let nearest: C | null = null;
  let distance = Infinity;
  for (const other of population) {
    if (
      other.population === character.population ||
      other.characterPower <= 0 ||
      other.survival.phase !== 'alive'
    )
      continue;
    const tile = tileOf(other);
    const squared = (tile.x - origin.x) ** 2 + (tile.z - origin.z) ** 2;
    if (squared < distance) {
      nearest = other;
      distance = squared;
    }
  }
  return nearest;
}

export function inCombatRange(a: GridPoint, b: GridPoint, range = 1): boolean {
  return Math.abs(a.x - b.x) + Math.abs(a.z - b.z) <= range;
}

/** Proportional HP damage; the production CombatSystem snapshots engagement power. */
export function combatStrength(character: CombatCharacter): number {
  return Math.max(0, character.characterPower) / 5;
}

/** Snapshot simultaneous melee damage, including retaliation, without array-order advantages. */
export function advanceKnightCombat<C extends CombatCharacter>(
  characters: readonly C[],
  seconds: number,
  tileOf: (character: C) => GridPoint,
): C[] {
  if (!Number.isFinite(seconds) || seconds <= 0) return [];
  const damage = new Map<C, number>();
  const pairs = new Set<string>();
  for (let i = 0; i < characters.length; i++) {
    const knight = characters[i];
    if (!knight.knight || knight.characterPower <= 0 || knight.survival.phase !== 'alive') continue;
    const enemy = nearestEnemy(knight, characters, tileOf);
    if (!enemy || !inCombatRange(tileOf(knight), tileOf(enemy), enemy.home || knight.home ? 2 : 1))
      continue;
    const j = characters.indexOf(enemy);
    const pair = `${Math.min(i, j)}:${Math.max(i, j)}`;
    if (pairs.has(pair)) continue;
    pairs.add(pair);
    // A normal starting character deals 2 HP/s; a newly converted knight deals 3 HP/s.
    damage.set(enemy, (damage.get(enemy) ?? 0) + combatStrength(knight) * seconds);
    damage.set(knight, (damage.get(knight) ?? 0) + combatStrength(enemy) * seconds);
  }
  const defeated: C[] = [];
  for (const [character, amount] of damage) {
    character.characterPower = Math.max(0, character.characterPower - amount);
    if (character.characterPower === 0) defeated.push(character);
  }
  return defeated;
}
