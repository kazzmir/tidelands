import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { transformWithOxc } from 'vite';

// Compile the pure TypeScript surface module in memory; no extra test runner needed.
const source = await readFile(new URL('../src/terrain-surface.ts', import.meta.url), 'utf8');
const { code: outputText } = await transformWithOxc(source, 'test.ts', { target: 'es2022' });
const { TerrainSurface } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-6, `${actual} != ${expected}`);
const field = () => new TerrainSurface(4, Uint8Array.from({ length: 25 }, (_, i) => i % 5 < 2 ? 1 : 2), 0.42);

test('editing changes exactly one shared corner and the four adjoining tiles', () => {
  const surface = new TerrainSurface(4, new Uint8Array(25).fill(1), 0.42);
  const before = surface.levels.slice();
  assert.equal(surface.editCorner(2, 2, 1), true);
  for (let i = 0; i < before.length; i++) assert.equal(surface.levels[i], before[i] + (i === 12 ? 1 : 0));
  assert.deepEqual(surface.affectedTiles(2, 2), [{x:1,z:1}, {x:2,z:1}, {x:1,z:2}, {x:2,z:2}]);
  close(surface.elevation(1, 1), 1.25);
  close(surface.elevation(2, 2), 1.25);
  close(surface.elevation(0, 0), 1);
  assert.equal(surface.editCorner(2, 2, -1), true);
  assert.deepEqual(surface.levels, before);
});

test('whole-surface edits move exactly its four corners when no propagation is needed', () => {
  const surface = new TerrainSurface(4, new Uint8Array(25).fill(1), 0.42);
  const before = surface.levels.slice();
  const points = surface.tileCorners(1, 1);
  assert.equal(surface.editTile(1, 1, 1), true);
  for (let z = 0; z <= surface.size; z++) {
    for (let x = 0; x <= surface.size; x++) {
      const selected = points.some(point => point.x === x && point.z === z);
      assert.equal(surface.level(x, z), before[z * 5 + x] + (selected ? 1 : 0));
    }
  }
  assert.equal(surface.editTile(1, 1, -1), true);
  assert.deepEqual(surface.levels, before);
});

test('whole-surface edits preserve flatness and reject partial edits at limits', () => {
  const surface = new TerrainSurface(1, new Uint8Array(4).fill(2), 0.42);
  assert.equal(surface.editTile(0, 0, 1), true);
  close(surface.sample(0.1, 0.8), 1.26);
  close(surface.sample(0.7, 0.2), 1.26);
  for (const levels of [new Uint8Array([0, 1, 1, 1]), new Uint8Array([13, 13, 14, 13])]) {
    const bounded = new TerrainSurface(1, levels, 0.42);
    const before = levels.slice();
    assert.equal(bounded.editTile(0, 0, levels.includes(0) ? -1 : 1), false);
    assert.deepEqual(levels, before);
  }
  assert.equal(surface.editTile(1, 0, 1), false);
});

test('equal corner heights produce a perfectly flat tile without a center peak', () => {
  const surface = new TerrainSurface(1, new Uint8Array([2, 2, 2, 2]), 0.42);
  for (let z = 0; z <= 1; z += 0.1) {
    for (let x = 0; x <= 1; x += 0.1) close(surface.sample(x, z), 0.84);
  }
  assert.equal(surface.positions().length, 18);
  for (let i = 1; i < 18; i += 3) close(surface.positions()[i], 0.84);
});

test('four coplanar corners form a single inclined plane', () => {
  const surface = new TerrainSurface(1, new Uint8Array([1, 2, 2, 3]), 0.42);
  for (let z = 0; z <= 1; z += 0.1) {
    for (let x = 0; x <= 1; x += 0.1) close(surface.sample(x, z), (1 + x + z) * 0.42);
  }
});

test('all shared edges agree from either side, including unequal corner heights', () => {
  const surface = new TerrainSurface(4, Uint8Array.from({length:25}, (_, i) => i % 7), 0.42);
  for (let edge = 1; edge < 4; edge++) {
    for (let along = 0.1; along < 4; along += 0.13) {
      close(surface.sample(edge - 1e-8, along), surface.sample(edge + 1e-8, along));
      close(surface.sample(along, edge - 1e-8), surface.sample(along, edge + 1e-8));
    }
  }
});

test('sampling matches every rendered triangle and triangles face upward', () => {
  const surface = field();
  const vertices = surface.positions();
  assert.equal(vertices.length, 16 * 2 * 9);
  for (let i = 0; i < vertices.length; i += 9) {
    const [ax, ay, az, bx, by, bz, cx, cy, cz] = vertices.slice(i, i + 9);
    assert.ok((bz - az) * (cx - ax) - (bx - ax) * (cz - az) > 0);
    close(surface.sample((ax + bx + cx) / 3 + 2, (az + bz + cz) / 3 + 2), (ay + by + cy) / 3);
  }
});

