import type { GridPoint, TerrainSurface } from './terrain-surface';
import type { PopulationColor } from './population';

export interface MinimapMarker extends GridPoint {
  population: PopulationColor;
  kind: 'house' | 'castle' | 'character';
  priority?: number;
}
export interface MinimapGlyph extends MinimapMarker {
  px: number;
  py: number;
  size: number;
}

/** Cache coarse maximum elevations so small islands remain visible; only edited cells are rescanned. */
export class MinimapTerrain {
  readonly pixels: Uint8ClampedArray;
  private fullDirty = true;
  private readonly dirty = new Set<number>();
  constructor(
    readonly size: number,
    readonly width: number,
    readonly height: number,
    private readonly palette: readonly string[],
  ) {
    this.pixels = new Uint8ClampedArray(width * height * 4);
  }
  get needsUpdate(): boolean {
    return this.fullDirty || this.dirty.size > 0;
  }
  invalidate(points?: readonly GridPoint[]): void {
    if (!points || points.length > (this.width * this.height) / 2) {
      this.fullDirty = true;
      this.dirty.clear();
      return;
    }
    if (this.fullDirty) return;
    for (const point of points) {
      const left = Math.max(0, Math.floor(((point.x - 1) * this.width) / this.size));
      const right = Math.min(this.width - 1, Math.ceil(((point.x + 1) * this.width) / this.size));
      const top = Math.max(0, Math.floor(((point.z - 1) * this.height) / this.size));
      const bottom = Math.min(
        this.height - 1,
        Math.ceil(((point.z + 1) * this.height) / this.size),
      );
      for (let y = top; y <= bottom; y++)
        for (let x = left; x <= right; x++) this.dirty.add(y * this.width + x);
    }
  }
  update(surface: Pick<TerrainSurface, 'level' | 'size'>): number {
    const cells = this.fullDirty
      ? Array.from({ length: this.width * this.height }, (_, i) => i)
      : [...this.dirty];
    for (const index of cells) {
      const px = index % this.width,
        py = Math.floor(index / this.width);
      let level = 0;
      for (
        let z = Math.floor((py * this.size) / this.height);
        z <= Math.min(this.size, Math.ceil(((py + 1) * this.size) / this.height));
        z++
      ) {
        for (
          let x = Math.floor((px * this.size) / this.width);
          x <= Math.min(this.size, Math.ceil(((px + 1) * this.size) / this.width));
          x++
        )
          level = Math.max(level, surface.level(x, z));
      }
      const color = parseInt(
        this.palette[Math.min(level, this.palette.length - 1)].replace('#', ''),
        16,
      );
      const offset = index * 4;
      this.pixels[offset] = color >> 16;
      this.pixels[offset + 1] = (color >> 8) & 255;
      this.pixels[offset + 2] = color & 255;
      this.pixels[offset + 3] = 255;
    }
    this.fullDirty = false;
    this.dirty.clear();
    return cells.length;
  }
}

/** Buildings always show; character glyphs need free space, with leaders/knights given first choice. */
export function layoutMinimapMarkers(
  size: number,
  width: number,
  height: number,
  markers: readonly MinimapMarker[],
): MinimapGlyph[] {
  const occupied = new Uint8Array(width * height),
    result: MinimapGlyph[] = [];
  function bounds(px: number, py: number, radius: number): number[] {
    const cells: number[] = [];
    for (let y = Math.max(0, py - radius); y <= Math.min(height - 1, py + radius); y++)
      for (let x = Math.max(0, px - radius); x <= Math.min(width - 1, px + radius); x++)
        cells.push(y * width + x);
    return cells;
  }
  const ordered = [...markers].sort(
    (a, b) =>
      Number(a.kind === 'character') - Number(b.kind === 'character') ||
      (a.kind === 'character'
        ? (b.priority ?? 0) - (a.priority ?? 0)
        : Number(a.kind === 'castle') - Number(b.kind === 'castle')),
  );
  for (const marker of ordered) {
    const px = Math.max(0, Math.min(width - 1, Math.round((marker.x / size) * (width - 1))));
    const py = Math.max(0, Math.min(height - 1, Math.round((marker.z / size) * (height - 1))));
    const glyphSize = marker.kind === 'castle' ? 5 : marker.kind === 'house' ? 3 : 2;
    const cells = bounds(px, py, Math.ceil(glyphSize / 2) + 1);
    if (marker.kind === 'character' && cells.some((index) => occupied[index])) continue;
    for (const index of cells) occupied[index] = 1;
    result.push({ ...marker, px, py, size: glyphSize });
  }
  return result;
}

export function minimapWorldPoint(u: number, v: number, size: number): GridPoint {
  return {
    x: Math.max(0, Math.min(1, u)) * (size - 1),
    z: Math.max(0, Math.min(1, v)) * (size - 1),
  };
}
