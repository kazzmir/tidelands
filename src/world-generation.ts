export interface LandMass {
  x: number;
  z: number;
  radiusX: number;
  radiusZ: number;
  peak: number;
  offsetX: number;
  offsetZ: number;
  phase: number;
}
export interface LandBridge {
  from: number;
  to: number;
  level: number;
}
export interface WorldLayout {
  islands: LandMass[];
  bridges: LandBridge[];
}

/** Nine compact island bodies; bridges deliberately connect them into a larger archipelago. */
export function generateWorldLayout(size: number, seed: number): WorldLayout {
  let state = seed >>> 0;
  const random = (): number => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
  const islands: LandMass[] = [];
  for (let z = -1; z <= 1; z++) {
    for (let x = -1; x <= 1; x++) {
      islands.push({
        x: Math.round(size / 2) + x * 52 + Math.floor(random() * 5) - 2,
        z: Math.round(size / 2) + z * 52 + Math.floor(random() * 5) - 2,
        radiusX: 16 + Math.floor(random() * 8),
        radiusZ: 16 + Math.floor(random() * 8),
        peak: 3 + ((islands.length + seed) % 6),
        offsetX: Math.floor(random() * 9) - 4,
        offsetZ: Math.floor(random() * 9) - 4,
        phase: random() * Math.PI * 2,
      });
    }
  }
  const edges: Array<[number, number]> = [];
  for (let z = 0; z < 3; z++) {
    for (let x = 0; x < 3; x++) {
      if (x < 2) edges.push([z * 3 + x, z * 3 + x + 1]);
      if (z < 2) edges.push([z * 3 + x, (z + 1) * 3 + x]);
    }
  }
  for (let i = edges.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [edges[i], edges[j]] = [edges[j], edges[i]];
  }
  const parents = islands.map((_, i) => i);
  const root = (index: number): number => {
    while (parents[index] !== index) index = parents[index];
    return index;
  };
  const bridges: LandBridge[] = [];
  for (const [from, to] of edges) {
    const a = root(from);
    const b = root(to);
    if (a === b && random() > 0.35) continue;
    parents[a] = b;
    bridges.push({ from, to, level: 1.8 + random() * 0.7 });
  }
  return { islands, bridges };
}

/** Rasterize only island/bridge bounds; the remainder of the million-tile world is sea. */
export function generateWorldHeights(size: number, seed: number): Uint8Array {
  const levels = new Uint8Array((size + 1) ** 2);
  const { islands, bridges } = generateWorldLayout(size, seed);
  function rasterize(
    left: number,
    top: number,
    right: number,
    bottom: number,
    height: (x: number, z: number) => number,
  ): void {
    for (let z = Math.max(0, Math.floor(top)); z <= Math.min(size, Math.ceil(bottom)); z++) {
      for (let x = Math.max(0, Math.floor(left)); x <= Math.min(size, Math.ceil(right)); x++) {
        const index = z * (size + 1) + x;
        levels[index] = Math.max(levels[index], Math.max(0, Math.min(8, Math.floor(height(x, z)))));
      }
    }
  }
  for (const island of islands) {
    rasterize(
      island.x - island.radiusX,
      island.z - island.radiusZ,
      island.x + island.radiusX,
      island.z + island.radiusZ,
      (x, z) => {
        const dx = x - island.x;
        const dz = z - island.z;
        const shore =
          (Math.min(island.radiusX, island.radiusZ) *
            (1 - Math.hypot(dx / island.radiusX, dz / island.radiusZ))) /
          1.5;
        const hill =
          island.peak - Math.hypot((dx - island.offsetX) / 3, (dz - island.offsetZ) / 3.5);
        const secondHill = island.peak - 1.5 - Math.hypot((dx + 5) / 3.5, (dz - 5) / 3);
        const detail = 0.3 * Math.sin(dx * 0.3 + island.phase) + 0.2 * Math.cos(dz * 0.25);
        // Every continuous field changes by <1 per diagonal grid step, preserving the slope rule after flooring.
        return Math.min(shore, Math.max(1, Math.max(hill, secondHill) + detail));
      },
    );
  }
  for (const bridge of bridges) {
    const a = islands[bridge.from];
    const b = islands[bridge.to];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const lengthSquared = dx * dx + dz * dz;
    rasterize(
      Math.min(a.x, b.x) - 4,
      Math.min(a.z, b.z) - 4,
      Math.max(a.x, b.x) + 4,
      Math.max(a.z, b.z) + 4,
      (x, z) => {
        const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / lengthSquared));
        return bridge.level - Math.hypot(x - a.x - t * dx, z - a.z - t * dz) / 1.5;
      },
    );
  }
  return levels;
}
