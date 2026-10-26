export interface GridPoint { x: number; z: number }
export interface TerrainBounds { x: number; z: number; width: number; depth: number }
export interface PowerBudget { spend(amount: number): boolean }
export interface TerraformResult { status: 'changed' | 'limit' | 'insufficient'; cost: number }

/** Integer heights belong to shared grid corners, not tile centers. */
export class TerrainSurface {
  /** Includes propagated edits, so scenery and inhabitants can update everywhere affected. */
  readonly changedPoints: GridPoint[] = [];

  constructor(readonly size: number, readonly levels: Uint8Array, readonly step: number) {
    if (levels.length !== (size + 1) ** 2) throw new Error('Expected one height per grid corner');
  }

  level(x: number, z: number): number {
    return this.levels[z * (this.size + 1) + x];
  }

  corner(x: number, z: number): number {
    return this.level(x, z) * this.step;
  }

  elevation(x: number, z: number): number {
    return (this.level(x, z) + this.level(x + 1, z) + this.level(x, z + 1) + this.level(x + 1, z + 1)) / 4;
  }

  nearestCorner(x: number, z: number): GridPoint {
    return { x: Math.max(0, Math.min(this.size, Math.round(x))), z: Math.max(0, Math.min(this.size, Math.round(z))) };
  }

  /** Preview the full cascade; only spend and commit when the entire edit is affordable. */
  terraform(x: number, z: number, delta: number, wholeTile: boolean, budget: PowerBudget): TerraformResult {
    this.changedPoints.length = 0;
    const preview = new TerrainSurface(this.size, this.levels.slice(), this.step);
    const changed = wholeTile ? preview.editTile(x, z, delta) : preview.editCorner(x, z, delta);
    if (!changed) return { status: 'limit', cost: 0 };
    const width = this.size + 1;
    const cost = preview.changedPoints.reduce((sum, point) => {
      const index = point.z * width + point.x;
      return sum + Math.abs(preview.levels[index] - this.levels[index]);
    }, 0);
    if (!budget.spend(cost)) return { status: 'insufficient', cost };
    this.levels.set(preview.levels);
    this.changedPoints.push(...preview.changedPoints);
    return { status: 'changed', cost };
  }

  editCorner(x: number, z: number, delta: number): boolean {
    return this.editPoints([{ x, z }], delta);
  }

  private editPoints(points: readonly GridPoint[], delta: number): boolean {
    this.changedPoints.length = 0;
    const change = Math.trunc(delta);
    if (!Number.isFinite(change) || !change || points.some(({ x, z }) =>
      !Number.isInteger(x) || !Number.isInteger(z) || x < 0 || z < 0 || x > this.size || z > this.size
      || this.level(x, z) + change < 0 || this.level(x, z) + change > 8)) return false;
    const changed = new Set<number>();
    // Apply the entire selection before propagating, so Shift edits move it exactly once.
    for (const { x, z } of points) {
      const index = z * (this.size + 1) + x;
      this.levels[index] += change;
      changed.add(index);
    }
    this.propagate([...changed], change > 0 ? 1 : -1, changed);
    return true;
  }

  /** Normalize generated terrain without lowering its peaks. */
  enforceSlopeLimit(): void {
    this.changedPoints.length = 0;
    this.propagate(Array.from(this.levels.keys()), 1, new Set<number>());
  }

  private propagate(queue: number[], direction: 1 | -1, changed: Set<number>): void {
    const width = this.size + 1;
    for (let head = 0; head < queue.length; head++) {
      const index = queue[head];
      const x = index % width; const z = Math.floor(index / width);
      // Include diagonal neighbors, so every surrounding point obeys the limit.
      for (const [dx, dz] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        const nx = x + dx; const nz = z + dz;
        if (nx < 0 || nz < 0 || nx > this.size || nz > this.size) continue;
        const neighbor = nz * width + nx;
        const required = this.levels[index] - direction;
        if ((this.levels[neighbor] - required) * direction >= 0) continue;
        this.levels[neighbor] = required;
        changed.add(neighbor);
        queue.push(neighbor);
      }
    }
    for (const index of changed) this.changedPoints.push({ x: index % width, z: Math.floor(index / width) });
  }

  tileCorners(x: number, z: number): GridPoint[] {
    return [{ x, z }, { x: x + 1, z }, { x: x + 1, z: z + 1 }, { x, z: z + 1 }];
  }

  /** Move all four corners together, or leave all unchanged at the height limits. */
  editTile(x: number, z: number, delta: number): boolean {
    this.changedPoints.length = 0;
    if (!Number.isInteger(x) || !Number.isInteger(z) || x < 0 || z < 0 || x >= this.size || z >= this.size) return false;
    return this.editPoints(this.tileCorners(x, z), delta);
  }

  affectedTiles(x: number, z: number): GridPoint[] {
    const result: GridPoint[] = [];
    for (const tz of [z - 1, z]) {
      for (const tx of [x - 1, x]) {
        if (tx >= 0 && tz >= 0 && tx < this.size && tz < this.size) result.push({ x: tx, z: tz });
      }
    }
    return result;
  }

  /** Exact height on the two triangles, divided along the NE–SW diagonal. */
  sample(x: number, z: number): number {
    if (x < 0 || z < 0 || x > this.size || z > this.size) return 0;
    const tx = Math.min(this.size - 1, Math.floor(x));
    const tz = Math.min(this.size - 1, Math.floor(z));
    const u = x - tx; const v = z - tz;
    const nw = this.corner(tx, tz); const ne = this.corner(tx + 1, tz);
    const sw = this.corner(tx, tz + 1); const se = this.corner(tx + 1, tz + 1);
    return u + v <= 1
      ? nw * (1 - u - v) + ne * u + sw * v
      : se * (u + v - 1) + sw * (1 - u) + ne * (1 - v);
  }

  /** Six vertices per tile, optionally limited to a streamed camera region. */
  positions(bounds: TerrainBounds = { x: 0, z: 0, width: this.size, depth: this.size }): Float32Array {
    const result = new Float32Array(bounds.width * bounds.depth * 18);
    const half = this.size / 2;
    const offsets = [[0, 0], [0, 1], [1, 0], [1, 0], [0, 1], [1, 1]];
    let index = 0;
    for (let z = bounds.z; z < bounds.z + bounds.depth; z++) {
      for (let x = bounds.x; x < bounds.x + bounds.width; x++) {
        for (const [dx, dz] of offsets) {
          result[index++] = x + dx - half;
          result[index++] = this.corner(x + dx, z + dz);
          result[index++] = z + dz - half;
        }
      }
    }
    return result;
  }
}