test('closest-corner selection and edits work on all four corners and map boundaries', () => {
  const surface = field();
  assert.deepEqual(surface.nearestCorner(1.1, 1.1), {x:1,z:1});
  assert.deepEqual(surface.nearestCorner(1.9, 1.1), {x:2,z:1});
  assert.deepEqual(surface.nearestCorner(1.9, 1.9), {x:2,z:2});
  assert.deepEqual(surface.nearestCorner(1.1, 1.9), {x:1,z:2});
  assert.deepEqual(surface.nearestCorner(-1, 5), {x:0,z:4});
  assert.deepEqual(surface.affectedTiles(0, 0), [{x:0,z:0}]);
  assert.deepEqual(surface.affectedTiles(4, 4), [{x:3,z:3}]);
  assert.equal(surface.editCorner(4, 4, 1), true);
  close(surface.sample(4, 4), surface.corner(4, 4));
});

function assertSlopeLimit(surface) {
  for (let z = 0; z <= surface.size; z++) {
    for (let x = 0; x <= surface.size; x++) {
      const h = surface.level(x, z);
      assert.ok(h >= 0 && h <= surface.maxHeight);
      if (x < surface.size) assert.ok(Math.abs(h - surface.level(x + 1, z)) <= 1, `steep x edge at ${x},${z}`);
      if (z < surface.size) assert.ok(Math.abs(h - surface.level(x, z + 1)) <= 1, `steep z edge at ${x},${z}`);
      if (x < surface.size && z < surface.size) assert.ok(Math.abs(h - surface.level(x + 1, z + 1)) <= 1, `steep diagonal at ${x},${z}`);
      if (x > 0 && z < surface.size) assert.ok(Math.abs(h - surface.level(x - 1, z + 1)) <= 1, `steep diagonal at ${x},${z}`);
    }
  }
}

test('raising to height 4 propagates outward as 3, 2, 1, 0', () => {
  const surface = new TerrainSurface(8, new Uint8Array(81), 0.65);
  surface.editCorner(4, 4, 4);
  for (let z = 0; z <= 8; z++) {
    for (let x = 0; x <= 8; x++) assert.equal(surface.level(x, z), Math.max(0, 4 - Math.max(Math.abs(x - 4), Math.abs(z - 4))));
  }
  assert.ok(surface.changedPoints.some(point => point.x === 1 && point.z === 4));
  assertSlopeLimit(surface);
});

test('lowering a point also lowers higher neighbors as needed', () => {
  const surface = new TerrainSurface(8, new Uint8Array(81).fill(6), 0.65);
  surface.editCorner(4, 4, -4);
  for (let z = 0; z <= 8; z++) {
    for (let x = 0; x <= 8; x++) assert.equal(surface.level(x, z), Math.min(6, 2 + Math.max(Math.abs(x - 4), Math.abs(z - 4))));
  }
  assertSlopeLimit(surface);
});

test('whole-surface propagation keeps the four selected corners at the requested height', () => {
  const surface = new TerrainSurface(8, new Uint8Array(81), 0.65);
  surface.editTile(3, 3, 4);
  for (const point of surface.tileCorners(3, 3)) assert.equal(surface.level(point.x, point.z), 4);
  assert.equal(surface.level(2, 3), 3);
  assert.equal(surface.level(1, 3), 2);
  assert.equal(surface.level(0, 3), 1);
  assertSlopeLimit(surface);
  surface.editTile(3, 3, -3);
  for (const point of surface.tileCorners(3, 3)) assert.equal(surface.level(point.x, point.z), 1);
  assertSlopeLimit(surface);
});

test('generated terrain can be normalized without lowering any point', () => {
  const levels = Uint8Array.from({length:81}, (_, i) => (i * 7) % 9);
  const original = levels.slice();
  const surface = new TerrainSurface(8, levels, 0.65);
  surface.enforceSlopeLimit();
  assertSlopeLimit(surface);
  for (let i = 0; i < levels.length; i++) assert.ok(levels[i] >= original[i]);
});

test('mixed corner and surface edits maintain the slope limit, including map edges', () => {
  const surface = new TerrainSurface(8, new Uint8Array(81).fill(3), 0.65);
  let seed = 123;
  const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  for (let i = 0; i < 500; i++) {
    const delta = random() < 0.5 ? -1 : 1;
    if (i % 3 === 0) surface.editTile(Math.floor(random() * 8), Math.floor(random() * 8), delta);
    else surface.editCorner(Math.floor(random() * 9), Math.floor(random() * 9), delta);
    assertSlopeLimit(surface);
  }
});

test('height zero is submerged; corner heights stay within 0–14', () => {
  const surface = new TerrainSurface(1, new Uint8Array(4), 0.42);
  close(surface.sample(0.5, 0.5), 0);
  assert.equal(surface.editCorner(0, 0, -1), false);
  assert.equal(surface.editCorner(0, 0, 14), true);
  assert.equal(surface.editCorner(0, 0, 1), false);
  assert.equal(surface.level(0, 0), 14);
  assert.equal(surface.editCorner(-1, 0, 1), false);
  assert.equal(surface.editCorner(2, 0, 1), false);
});
