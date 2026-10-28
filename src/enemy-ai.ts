import type { GridPoint, PowerBudget, TerrainSurface, TerraformResult } from './terrain-surface';
import type { Resident, SettlementTile } from './settlement';

export interface TerracePlan {
  center: GridPoint;
  height: number;
}

/** A patient god: at most one paid, one-level corner edit per four simulation seconds. */
export class EnemyTerraformer {
  private elapsed = 0;
  plan: TerracePlan | null = null;
  readonly sites: TerracePlan[] = [];
  edits = 0;
  spent = 0;
  constructor(
    readonly anchor: GridPoint,
    readonly interval = 4,
  ) {
    if (!Number.isFinite(interval) || interval <= 0)
      throw new Error('Enemy edit interval must be positive');
  }

  reset(): void {
    this.elapsed = 0;
    this.plan = null;
    this.sites.length = 0;
    this.edits = 0;
    this.spent = 0;
  }

  private corners(center: GridPoint): GridPoint[] {
    const points: GridPoint[] = [];
    for (let z = center.z - 1; z <= center.z + 2; z++)
      for (let x = center.x - 1; x <= center.x + 2; x++) points.push({ x, z });
    return points;
  }

  private complete(surface: TerrainSurface, plan: TerracePlan): boolean {
    return this.corners(plan.center).every((p) => surface.level(p.x, p.z) === plan.height);
  }

  /** The slope cone of any planned edit must leave friendly home corners unchanged. */
  private preservesHomes<T extends SettlementTile>(
    surface: TerrainSurface,
    plan: TerracePlan,
    residents: readonly Resident<T>[],
  ): boolean {
    return residents.every(
      (resident) =>
        !resident.home ||
        this.corners(plan.center).every((point) =>
          surface
            .tileCorners(resident.home!.x, resident.home!.z)
            .every(
              (home) =>
                Math.abs(plan.height - surface.level(home.x, home.z)) <=
                Math.max(Math.abs(point.x - home.x), Math.abs(point.z - home.z)),
            ),
        ),
    );
  }

  private usableFootprint<T extends SettlementTile>(
    center: GridPoint,
    lookup: (x: number, z: number) => T | undefined,
  ): boolean {
    for (let z = center.z - 1; z <= center.z + 1; z++)
      for (let x = center.x - 1; x <= center.x + 1; x++) {
        const tile = lookup(x, z);
        if (!tile || tile.swamp || tile.reserved || tile.castleGap) return false;
      }
    return true;
  }

  nextBuildSite<T extends SettlementTile>(
    surface: TerrainSurface,
    lookup: (x: number, z: number) => T | undefined,
  ): T | null {
    for (const site of this.sites) {
      const tile = lookup(site.center.x, site.center.z);
      if (
        tile &&
        !tile.house &&
        !tile.reserved &&
        !tile.castleGap &&
        !tile.tree &&
        !tile.swamp &&
        this.complete(surface, site) &&
        this.usableFootprint(site.center, lookup)
      )
        return tile;
    }
    return null;
  }

  blocksSettlement(tile: GridPoint): boolean {
    return (
      !!this.plan &&
      Math.abs(tile.x - this.plan.center.x) <= 1 &&
      Math.abs(tile.z - this.plan.center.z) <= 1
    );
  }

