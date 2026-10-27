import { TerrainSurface, type GridPoint } from './terrain-surface';

export interface EncounterScenario {
  levels: Uint8Array;
  playerStart: GridPoint;
  enemyStart: GridPoint;
}

/** A clear shared island with neighboring camps, for movement and combat testing. */
export function createEncounterScenario(size: number): EncounterScenario {
  const center = Math.floor(size / 2);
  const radius = Math.min(18, Math.floor(size / 4));
  const levels = new Uint8Array((size + 1) ** 2);
  const seeds: GridPoint[] = [];
  for (let z = center - radius; z <= center + radius; z++) {
    for (let x = center - radius; x <= center + radius; x++) {
      if (Math.hypot(x - center, z - center) > radius) continue;
      levels[z * (size + 1) + x] = 4;
      seeds.push({ x, z });
    }
  }
  new TerrainSurface(size, levels, 1).enforceSlopeLimit(seeds);
  return {
    levels,
    playerStart: { x: center - 3, z: center },
    enemyStart: { x: center + 3, z: center },
  };
}

/** Reserve destinations and let walkers go around one another instead of swapping/overlapping. */
export function unoccupiedWalkSteps<T, C extends { tile: T; target: T | null }>(
  actor: C,
  options: readonly T[],
  others: readonly C[],
): T[] {
  return options.filter(
    (tile) =>
      !others.some((other) => other !== actor && (other.tile === tile || other.target === tile)),
  );
}
