export interface LeaderCharacter<T> {
  tile: T;
  characterPower: number;
}
export type LeaderEncounter = 'none' | 'picked-up' | 'absorbed';

/** One population owns exactly one leader object, either carried or dropped on a tile. */
export class Leadership<T, C extends LeaderCharacter<T>> {
  leader: C | null = null;
  droppedTile: T | null = null;
  rallying = false;

  appoint(character: C): boolean {
    if (this.leader || this.droppedTile !== null || character.characterPower <= 0) return false;
    this.leader = character;
    return true;
  }

  drop(character: C, tile: T): boolean {
    if (this.leader !== character) return false;
    this.leader = null;
    this.droppedTile = tile;
    return true;
  }

  encounter(
    character: C,
    tile: T,
    leaderTile: T | null = this.leader?.tile ?? null,
  ): LeaderEncounter {
    if (character.characterPower <= 0) return 'none';
    if (!this.leader && this.droppedTile !== null && this.droppedTile === tile) {
      this.leader = character;
      this.droppedTile = null;
      return 'picked-up';
    }
    if (
      this.rallying &&
      this.leader &&
      this.leader.characterPower > 0 &&
      character !== this.leader &&
      tile === leaderTile
    ) {
      this.leader.characterPower += character.characterPower;
      character.characterPower = 0;
      return 'absorbed';
    }
    return 'none';
  }

  reset(): void {
    this.leader = null;
    this.droppedTile = null;
    this.rallying = false;
  }
}

/** A shared reverse breadth-first field lets all followers route around the same obstacles. */
export function buildRallyField<T>(
  starts: readonly T[],
  neighbors: (tile: T) => readonly T[],
  limit = 100_000,
): Map<T, number> {
  const distance = new Map<T, number>();
  const queue: T[] = [];
  for (const tile of starts)
    if (!distance.has(tile)) {
      distance.set(tile, 0);
      queue.push(tile);
    }
  for (let head = 0; head < queue.length && distance.size < limit; head++) {
    const tile = queue[head];
    const nextDistance = (distance.get(tile) ?? 0) + 1;
    for (const next of neighbors(tile)) {
      if (distance.has(next) || distance.size >= limit) continue;
      distance.set(next, nextDistance);
      queue.push(next);
    }
  }
  return distance;
}

export function rallySteps<T>(
  tile: T,
  options: readonly T[],
  distance: ReadonlyMap<T, number>,
): T[] {
  const current = distance.get(tile) ?? Infinity;
  const reachable = options.filter((next) => (distance.get(next) ?? Infinity) < current);
  const best = Math.min(...reachable.map((next) => distance.get(next) ?? Infinity));
  return reachable.filter((next) => distance.get(next) === best);
}
