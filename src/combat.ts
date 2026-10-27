import type { CombatCharacter } from './knights';
import type { GridPoint } from './terrain-surface';

export interface CombatPair<C> {
  a: C;
  b: C;
  powerA: number;
  powerB: number;
  healthA: number;
  healthB: number;
}

/** Stable one-on-one engagements: both participants attack simultaneously. */
export class CombatSystem<C extends CombatCharacter> {
  pairs: CombatPair<C>[] = [];
  readonly opponents = new Map<C, C>();

  reset(): void {
    this.pairs = [];
    this.opponents.clear();
  }

  opponent(character: C): C | null {
    const enemy = this.opponents.get(character);
    return enemy && this.alive(character) && this.alive(enemy) ? enemy : null;
  }

  private alive(character: C): boolean {
    return character.survival.phase === 'alive' && character.characterPower > 0;
  }

  match(characters: readonly C[], pointOf: (character: C) => GridPoint): void {
    const previous = this.pairs;
    this.reset();
    const available = new Set(characters);
    const points = new Map(characters.map((character) => [character, pointOf(character)]));
    const distance = (a: C, b: C): number => {
      const p = points.get(a)!,
        q = points.get(b)!;
      return (p.x - q.x) ** 2 + (p.z - q.z) ** 2;
    };
    const eligible = (a: C, b: C, ongoing: boolean): boolean => {
      if (!this.alive(a) || !this.alive(b) || a.population === b.population) return false;
      if (a.home && b.home) return false;
      // Preserve knights' ability to engage a defending resident at a building.
      if ((a.home || b.home) && !a.knight && !b.knight) return false;
      const range = a.home || b.home ? 2.25 : ongoing ? 1.6 : 1.35;
      return distance(a, b) <= range ** 2;
    };
    const add = (pair: CombatPair<C>): void => {
      this.pairs.push(pair);
      this.opponents.set(pair.a, pair.b);
      this.opponents.set(pair.b, pair.a);
    };
    for (const pair of previous) {
      if (available.has(pair.a) && available.has(pair.b) && eligible(pair.a, pair.b, true))
        add(pair);
    }
    const candidates: { a: C; b: C; distance: number }[] = [];
    // Spatial buckets keep distant islands/populations out of melee searches.
    const free = characters.filter(
      (character) => !this.opponents.has(character) && this.alive(character),
    );
    const order = new Map(free.map((character, index) => [character, index]));
    const buckets = new Map<string, C[]>();
    for (const character of free) {
      const point = points.get(character)!;
      const key = `${Math.floor(point.x / 3)},${Math.floor(point.z / 3)}`;
      const bucket = buckets.get(key) ?? [];
      bucket.push(character);
      buckets.set(key, bucket);
    }
    for (const a of free) {
      const point = points.get(a)!;
      const x = Math.floor(point.x / 3),
        z = Math.floor(point.z / 3);
      for (let dz = -1; dz <= 1; dz++)
        for (let dx = -1; dx <= 1; dx++) {
          for (const b of buckets.get(`${x + dx},${z + dz}`) ?? []) {
            if (order.get(b)! <= order.get(a)!) continue;
            if (eligible(a, b, false)) candidates.push({ a, b, distance: distance(a, b) });
          }
        }
    }
    candidates.sort((a, b) => a.distance - b.distance);
    for (const { a, b } of candidates) {
      if (this.opponents.has(a) || this.opponents.has(b)) continue;
      add({
        a,
        b,
        powerA: a.characterPower,
        powerB: b.characterPower,
        healthA: a.characterPower,
        healthB: b.characterPower,
      });
    }
  }

  advance(seconds: number): C[] {
    if (!Number.isFinite(seconds) || seconds <= 0) return [];
    const defeated: C[] = [];
    for (const pair of this.pairs) {
      const { a, b } = pair;
      if (!this.alive(a) || !this.alive(b)) continue;
      // Entry power fixes attack strength for this engagement, so wounds do not
      // make equal fights asymptotically endless. Newly gathered power still counts.
      pair.powerA += Math.max(0, a.characterPower - pair.healthA);
      pair.powerB += Math.max(0, b.characterPower - pair.healthB);
      const rateA = pair.powerA / 10,
        rateB = pair.powerB / 10;
      const duration = Math.min(seconds, a.characterPower / rateB, b.characterPower / rateA);
      a.characterPower = Math.max(0, a.characterPower - rateB * duration);
      b.characterPower = Math.max(0, b.characterPower - rateA * duration);
      if (a.characterPower < 1e-9) {
        a.characterPower = 0;
        defeated.push(a);
      }
      if (b.characterPower < 1e-9) {
        b.characterPower = 0;
        defeated.push(b);
      }
      pair.healthA = a.characterPower;
      pair.healthB = b.characterPower;
    }
    return defeated;
  }
}