  private choosePlan<T extends SettlementTile>(
    surface: TerrainSurface,
    residents: readonly Resident<T>[],
    lookup: (x: number, z: number) => T | undefined,
    canEdit: (point: GridPoint) => boolean,
  ): TerracePlan | null {
    let best: TerracePlan | null = null,
      bestScore = Infinity;
    const candidates: { center: GridPoint; height?: number; home: boolean }[] = [];
    for (const resident of residents)
      if (
        resident.home &&
        resident.power < 5 &&
        surface.level(resident.home.x, resident.home.z) >= 4
      )
        candidates.push({
          center: resident.home,
          height: surface.level(resident.home.x, resident.home.z),
          home: true,
        });
    for (let z = this.anchor.z - 24; z <= this.anchor.z + 24; z += 3)
      for (let x = this.anchor.x - 24; x <= this.anchor.x + 24; x += 3)
        candidates.push({ center: { x, z }, home: false });
    for (const candidate of candidates) {
      const center = candidate.center;
      if (
        center.x < 2 ||
        center.z < 2 ||
        center.x + 3 >= surface.size ||
        center.z + 3 >= surface.size
      )
        continue;
      const tile = lookup(center.x, center.z);
      if (
        !tile ||
        tile.swamp ||
        tile.reserved ||
        tile.castleGap ||
        tile.tree ||
        (!candidate.home && tile.house)
      )
        continue;
      if (!this.usableFootprint(center, lookup)) continue;
      if (
        this.sites.some(
          (site) =>
            Math.max(Math.abs(site.center.x - center.x), Math.abs(site.center.z - center.z)) < 6,
        )
      )
        continue;
      const corners = this.corners(center);
      const average = corners.reduce((sum, p) => sum + surface.level(p.x, p.z), 0) / corners.length;
      if (!candidate.home && average < 2.5) continue;
      const plan = {
        center: { x: center.x, z: center.z },
        height: candidate.height ?? Math.max(4, Math.min(7, Math.round(average))),
      };
      if (
        corners.some((point) => surface.level(point.x, point.z) !== plan.height && !canEdit(point))
      )
        continue;
      if (!this.preservesHomes(surface, plan, residents)) continue;
      const work = corners.reduce(
        (sum, p) => sum + Math.abs(surface.level(p.x, p.z) - plan.height),
        0,
      );
      if (!work) continue;
      const distance = Math.min(
        ...residents.map((resident) =>
          Math.hypot(resident.tile.x - center.x, resident.tile.z - center.z),
        ),
      );
      const score =
        work + (7 - Math.min(7, plan.height)) * 7 + distance * 0.6 - (candidate.home ? 24 : 0);
      if (score < bestScore) {
        best = plan;
        bestScore = score;
      }
    }
    return best;
  }

  advance<T extends SettlementTile>(
    seconds: number,
    surface: TerrainSurface,
    budget: PowerBudget,
    residents: readonly Resident<T>[],
    lookup: (x: number, z: number) => T | undefined,
    canEdit: (point: GridPoint) => boolean = (point) =>
      residents.some((resident) => {
        const location = resident.home ?? resident.tile;
        return (
          resident.characterPower > 0 &&
          (location.x + 0.5 - point.x) ** 2 + (location.z + 0.5 - point.z) ** 2 <= 100 + 1e-9
        );
      }),
  ): TerraformResult | null {
    if (!Number.isFinite(seconds) || seconds <= 0) return null;
    const living = residents.filter((resident) => resident.characterPower > 0);
    if (!living.length) {
      this.elapsed = 0;
      return null;
    }
    this.elapsed += seconds;
    if (this.elapsed + 1e-9 < this.interval) return null;
    this.elapsed = 0; // Never bank a burst of edits after a stall or a long update.
    for (let i = this.sites.length - 1; i >= 0; i--) {
      const site = this.sites[i];
      const height = surface.level(site.center.x, site.center.z);
      if (
        height > 0 &&
        this.corners(site.center).every((point) => surface.level(point.x, point.z) === height)
      )
        site.height = height;
      else this.sites.splice(i, 1);
    }
    if (
      this.plan &&
      (!this.preservesHomes(surface, this.plan, living) ||
        this.corners(this.plan.center).some(
          (point) => surface.level(point.x, point.z) !== this.plan!.height && !canEdit(point),
        ))
    )
      this.plan = null;
    this.plan ??= this.choosePlan(surface, living, lookup, canEdit);
    if (!this.plan) return null;
    const plan = this.plan;
    const point = this.corners(plan.center).find((p) => surface.level(p.x, p.z) !== plan.height);
    if (!point) {
      this.sites.push(plan);
      this.plan = null;
      return null;
    }
    const delta = Math.sign(plan.height - surface.level(point.x, point.z));
    const result = surface.terraform(point.x, point.z, delta, false, budget);
    if (result.status === 'changed') {
      this.edits++;
      this.spent += result.cost;
      if (this.complete(surface, plan)) {
        this.sites.push(plan);
        this.plan = null;
      }
    }
    return result;
  }
}
