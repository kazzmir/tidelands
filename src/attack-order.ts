import { buildPursuitField } from './leadership';
import type { PopulationColor } from './population';
import type { Survival } from './survival';
import type { GridPoint } from './terrain-surface';

export class AttackOrder {
  active = false;
  toggle(): void {
    this.active = !this.active;
  }
  reset(): void {
    this.active = false;
  }
  commands(
    character: { population: PopulationColor; characterPower: number; survival: Survival },
    human: PopulationColor,
  ): boolean {
    return (
      this.active &&
      character.population === human &&
      character.characterPower > 0 &&
      character.survival.phase === 'alive'
    );
  }
}

/** Share flow fields between an army pursuing the same goal on the same landmass. */
export class SharedPursuit<T extends GridPoint> {
  private revision = -1;
  private cache = new Map<T, Map<T, number>[]>();
  constructor(private readonly limit = 64) {}

  reset(): void {
    this.cache.clear();
    this.revision = -1;
  }

  field(
    start: T,
    goal: T,
    goals: readonly T[],
    neighbors: (tile: T) => readonly T[],
    revision: number,
  ): Map<T, number> {
    if (revision !== this.revision) {
      this.reset();
      this.revision = revision;
    }
    let fields = this.cache.get(goal);
    const existing = fields?.find((field) => field.has(start));
    if (existing) return existing;
    if (!fields) {
      if (this.cache.size >= this.limit) {
        const oldest = this.cache.keys().next();
        if (!oldest.done) this.cache.delete(oldest.value);
      }
      fields = [];
      this.cache.set(goal, fields);
    }
    const field = buildPursuitField(start, goals, goal, neighbors);
    fields.push(field);
    return field;
  }
}
