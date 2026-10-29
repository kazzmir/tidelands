import type { GridPoint, TerrainSurface } from './terrain-surface';
import type { Resident, SettlementTile } from './settlement';

export interface BridgeRequest {
  from: GridPoint;
  toward: GridPoint;
}
/** Select one sea-level corner of an adjacent water tile, progressing toward a hostile goal.
 * Callers supply only stalled hostile pursuits. Never fill distant water or edit obstacles on land.
 */
export function shoreBridgeCorner<T extends SettlementTile>(
  surface: TerrainSurface,
  requests: readonly BridgeRequest[],
  residents: readonly Resident<T>[],
  lookup: (x: number, z: number) => T | undefined,
  canEdit: (point: GridPoint) => boolean,
): GridPoint | null {
  for (const { from, toward } of requests) {
    if (
      !Number.isInteger(from.x) ||
      !Number.isInteger(from.z) ||
      from.x < 0 ||
      from.z < 0 ||
      from.x >= surface.size ||
      from.z >= surface.size ||
      surface.sample(from.x + 0.5, from.z + 0.5) <= 0.08
    )
      continue;
    const distance = (p: GridPoint) => (p.x - toward.x) ** 2 + (p.z - toward.z) ** 2;
    const candidates = [
      { x: from.x + 1, z: from.z },
      { x: from.x - 1, z: from.z },
      { x: from.x, z: from.z + 1 },
      { x: from.x, z: from.z - 1 },
    ]
      .filter((p) => distance(p) < distance(from) - 1e-9)
      .sort((a, b) => distance(a) - distance(b));
    for (const next of candidates) {
      const tile = lookup(next.x, next.z);
      if (!tile || tile.house || tile.reserved || tile.castleGap || tile.tree || tile.swamp)
        continue;
      const edgeX = (from.x + next.x) / 2 + 0.5,
        edgeZ = (from.z + next.z) / 2 + 0.5;
      if (surface.sample(next.x + 0.5, next.z + 0.5) > 0.08 && surface.sample(edgeX, edgeZ) > 0.08)
        continue;
      const corners = surface
        .tileCorners(next.x, next.z)
        .filter((p) => surface.level(p.x, p.z) === 0)
        .sort(
          (a, b) =>
            Math.hypot(a.x - from.x - 0.5, a.z - from.z - 0.5) -
            Math.hypot(b.x - from.x - 0.5, b.z - from.z - 0.5),
        );
      for (const corner of corners) {
        if (!canEdit(corner)) continue;
        const safe = residents.every(
          (r) =>
            !r.home ||
            !surface
              .tileCorners(r.home.x, r.home.z)
              .some((p) => p.x === corner.x && p.z === corner.z),
        );
        if (safe) return corner;
      }
    }
  }
  return null;
}
