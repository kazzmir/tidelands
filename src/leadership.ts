export interface LeaderCharacter<T> {
  tile: T;
  characterPower: number;
  knight?: boolean;
}
export type LeaderEncounter = 'none' | 'picked-up' | 'absorbed';
export type PoleRelocation = 'moved' | 'missing' | 'unchanged' | 'insufficient';

/** One population owns exactly one leader object, either carried or dropped on a tile. */
export class Leadership<T, C extends LeaderCharacter<T>> {
  leader: C | null = null;
  droppedTile: T | null = null;
  rallying = false;
  private formerHolder: C | null = null;

  /** Move only the artifact: its former owner's position, home, and power are untouched. */
  relocate(tile: T, spend: () => boolean): PoleRelocation {
    if (!this.leader && this.droppedTile === null) return 'missing';
    if (!this.leader && this.droppedTile === tile) return 'unchanged';
    if (!spend()) return 'insufficient';
    this.formerHolder = this.leader;
    this.leader = null;
    this.droppedTile = tile;
    return 'moved';
  }

  canRecover(character: C, tile: T): boolean {
    return (
      this.leader === null &&
      this.droppedTile !== null &&
      character.characterPower > 0 &&
      !(this.formerHolder === character && tile === this.droppedTile)
    );
  }

  appoint(character: C): boolean {
    if (this.leader || this.droppedTile !== null || character.characterPower <= 0) return false;
    this.leader = character;
    this.formerHolder = null;
    return true;
  }

  /** The caller must bring both characters together before a physical handoff. */
  transfer(current: C, successor: C): boolean {
    if (
      this.leader !== current ||
      current === successor ||
      current.characterPower <= 0 ||
      successor.characterPower <= 0
    )
      return false;
    this.leader = successor;
    this.droppedTile = null;
    this.formerHolder = null;
    return true;
  }

  drop(character: C, tile: T): boolean {
    if (this.leader !== character) return false;
    this.leader = null;
    this.droppedTile = tile;
    this.formerHolder = null;
    return true;
  }

  /** Normal gathering preserves knights; includeKnights is reserved for the all-in finale. */
  encounter(
    character: C,
    tile: T,
    leaderTile: T | null = this.leader?.tile ?? null,
    gathering = this.rallying,
    includeKnights = false,
  ): LeaderEncounter {
    if (character.characterPower <= 0) return 'none';
    if (this.formerHolder === character) {
      // A same-tile cast still releases the pole; the former holder must leave before reclaiming it.
      if (tile === this.droppedTile) return 'none';
      this.formerHolder = null;
    }
    if (!this.leader && this.droppedTile !== null && this.droppedTile === tile) {
      this.leader = character;
      this.droppedTile = null;
      this.formerHolder = null;
      return 'picked-up';
    }
    if (
      gathering &&
      (!character.knight || includeKnights) &&
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
    this.formerHolder = null;
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

/** Pursue across land, or advance to the nearest reachable shore until a causeway exists. */
export function buildPursuitField<T extends { x: number; z: number }>(
  start: T,
  goals: readonly T[],
  target: { x: number; z: number },
  neighbors: (tile: T) => readonly T[],
): Map<T, number> {
  const direct = buildRallyField(goals, neighbors);
  if (direct.has(start)) return direct;
  const reachable = buildRallyField([start], neighbors);
  let closest = start,
    best = Infinity;
  for (const tile of reachable.keys()) {
    const distance = (tile.x - target.x) ** 2 + (tile.z - target.z) ** 2;
    if (distance < best) {
      closest = tile;
      best = distance;
    }
  }
  return buildRallyField([closest], neighbors);
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
