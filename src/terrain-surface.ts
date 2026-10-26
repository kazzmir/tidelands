export interface GridPoint { x: number; z: number }

/** Integer heights belong to shared grid corners, not tile centers. */
export class TerrainSurface {
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

  editCorner(x: number, z: number, delta: number): boolean {
    if (!Number.isInteger(x) || !Number.isInteger(z) || x < 0 || z < 0 || x > this.size || z > this.size) return false;
    const index = z * (this.size + 1) + x;
    const next = Math.max(0, Math.min(8, this.levels[index] + Math.trunc(delta)));
    if (next === this.levels[index]) return false;
    this.levels[index] = next;
    return true;
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

  /** Six vertices per tile; face index / 2 identifies the tile. No center vertex. */
  positions(): Float32Array {
    const result: number[] = [];
    const half = this.size / 2;
    for (let z = 0; z < this.size; z++) {
      for (let x = 0; x < this.size; x++) {
        for (const [dx, dz] of [[0, 0], [0, 1], [1, 0], [1, 0], [0, 1], [1, 1]]) {
          result.push(x + dx - half, this.corner(x + dx, z + dz), z + dz - half);
        }
      }
    }
    return new Float32Array(result);
  }
}
