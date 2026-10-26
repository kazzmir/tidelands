import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

// Compile the pure TypeScript surface module in memory; no extra test runner needed.
const source = await readFile(new URL('../src/terrain-surface.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
});
const { TerrainSurface } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-6, `${actual} != ${expected}`);
const field = () => new TerrainSurface(4, Array.from({ length: 16 }, (_, i) => ({ height: i % 4 < 2 ? 1 : 2 })), 0.42);

test('height 1 and height 2 meet with a continuous diagonal slope', () => {
  const surface = field();
  close(surface.sample(1.5, 1.5), 0.42);
  close(surface.sample(1.75, 1.5), 0.525);
  close(surface.sample(2, 1.5), 0.63);
  close(surface.sample(2.25, 1.5), 0.735);
  close(surface.sample(2.5, 1.5), 0.84);
});

test('all shared edges agree from either side, including unequal corner heights', () => {
  const surface = new TerrainSurface(4, Array.from({ length: 16 }, (_, i) => ({ height: i % 7 })), 0.42);
  for (let edge = 1; edge < 4; edge++) {
    for (let along = 0.1; along < 4; along += 0.13) {
      close(surface.sample(edge - 1e-8, along), surface.sample(edge + 1e-8, along));
      close(surface.sample(along, edge - 1e-8), surface.sample(along, edge + 1e-8));
    }
  }
});

test('surface sampling matches every rendered triangle and triangles face upward', () => {
  const surface = field();
  const vertices = surface.positions();
  assert.equal(vertices.length, 16 * 4 * 9);
  for (let i = 0; i < vertices.length; i += 9) {
    const [ax, ay, az, bx, by, bz, cx, cy, cz] = vertices.slice(i, i + 9);
    assert.ok((bz - az) * (cx - ax) - (bx - ax) * (cz - az) > 0);
    close(surface.sample((ax + bx + cx) / 3 + 2, (az + bz + cz) / 3 + 2), (ay + by + cy) / 3);
  }
});

test('water stays below sea level and edits rebuild neighboring slopes', () => {
  const tiles = Array.from({ length: 16 }, () => ({ height: 0 }));
  const before = new TerrainSurface(4, tiles, 0.42);
  close(before.sample(1.5, 1.5), -0.35);
  tiles[5].height = 2;
  const after = new TerrainSurface(4, tiles, 0.42);
  close(after.sample(1.5, 1.5), 0.84);
  assert.ok(after.corner(2, 2) > before.corner(2, 2));
  close(after.sample(0.5, 0.5), -0.35);
});
