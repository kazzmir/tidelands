import type { Resident, SettlementTile } from './settlement';
import type { PopulationColor } from './population';
import type { Survival } from './survival';
import type { GridPoint } from './terrain-surface';

export interface BuildingContact<C, T> {
  attacker: C;
  defender: C;
  home: T;
}

/** Contact with the occupied tile/3x3 castle footprint, including a walker's approach margin. */
export function touchesBuilding(point: GridPoint, home: GridPoint, level: number): boolean {
  const halfSize = level === 5 ? 1.5 : 0.5;
  const dx = Math.max(0, Math.abs(point.x - home.x - 0.5) - halfSize);
  const dz = Math.max(0, Math.abs(point.z - home.z - 0.5) - halfSize);
  return dx * dx + dz * dz <= 0.55 ** 2;
}

/** Release near the contacted edge, so even a castle defender immediately reaches melee range. */
export function buildingDefenderPoint(home: GridPoint, attacker: GridPoint): GridPoint {
  const x = home.x + 0.5,
    z = home.z + 0.5;
  const dx = attacker.x - x,
    dz = attacker.z - z;
  const distance = Math.hypot(dx, dz);
  const fraction = distance > 0.75 ? (distance - 0.75) / distance : 0;
  return { x: x + dx * fraction, z: z + dz * fraction };
}

/** Pick unique enemy building contacts without creating, damaging, or replacing residents. */
export function enemyBuildingContacts<
  T extends SettlementTile,
  C extends Resident<T> & { population: PopulationColor; survival: Survival },
>(
  characters: readonly C[],
  pointOf: (character: C) => GridPoint,
  available: (character: C) => boolean,
): BuildingContact<C, T>[] {
  const alive = (character: C): boolean =>
    character.survival.phase === 'alive' && character.characterPower > 0;
  const walkers = characters.filter(
    (character) => !character.home && alive(character) && available(character),
  );
  const points = new Map(walkers.map((character) => [character, pointOf(character)]));
  const buckets = new Map<string, C[]>();
  for (const walker of walkers) {
    const point = points.get(walker)!;
    const key = `${Math.floor(point.x / 4)},${Math.floor(point.z / 4)}`;
    const bucket = buckets.get(key) ?? [];
    bucket.push(walker);
    buckets.set(key, bucket);
  }
  const contacts: (BuildingContact<C, T> & { distance: number })[] = [];
  for (const defender of characters) {
    const home = defender.home;
    if (!home || !alive(defender)) continue;
    const reach = defender.power === 5 ? 2.05 : 1.05;
    for (
      let z = Math.floor((home.z + 0.5 - reach) / 4);
      z <= Math.floor((home.z + 0.5 + reach) / 4);
      z++
    )
      for (
        let x = Math.floor((home.x + 0.5 - reach) / 4);
        x <= Math.floor((home.x + 0.5 + reach) / 4);
        x++
      )
        for (const attacker of buckets.get(`${x},${z}`) ?? []) {
          if (attacker.population === defender.population) continue;
          const point = points.get(attacker)!;
          if (!touchesBuilding(point, home, defender.power)) continue;
          contacts.push({
            attacker,
            defender,
            home,
            distance: (point.x - home.x - 0.5) ** 2 + (point.z - home.z - 0.5) ** 2,
          });
        }
  }
  contacts.sort((a, b) => a.distance - b.distance);
  const claimed = new Set<C>();
  return contacts.filter(({ attacker, defender }) => {
    if (claimed.has(attacker) || claimed.has(defender)) return false;
    claimed.add(attacker);
    claimed.add(defender);
    return true;
  });
}
