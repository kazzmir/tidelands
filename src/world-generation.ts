import { TerrainSurface, type GridPoint } from './terrain-surface';

export interface TerrainPeak extends GridPoint {
  height: number;
}
export interface PeakCluster extends GridPoint {
  peaks: TerrainPeak[];
}
export interface WorldLayout {
  clusters: PeakCluster[];
  peaks: TerrainPeak[];
}

/** Leave only enough western margin for the full 35-tile cluster, slopes, and seed jitter. */
export function playerStartAnchor(size: number): GridPoint {
  return { x: Math.min(48, Math.floor(size / 2)), z: Math.floor(size / 2) };
}

/** Choose the opposite inset corner for maximum separation while retaining full island margins. */
export function enemyStartAnchor(size: number): GridPoint {
  const player = playerStartAnchor(size);
  const margin = Math.min(48, Math.floor(size / 2));
  const far = Math.min(size - 1, size - margin);
  return { x: player.x <= size / 2 ? far : margin, z: player.z <= size / 2 ? far : margin };
}

/** Cluster high points closely enough that their slope-constrained foothills naturally meet. */
export function generateWorldLayout(size: number, seed: number): WorldLayout {
  let state = seed >>> 0;
  const random = (): number => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
  const start = playerStartAnchor(size);
  const clusters: PeakCluster[] = [];
  const peaks: TerrainPeak[] = [];
  function addCluster(x: number, z: number): void {
    const cluster: PeakCluster = {
      x: x + Math.floor(random() * 9) - 4,
      z: z + Math.floor(random() * 9) - 4,
      peaks: [],
    };
    function addPeak(x: number, z: number): void {
      if (x < 0 || z < 0 || x > size || z > size) return;
      const point = { x, z, height: 6 + Math.floor(random() * 3) };
      cluster.peaks.push(point);
      peaks.push(point);
    }
    // An irregular core keeps each mass broad enough without sculpting any land itself.
    const angle = (Math.floor(random() * 4) * Math.PI) / 2;
    for (const [x, z] of [
      [-11, -11],
      [-2, -9],
      [8, -3],
      [10, 7],
      [0, 11],
      [-10, 6],
    ]) {
      addPeak(
        cluster.x + Math.round(x * Math.cos(angle) - z * Math.sin(angle)),
        cluster.z + Math.round(x * Math.sin(angle) + z * Math.cos(angle)),
      );
    }
    const targetCount = 10 + Math.floor(random() * 17);
    for (
      let attempt = 0;
      attempt < 300 && cluster.peaks.length && cluster.peaks.length < targetCount;
      attempt++
    ) {
      const parent = cluster.peaks[Math.floor(random() * cluster.peaks.length)];
      const direction = random() * Math.PI * 2;
      const distance = 8 + random() * 2;
      const x = parent.x + Math.round(Math.cos(direction) * distance);
      const z = parent.z + Math.round(Math.sin(direction) * distance);
      if (Math.abs(x - cluster.x) > 35 || Math.abs(z - cluster.z) > 35) continue;
      if (cluster.peaks.some((point) => Math.max(Math.abs(point.x - x), Math.abs(point.z - z)) < 6))
        continue;
      addPeak(x, z);
    }
    if (cluster.peaks.length) clusters.push(cluster);
  }
  // Keep the established starting island and core islands reproducible before adding new ones.
  for (let row = -1; row <= 1; row++) {
    for (let column = -1; column <= 1; column++) {
      addCluster(
        row === 0 && column === 0 ? start.x : Math.round(size / 2) + column * 110,
        Math.round(size / 2) + row * 110,
      );
    }
  }
  // Fill the full map with separated, jittered mountain clusters, including the corners and east.
  const margin = Math.min(48, Math.floor(size / 2));
  const count = Math.max(1, Math.floor((size - margin * 2) / 110) + 1);
  for (let row = 0; row < count; row++) {
    for (let column = 0; column < count; column++) {
      const x =
        count === 1
          ? Math.round(size / 2)
          : Math.round(margin + (column * (size - 2 * margin)) / (count - 1));
      const z =
        count === 1
          ? Math.round(size / 2)
          : Math.round(margin + (row * (size - 2 * margin)) / (count - 1));
      if (
        clusters.some((cluster) => Math.max(Math.abs(cluster.x - x), Math.abs(cluster.z - z)) < 90)
      )
        continue;
      addCluster(x, z);
    }
  }
  return { clusters, peaks };
}

/** Start at sea level, seed summit heights, then only raise neighbors required by the invariant. */
export function generateWorldHeights(size: number, seed: number): Uint8Array {
  const levels = new Uint8Array((size + 1) ** 2);
  const { peaks } = generateWorldLayout(size, seed);
  for (const peak of peaks) {
    const index = peak.z * (size + 1) + peak.x;
    levels[index] = Math.max(levels[index], peak.height);
  }
  const surface = new TerrainSurface(size, levels, 1);
  surface.enforceSlopeLimit(peaks);
  return levels;
}
