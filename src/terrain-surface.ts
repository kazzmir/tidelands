export interface HeightTile { height: number }

/** Four triangles per tile join its center to corners shared by all neighbors. */
export class TerrainSurface {
  readonly corners: Float32Array;

  constructor(readonly size: number, readonly tiles: readonly HeightTile[], readonly step: number) {
    this.corners = new Float32Array((size + 1) ** 2);
    for (let z = 0; z <= size; z++) {
      for (let x = 0; x <= size; x++) {
        let sum = 0;
        for (const dz of [-1, 0]) {
          // Use sea-level shoreline corners, while submerged tile centers stay below water.
          for (const dx of [-1, 0]) sum += Math.max(0, this.center(x + dx, z + dz));
        }
        this.corners[z * (size + 1) + x] = sum / 4;
      }
    }
  }

  center(x: number, z: number): number {
    if (x < 0 || z < 0 || x >= this.size || z >= this.size) return -0.35;
    const height = this.tiles[z * this.size + x].height;
    return height === 0 ? -0.35 : height * this.step;
  }

  corner(x: number, z: number): number {
    return this.corners[z * (this.size + 1) + x];
  }

  /** Grid-space height, using the same triangles as the rendered geometry. */
  sample(x: number, z: number): number {
    if (x < 0 || z < 0 || x >= this.size || z >= this.size) return -0.35;
    const tx = Math.floor(x); const tz = Math.floor(z);
    const dx = x - tx - 0.5; const dz = z - tz - 0.5;
    const center = this.center(tx, tz);
    const nw = this.corner(tx, tz); const ne = this.corner(tx + 1, tz);
    const sw = this.corner(tx, tz + 1); const se = this.corner(tx + 1, tz + 1);
    if (Math.abs(dz) >= Math.abs(dx)) {
      return dz <= 0
        ? center * (1 + 2 * dz) + nw * (-dz - dx) + ne * (-dz + dx)
        : center * (1 - 2 * dz) + sw * (dz - dx) + se * (dz + dx);
    }
    return dx <= 0
      ? center * (1 + 2 * dx) + nw * (-dx - dz) + sw * (-dx + dz)
      : center * (1 - 2 * dx) + ne * (dx - dz) + se * (dx + dz);
  }

  /** Counterclockwise vertices: north, east, south, west. Face index / 4 identifies a tile. */
  positions(): Float32Array {
    const result: number[] = [];
    const half = this.size / 2;
    for (let z = 0; z < this.size; z++) {
      for (let x = 0; x < this.size; x++) {
        const corners = [
          [x, this.corner(x, z), z],
          [x + 1, this.corner(x + 1, z), z],
          [x + 1, this.corner(x + 1, z + 1), z + 1],
          [x, this.corner(x, z + 1), z + 1],
        ];
        for (let i = 0; i < 4; i++) {
          result.push(x + 0.5 - half, this.center(x, z), z + 0.5 - half);
          for (const index of [(i + 1) % 4, i]) {
            const vertex = corners[index];
            result.push(vertex[0] - half, vertex[1], vertex[2] - half);
          }
        }
      }
    }
    return new Float32Array(result);
  }
}
