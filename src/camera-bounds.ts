import type { GridPoint } from './terrain-surface';

/** Clamp the orbit/pan center to the terrain edges, translating the camera by the same amount. */
export function clampCameraCenter(position: GridPoint, target: GridPoint, size: number): boolean {
  if (
    !Number.isFinite(size) ||
    size <= 0 ||
    ![position.x, position.z, target.x, target.z].every(Number.isFinite)
  )
    throw new Error('Invalid camera bounds');
  const half = size / 2;
  const x = Math.max(-half, Math.min(half, target.x)),
    z = Math.max(-half, Math.min(half, target.z));
  const dx = x - target.x,
    dz = z - target.z;
  if (dx === 0 && dz === 0) return false;
  target.x = x;
  target.z = z;
  position.x += dx;
  position.z += dz;
  return true;
}
