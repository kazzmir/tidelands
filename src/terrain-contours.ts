type Point = [number, number, number];

/** Intersect sloping terrain triangles with each integer-height plane. */
export function elevationContours(positions: ArrayLike<number>, step: number): Float32Array {
  const result: number[] = [];
  const segments = new Set<string>();
  const epsilon = 1e-6;
  for (let i = 0; i < positions.length; i += 9) {
    const vertices: Point[] = [
      [positions[i], positions[i + 1], positions[i + 2]],
      [positions[i + 3], positions[i + 4], positions[i + 5]],
      [positions[i + 6], positions[i + 7], positions[i + 8]],
    ];
    const low = Math.min(...vertices.map(point => point[1]));
    const high = Math.max(...vertices.map(point => point[1]));
    if (high - low < epsilon) continue; // Never draw grids across flat terrain.
    for (let level = Math.max(1, Math.ceil((low - epsilon) / step)); level <= Math.floor((high + epsilon) / step); level++) {
      const y = level * step;
      const intersections: Point[] = [];
      const add = (point: Point): void => {
        if (!intersections.some(other => Math.abs(other[0] - point[0]) < epsilon && Math.abs(other[2] - point[2]) < epsilon)) intersections.push(point);
      };
      for (let edge = 0; edge < 3; edge++) {
        const a = vertices[edge]; const b = vertices[(edge + 1) % 3];
        const da = a[1] - y; const db = b[1] - y;
        if (Math.abs(da) < epsilon) add([a[0], y, a[2]]);
        if ((da < -epsilon && db > epsilon) || (da > epsilon && db < -epsilon)) {
          const t = (y - a[1]) / (b[1] - a[1]);
          add([a[0] + (b[0] - a[0]) * t, y, a[2] + (b[2] - a[2]) * t]);
        }
      }
      if (intersections.length !== 2) continue; // A single touching vertex is not a line.
      const keys = intersections.map(point => `${point[0].toFixed(6)},${level},${point[2].toFixed(6)}`).sort();
      const key = keys.join('|');
      if (segments.has(key)) continue; // Shared triangle/tile edges must not darken twice.
      segments.add(key);
      result.push(...intersections[0], ...intersections[1]);
    }
  }
  return new Float32Array(result);
}
