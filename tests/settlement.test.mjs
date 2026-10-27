import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { transformWithOxc } from 'vite';

async function loadModule(path) {
  const source = await readFile(new URL(path, import.meta.url), 'utf8');
  const { code: outputText } = await transformWithOxc(source, 'test.ts', { target: 'es2022' });
  return import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
}
const { TerrainSurface } = await loadModule('../src/terrain-surface.ts');
const { homeSupport, isHabitable, reconcileSettlements, trySettle, releaseInvalidHomes } = await loadModule('../src/settlement.ts');
const tile = (x = 1, z = 1) => ({x, z, tree:false, house:false});
const field = (height = 2) => new TerrainSurface(4, new Uint8Array(25).fill(height), 0.65);
const walker = tile => ({tile, home:null, power:0, homeLevel:null, characterPower:10});

test('a walker claims a flat dry tile and becomes its resident', () => {
  const surface = field();
  const resident = walker(tile());
  assert.equal(trySettle(resident, surface), true);
  assert.equal(resident.home, resident.tile);
  assert.equal(resident.tile.house, true);
  assert.equal(trySettle(resident, surface), false);
});

test('slopes, water, trees and occupied tiles cannot be settled', () => {
  const surface = field();
  const sloping = field();
  sloping.editCorner(1, 1, 1);
  assert.equal(isHabitable(sloping, tile()), false);
  assert.equal(trySettle(walker(tile()), sloping), false);
  assert.equal(trySettle(walker(tile()), field(0)), false);
  assert.equal(trySettle(walker({...tile(), tree:true}), surface), false);
  const sharedTile = tile();
  assert.equal(trySettle(walker(sharedTile), surface), true);
  assert.equal(trySettle(walker(sharedTile), surface), false);
});

test('editing a home into a slope removes the house and releases the same resident', () => {
  const surface = field();
  const resident = walker(tile());
  trySettle(resident, surface);
  const home = resident.home;
  surface.editCorner(1, 1, 1);
  releaseInvalidHomes([resident], surface);
  assert.equal(resident.home, null);
  assert.equal(home.house, false);
  assert.equal(resident.tile, home);
  assert.equal(trySettle(resident, surface), false);
  surface.levels.fill(2);
  assert.equal(trySettle(resident, surface), true);
});

test('moving all four corners together preserves the home and resident', () => {
  const surface = field();
  const resident = walker(tile());
  trySettle(resident, surface);
  const home = resident.home;
  surface.editTile(1, 1, 1);
  releaseInvalidHomes([resident], surface);
  assert.equal(resident.home, home);
  assert.equal(home.house, true);
});

test('flooding a still-flat home releases its resident', () => {
  const surface = field(1);
  const resident = walker(tile());
  trySettle(resident, surface);
  surface.editTile(1, 1, -1);
  releaseInvalidHomes([resident], surface);
  assert.equal(resident.home, null);
  assert.equal(resident.tile.house, false);
});

test('cascaded edits release homes outside the original selection without affecting others', () => {
  const surface = field();
  const nearby = walker(tile(1, 1));
  const distant = walker(tile(0, 0));
  trySettle(nearby, surface);
  trySettle(distant, surface);
  surface.editCorner(3, 3, 2);
  releaseInvalidHomes([nearby, distant], surface);
  assert.equal(nearby.home, null);
  assert.equal(nearby.tile.house, false);
  assert.equal(distant.home, distant.tile);
  assert.equal(distant.tile.house, true);
});
