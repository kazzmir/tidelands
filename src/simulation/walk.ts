import type { GridPoint } from '../terrain-surface';
export interface Walker<T extends GridPoint> {
  tile: T;
  target: T | null;
  progress: number;
  x: number;
  z: number;
}

/** Carry the fractional distance across tile boundaries, so coarse steps do not change speed. */
export function walkDistance<T extends GridPoint>(
  actor: Walker<T>,
  distance: number,
  choose: () => T | null,
  moved: (arrived: boolean) => boolean,
): void {
  if (
    !Number.isFinite(distance) ||
    distance < 0 ||
    !Number.isFinite(actor.progress) ||
    actor.progress < 0 ||
    actor.progress > 1
  )
    throw new Error('Invalid walking distance');
  let remaining = distance;
  while (remaining > 1e-12) {
    if (!actor.target) {
      actor.target = choose();
      actor.progress = 0;
      if (!actor.target) return;
    }
    const step = Math.min(1 - actor.progress, remaining);
    actor.progress += step;
    remaining -= step;
    actor.x = actor.tile.x + 0.5 + (actor.target.x - actor.tile.x) * actor.progress;
    actor.z = actor.tile.z + 0.5 + (actor.target.z - actor.tile.z) * actor.progress;
    const arrived = actor.progress >= 1 - 1e-12;
    if (arrived) {
      actor.tile = actor.target;
      actor.target = null;
      actor.progress = 0;
      actor.x = actor.tile.x + 0.5;
      actor.z = actor.tile.z + 0.5;
    }
    if (!moved(arrived)) return;
  }
}
