import { TerrainSurface, type GridPoint } from './terrain-surface';

export interface TerrainPeak extends GridPoint {
  height: number;
}
export type IslandKind = 'small' | 'medium' | 'large';
export interface PeakCluster extends GridPoint {
  peaks: TerrainPeak[];
  radius: number;
  kind: IslandKind;
  starting?: 'player' | 'enemy';
}
export interface WorldLayout {
  clusters: PeakCluster[];
  peaks: TerrainPeak[];
}

/** Room for a large starting island and its invariant-required foothills at the western edge. */
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

/** Randomly scattered, variable-size islands grown from connected summit seeds, never a grid. */
export function generateWorldLayout(size: number, seed: number): WorldLayout {
  let state = seed >>> 0;
  const random = (): number => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
  const clusters: PeakCluster[] = [],
    peaks: TerrainPeak[] = [];
  const tau = Math.PI * 2;

  function addCluster(
    center: GridPoint,
    radius: number,
    kind: IslandKind,
    starting?: 'player' | 'enemy',
  ): void {
    const cluster: PeakCluster = { ...center, radius, kind, starting, peaks: [] };
    const rotation = random() * tau;
    const stretch = starting ? 0.85 + random() * 0.15 : 0.55 + random() * 0.45;
    const phase = random() * tau;
    const covered = new Set<number>();
    let left = center.x,
      right = center.x,
      top = center.z,
      bottom = center.z;
    function fits(x: number, z: number): boolean {
      if (x < 0 || z < 0 || x > size || z > size) return false;
      const dx = x - center.x,
        dz = z - center.z;
      const u = dx * Math.cos(rotation) + dz * Math.sin(rotation);
      const v = -dx * Math.sin(rotation) + dz * Math.cos(rotation);
      const angle = Math.atan2(v / stretch, u);
      // This constrains summit placement, not terrain heights or a coastline mask.
      const envelope =
        radius * (0.88 + 0.08 * Math.sin(angle * 3 + phase) + 0.04 * Math.sin(angle * 5 - phase));
      return Math.hypot(u, v / stretch) <= envelope;
    }
    function addPeak(x: number, z: number): TerrainPeak | null {
      if (
        !fits(x, z) ||
        cluster.peaks.some((point) => Math.max(Math.abs(point.x - x), Math.abs(point.z - z)) < 4)
      )
        return null;
      const point = { x, z, height: 6 + Math.floor(random() * 3) };
      cluster.peaks.push(point);
      peaks.push(point);
      if (starting) {
        const reach = point.height - 1;
        left = Math.min(left, x - reach);
        right = Math.max(right, x + reach);
        top = Math.min(top, z - reach);
        bottom = Math.max(bottom, z + reach);
        for (let tz = Math.max(0, z - reach); tz <= Math.min(size, z + reach); tz++)
          for (let tx = Math.max(0, x - reach); tx <= Math.min(size, x + reach); tx++)
            covered.add(tz * (size + 1) + tx);
      }
      return point;
    }
    const root = addPeak(center.x, center.z);
    if (!root) return;
    // Uneven arms create broad inhabited islands and occasional elongated wild islands.
    const arms = starting
      ? 5 + Math.floor(random() * 3)
      : kind === 'large'
        ? 3 + Math.floor(random() * 3)
        : kind === 'medium'
          ? 2 + Math.floor(random() * 3)
          : 0;
    for (let arm = 0; arm < arms; arm++) {
      const angle = rotation + (arm * tau) / arms + (random() - 0.5) * 0.45;
      const local = angle - rotation;
      const reach =
        (radius / Math.hypot(Math.cos(local), Math.sin(local) / stretch)) * (0.7 + random() * 0.25);
      for (let distance = 6.5; distance <= reach; distance += 6.5) {
        if (
          !addPeak(
            center.x + Math.round(Math.cos(angle) * distance),
            center.z + Math.round(Math.sin(angle) * distance),
          )
        )
          break;
      }
    }
    const target = starting
      ? Math.max(3, Math.round((52 + random() * 13) * (radius / 36) ** 2))
      : kind === 'small'
        ? 1 + Math.floor(random() * 5)
        : kind === 'medium'
          ? 12 + Math.floor(random() * 13)
          : 30 + Math.floor(random() * 23);
    const minimumStartArea = Math.min(1800, Math.floor(Math.PI * radius * radius * 0.6));
    const minimumStartExtent = Math.min(50, Math.floor(radius * 1.4));
    for (let attempt = 0; attempt < Math.max(1200, target * 180); attempt++) {
      if (
        cluster.peaks.length >= target &&
        (!starting ||
          (covered.size >= minimumStartArea &&
            right - left + 1 >= minimumStartExtent &&
            bottom - top + 1 >= minimumStartExtent))
      )
        break;
      const a = cluster.peaks[Math.floor(random() * cluster.peaks.length)];
      const b = cluster.peaks[Math.floor(random() * cluster.peaks.length)];
      const parent =
        random() < 0.6 &&
        Math.hypot(b.x - center.x, b.z - center.z) > Math.hypot(a.x - center.x, a.z - center.z)
          ? b
          : a;
      const direction = random() * tau,
        distance = 5 + random() * 3;
      addPeak(
        parent.x + Math.round(Math.cos(direction) * distance),
        parent.z + Math.round(Math.sin(direction) * distance),
      );
    }
    clusters.push(cluster);
  }

  const player = playerStartAnchor(size),
    enemy = enemyStartAnchor(size);
  const startingRadius = Math.min(
    36,
    Math.max(2, Math.min(player.x, size - player.x, player.z, size - player.z) - 8),
  );
  addCluster(player, startingRadius, 'large', 'player');
  if (Math.hypot(enemy.x - player.x, enemy.z - player.z) > startingRadius * 2 + 24)
    addCluster(enemy, startingRadius, 'large', 'enemy');

  const targetCount = Math.max(
    clusters.length,
    Math.round((size / 1000) ** 2 * (80 + random() * 24)),
  );
  for (let attempt = 0; attempt < targetCount * 400 && clusters.length < targetCount; attempt++) {
    const roll = random();
    const kind: IslandKind = roll < 0.45 ? 'small' : roll < 0.8 ? 'medium' : 'large';
    const radius =
      kind === 'small'
        ? 3 + random() * 8
        : kind === 'medium'
          ? 14 + random() * 10
          : 27 + random() * 13;
    const margin = Math.ceil(radius + 8);
    if (size <= margin * 2) continue;
    const center = {
      x: Math.round(margin + random() * (size - margin * 2)),
      z: Math.round(margin + random() * (size - margin * 2)),
    };
    const clearance = 12 + random() * 20;
    if (
      clusters.some(
        (cluster) =>
          Math.hypot(cluster.x - center.x, cluster.z - center.z) <
          cluster.radius + radius + 20 + clearance,
      )
    )
      continue;
    addCluster(center, radius, kind);
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
