/** Smooth, deterministic continents. Neighboring (including diagonal) levels differ by at most one. */
export function generateWorldHeights(size: number, seed: number): Uint8Array {
  const levels = new Uint8Array((size + 1) ** 2);
  const offset = seed * 0.73;
  for (let z = 0; z <= size; z++) {
    const pz = z - size / 2;
    for (let x = 0; x <= size; x++) {
      const px = x - size / 2;
      // Broad mainland around the starting area, a second island, and distant archipelagos.
      const mainland = 7 - Math.hypot((px + 25) / 12, (pz + 20) / 10);
      const island = 7 - Math.hypot((px - 140) / 9, (pz + 100) / 11);
      const continents =
        1.7 *
          (Math.sin((px + offset) * 0.018) +
            Math.cos((pz - offset) * 0.016) +
            Math.sin((px + pz + offset) * 0.011)) -
        1.2;
      const detail = 0.3 * Math.sin(px * 0.12 + offset) + 0.25 * Math.cos(pz * 0.1 - offset);
      // Combined gradients remain below one level per grid step, so quantizing preserves the slope rule.
      levels[z * (size + 1) + x] = Math.max(
        0,
        Math.min(8, Math.floor(Math.max(mainland, island, continents) + detail)),
      );
    }
  }
  return levels;
}
