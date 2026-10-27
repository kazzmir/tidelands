import { buildPursuitField, rallySteps } from './leadership';
import type { GridPoint } from './terrain-surface';

export class LeaderAnchor<T extends GridPoint> {
  target: T | null = null;
  placing = false;
  private owner: object | null = null;
  private revision = -1;
  private field = new Map<T, number>();

  get active(): boolean {
    return this.placing || this.target !== null;
  }

  toggle(): void {
    if (this.active) this.reset();
    else this.placing = true;
  }

  place(target: T): boolean {
    if (!this.placing) return false;
    this.reset();
    this.target = target;
    return true;
  }

  cancelPlacement(): void {
    this.placing = false;
  }

  reset(): void {
    this.target = null;
    this.placing = false;
    this.owner = null;
    this.revision = -1;
    this.field.clear();
  }

  steps(
    owner: object,
    start: T,
    neighbors: (tile: T) => readonly T[],
    walkable: (tile: T) => boolean,
    revision: number,
  ): T[] {
    if (!this.target) return [];
    if (owner !== this.owner || revision !== this.revision || !this.field.has(start)) {
      this.field = buildPursuitField(
        start,
        walkable(this.target) ? [this.target] : [],
        this.target,
        neighbors,
      );
      this.owner = owner;
      this.revision = revision;
    }
    return rallySteps(start, neighbors(start), this.field);
  }
}
