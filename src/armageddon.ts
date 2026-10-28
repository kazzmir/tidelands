import type { PopulationColor } from './population';
import type { CombatCharacter } from './knights';
import type { GridPoint, TerrainSurface } from './terrain-surface';

export class Armageddon<C extends CombatCharacter> {
  active = false;
  winner: PopulationColor | 'draw' | null = null;
  readonly leaders = new Map<PopulationColor, C>();
  get finished(): boolean {
    return this.winner !== null;
  }
  isLeader(character: C): boolean {
    return this.leaders.get(character.population) === character;
  }
  movementMultiplier(character: C): number {
    return this.active && !this.isLeader(character) ? 1.05 : 1;
  }

  start(
    characters: readonly C[],
    current: ReadonlyMap<PopulationColor, C | null>,
    spend: () => boolean,
  ): 'started' | 'active' | 'missing-population' | 'insufficient' {
    if (this.active) return 'active';
    const available = (character: C): boolean =>
      character.characterPower > 0 &&
      (character.survival.phase === 'alive' || character.survival.phase === 'drowning');
    const chosen = new Map<PopulationColor, C>();
    for (const color of ['red', 'blue'] as const) {
      const owner = current.get(color);
      const candidate =
        owner && characters.includes(owner) && owner.population === color && available(owner)
          ? owner
          : characters
              .filter((character) => character.population === color && available(character))
              .sort((a, b) => b.characterPower - a.characterPower)[0];
      if (!candidate) return 'missing-population';
      chosen.set(color, candidate);
    }
    if (!spend()) return 'insufficient';
    for (const [color, leader] of chosen) this.leaders.set(color, leader);
    this.active = true;
    return 'started';
  }

  resolve(): PopulationColor | 'draw' | null {
    if (!this.active || this.finished) return this.winner;
    const alive = (color: PopulationColor): boolean => {
      const leader = this.leaders.get(color);
      return (
        !!leader &&
        leader.characterPower > 0 &&
        leader.survival.phase !== 'dead' &&
        leader.survival.phase !== 'sinking'
      );
    };
    const red = alive('red'),
      blue = alive('blue');
    if (!red || !blue) this.winner = red ? 'red' : blue ? 'blue' : 'draw';
    return this.winner;
  }

  reset(): void {
    this.active = false;
    this.winner = null;
    this.leaders.clear();
  }
}

/** Only 0->1 corner edits: preserve existing heights and the diagonal slope invariant. */
export function armageddonLand(
  surface: TerrainSurface,
  leaders: readonly GridPoint[],
  radius = 2,
): boolean {
  const changed = new Map<number, GridPoint>();
  for (const leader of leaders) {
    const cx = Math.floor(leader.x),
      cz = Math.floor(leader.z);
    for (let z = Math.max(0, cz - radius); z <= Math.min(surface.size - 1, cz + radius); z++)
      for (let x = Math.max(0, cx - radius); x <= Math.min(surface.size - 1, cx + radius); x++)
        for (const corner of surface.tileCorners(x, z)) {
          if (surface.level(corner.x, corner.z) !== 0) continue;
          surface.editCorner(corner.x, corner.z, 1);
          for (const point of surface.changedPoints)
            changed.set(point.z * (surface.size + 1) + point.x, point);
        }
  }
  surface.changedPoints.length = 0;
  surface.changedPoints.push(...changed.values());
  return changed.size > 0;
}
