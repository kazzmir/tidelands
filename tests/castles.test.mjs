import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

async function loadModule(path) {
  const source = await readFile(new URL(path, import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
  });
  return import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
}
const { TerrainSurface } = await loadModule('../src/terrain-surface.ts');
const { homeSupport, reconcileSettlements, trySettle } = await loadModule('../src/settlement.ts');
const world = () => {
  const surface = new TerrainSurface(8, new Uint8Array(81).fill(2), 0.65);
  const tiles = Array.from({length:64}, (_, i) => ({x:i % 8, z:Math.floor(i / 8), tree:false, house:false}));
  const resident = (x, z) => {
    const settler = {tile:tiles[z * 8 + x], home:null, power:0, homeLevel:null};
    assert.equal(trySettle(settler, surface), true);
    return settler;
  };
  return {surface, tiles, resident};
};

test('all nine support counts map to the requested power levels', () => {
  const layouts = [
    [[2,2]],
    [[2,2],[1,2]],
    [[2,2],[1,2],[3,2]],
    [[2,2],[1,2],[2,1],[1,1]],
    [[2,2],[1,2],[3,2],[2,1],[2,3]],
  ];
  for (const corner of [[1,1],[3,1],[1,3],[3,3]]) layouts.push([...layouts.at(-1),corner]);
  const expected = [1,2,2,2,3,3,3,4,5];
  for (const [index, layout] of layouts.entries()) {
    const surface = new TerrainSurface(5, new Uint8Array(36), 0.65);
    for (const [x,z] of layout) {
      for (const point of surface.tileCorners(x,z)) surface.levels[point.z * 6 + point.x] = 1;
    }
    const support = homeSupport(surface, {x:2,z:2});
    assert.equal(support.count, index + 1);
    assert.equal(support.power, expected[index]);
  }
});

test('diagonally isolated flat tiles and tiles beyond the 3×3 area do not count', () => {
  const surface = new TerrainSurface(5, new Uint8Array(36), 0.65);
  for (const [x,z] of [[2,2],[1,1]]) {
    for (const point of surface.tileCorners(x,z)) surface.levels[point.z * 6 + point.x] = 1;
  }
  assert.equal(homeSupport(surface, {x:2,z:2}).count, 1);
  surface.levels.fill(1);
  assert.equal(homeSupport(surface, {x:2,z:2}).count, 9);
  assert.equal(homeSupport(surface, {x:0,z:0}).count, 4);
});

test('power 5 creates a nine-tile castle and releases every other resident in its footprint', () => {
  const {surface,tiles,resident} = world();
  const center = resident(4,4);
  const others = [resident(3,4),resident(5,5)];
  const settlers = [center,...others];
  assert.equal(reconcileSettlements(settlers,tiles,surface),true);
  assert.equal(center.power,5);
  assert.equal(tiles.filter(tile=>tile.reserved).length,9);
  assert.equal(tiles.filter(tile=>tile.house).length,1);
  for (const other of others) {
    assert.equal(other.home,null);
    assert.equal(other.power,0);
    assert.equal(trySettle(other,surface),false);
  }
  assert.equal(settlers.length,3);
  assert.equal(reconcileSettlements(settlers,tiles,surface),false);
});

test('changing an outer corner downgrades the castle and frees its footprint', () => {
  const {surface,tiles,resident} = world();
  const owner = resident(4,4);
  reconcileSettlements([owner],tiles,surface);
  surface.editCorner(3,3,1); // Only the NW outer tile becomes non-flat.
  reconcileSettlements([owner],tiles,surface);
  assert.equal(owner.power,4);
  assert.ok(owner.home);
  assert.equal(homeSupport(surface,owner.home).count,8);
  assert.equal(tiles.some(tile=>tile.reserved),false);
  surface.editCorner(3,3,-1);
  reconcileSettlements([owner],tiles,surface);
  assert.equal(owner.power,5);
});

test('changing the center releases a castle resident, including a flat center height change', () => {
  for (const edit of [surface=>surface.editCorner(4,4,1), surface=>surface.editTile(4,4,1)]) {
    const {surface,tiles,resident} = world();
    const owner = resident(4,4);
    reconcileSettlements([owner],tiles,surface);
    edit(surface);
    reconcileSettlements([owner],tiles,surface);
    assert.equal(owner.home,null);
    assert.equal(owner.power,0);
    assert.equal(tiles.some(tile=>tile.reserved || tile.house),false);
  }
});

test('existing castles keep priority and overlapping castles cannot be built', () => {
  const {surface,tiles,resident} = world();
  const castle = resident(4,4);
  reconcileSettlements([castle],tiles,surface);
  const neighbor = resident(6,4);
  reconcileSettlements([neighbor,castle],tiles,surface);
  assert.equal(castle.power,5);
  assert.equal(neighbor.power,4);
  assert.equal(tiles.filter(tile=>tile.reserved).length,9);
});
