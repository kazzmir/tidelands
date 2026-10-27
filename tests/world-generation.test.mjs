import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

async function moduleUrl(path, dependencies = {}) {
  const source = await readFile(new URL(path, import.meta.url), 'utf8');
  let { outputText } = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
  });
  for (const [name, url] of Object.entries(dependencies)) {
    outputText = outputText.replaceAll(`'${name}'`, JSON.stringify(url)).replaceAll(`"${name}"`, JSON.stringify(url));
  }
  return `data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`;
}
const terrainUrl = await moduleUrl('../src/terrain-surface.ts');
const { TerrainSurface } = await import(terrainUrl);
const { generateWorldHeights, generateWorldLayout } = await import(await moduleUrl('../src/world-generation.ts', { './terrain-surface': terrainUrl }));

const size = 1000, width = size + 1;
const layout = generateWorldLayout(size, 34);
const levels = generateWorldHeights(size, 34);

test('a 1000×1000 world grows varied-height land from summit seeds while preserving the invariant', () => {
  assert.equal(levels.length, 1001 * 1001);
  let land = 0, startingLand = 0;
  const heights = new Set();
  for (let z = 0; z <= size; z++) for (let x = 0; x <= size; x++) {
    const h = levels[z * width + x];
    assert.ok(h <= 8);
    if (h > 0) { land++; heights.add(h); if (Math.abs(x - 500) <= 50 && Math.abs(z - 500) <= 50) startingLand++; }
    for (const [dx, dz] of [[1, 0], [0, 1], [1, 1], [-1, 1]]) {
      if (x + dx >= 0 && x + dx <= size && z + dz <= size && Math.abs(h - levels[(z + dz) * width + x + dx]) > 1) assert.fail(`steep terrain at ${x},${z}`);
    }
  }
  assert.ok(land > 4000 && land < 85000, `${land} dry points`);
  assert.ok(startingLand > 1000, `${startingLand} dry points near the start`);
  assert.ok(heights.size >= 6);
});

test('clustered peaks naturally form connected multi-mountain landmasses within 30–100 tiles', () => {
  assert.equal(layout.clusters.length, 9);
  for (const cluster of layout.clusters) {
    assert.ok(cluster.peaks.length >= 3);
    const left = Math.min(...cluster.peaks.map(p => p.x - p.height + 1));
    const right = Math.max(...cluster.peaks.map(p => p.x + p.height - 1));
    const top = Math.min(...cluster.peaks.map(p => p.z - p.height + 1));
    const bottom = Math.max(...cluster.peaks.map(p => p.z + p.height - 1));
    assert.ok(right - left + 2 >= 30 && right - left + 2 <= 100);
    assert.ok(bottom - top + 2 >= 30 && bottom - top + 2 <= 100);
    const first = cluster.peaks[0];
    const queue = [first.z * width + first.x], visited = new Set(queue);
    for (let i = 0; i < queue.length; i++) {
      const x = queue[i] % width, z = Math.floor(queue[i] / width);
      for (const [dx, dz] of [[1,0],[-1,0],[0,1],[0,-1]]) {
        const nx = x + dx, nz = z + dz, next = nz * width + nx;
        if (nx < left || nx > right || nz < top || nz > bottom || visited.has(next) || levels[next] === 0) continue;
        visited.add(next); queue.push(next);
      }
    }
    for (const peak of cluster.peaks) {
      assert.equal(levels[peak.z * width + peak.x], peak.height);
      assert.ok(visited.has(peak.z * width + peak.x), 'peaks should be joined by naturally raised foothills');
    }
  }
});

test('only invariant-required terrain is raised; there are no artificial bridges or coast masks', () => {
  assert.equal('bridges' in layout, false);
  let random = 42;
  for (let i = 0; i < 2000; i++) {
    random = (random * 1664525 + 1013904223) >>> 0;
    const x = random % width;
    random = (random * 1664525 + 1013904223) >>> 0;
    const z = random % width;
    const expected = Math.max(0, ...layout.peaks.map(peak => peak.height - Math.max(Math.abs(peak.x - x), Math.abs(peak.z - z))));
    assert.equal(levels[z * width + x], expected);
  }
  const a = layout.clusters[0], b = layout.clusters[1];
  assert.equal(levels[Math.round((a.z + b.z) / 2) * width + Math.round((a.x + b.x) / 2)], 0);
});

test('world generation is seeded and reproducible', () => {
  assert.deepEqual(generateWorldHeights(100, 34), generateWorldHeights(100, 34));
  assert.notDeepEqual(generateWorldHeights(100, 34), generateWorldHeights(100, 51));
});

test('streamed geometry contains only requested tiles, retaining global positions and heights', () => {
  const surface = new TerrainSurface(1000, new Uint8Array(1001 * 1001).fill(3), 0.65);
  const positions = surface.positions({ x: 500, z: 480, width: 32, depth: 32 });
  assert.equal(positions.length, 32 * 32 * 18);
  assert.equal(positions[0], 0);
  assert.ok(Math.abs(positions[1] - 1.95) < 1e-6);
  assert.equal(positions[2], -20);
  assert.equal(positions.at(-3), 32);
  assert.equal(positions.at(-1), 12);
});
