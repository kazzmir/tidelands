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
const { fertileLand, homeSupport, reconcileSettlements, trySettle } = await loadModule('../src/settlement.ts');
const world = (size=8) => {
  const surface = new TerrainSurface(size, new Uint8Array((size+1)**2).fill(2), 0.65);
  const tiles = Array.from({length:size**2}, (_, i) => ({x:i % size, z:Math.floor(i / size), tree:false, house:false}));
  const resident = (x, z) => {
    const settler = {tile:tiles[z * size + x], home:null, power:0, homeLevel:null, characterPower:10};
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

test('castles clear trees in their footprint and extended farmland but retain distant trees', () => {
  const {surface,tiles,resident} = world();
  const owner = resident(4,4);
  for (const tile of tiles) if (!tile.house) tile.tree = true;
  reconcileSettlements([owner],tiles,surface);
  for (const tile of tiles) {
    const cultivated = Math.abs(tile.x - 4) <= 3 && Math.abs(tile.z - 4) <= 3;
    assert.equal(tile.tree, !cultivated);
  }
  surface.editCorner(3,3,1);
  reconcileSettlements([owner],tiles,surface);
  assert.equal(tiles[3 * 8 + 3].tree,false);
  assert.equal(tiles[0].tree,true);
});

test('castle farming extends three tiles from its center and shrinks on downgrade', () => {
  const {surface,tiles,resident} = world();
  const owner = resident(4,4);
  reconcileSettlements([owner],tiles,surface);
  assert.equal(owner.power,5);
  const fields = fertileLand([owner],surface);
  assert.equal(fields.length,49);
  assert.ok(fields.some(point=>point.x===1 && point.z===1));
  assert.ok(fields.some(point=>point.x===7 && point.z===7));
  assert.ok(fields.every(point=>Math.abs(point.x-4)<=3 && Math.abs(point.z-4)<=3));
  surface.editCorner(1,1,1);
  assert.equal(fertileLand([owner],surface).length,48); // Non-flat outer tile is excluded.
  surface.editCorner(3,3,1);
  reconcileSettlements([owner],tiles,surface);
  assert.equal(owner.power,4);
  assert.ok(fertileLand([owner],surface).every(point=>Math.abs(point.x-4)<=1 && Math.abs(point.z-4)<=1));
});

test('fertile land is deduplicated, flat, at home height, and limited to the influence area', () => {
  const {surface,resident} = world();
  const owners = [resident(3,3),resident(4,3)];
  assert.equal(fertileLand(owners,surface).length,12);
  surface.editCorner(2,2,1);
  const fields = fertileLand(owners,surface);
  assert.equal(fields.length,11);
  assert.ok(!fields.some(point=>point.x===2 && point.z===2));
  for (const point of fields) {
    assert.equal(surface.level(point.x,point.z),2);
    assert.ok(owners.some(owner=>Math.abs(point.x-owner.home.x)<=1 && Math.abs(point.z-owner.home.z)<=1));
  }
  owners[0].home = null;
  assert.equal(fertileLand(owners,surface).length,9);
  owners[1].home = null;
  assert.equal(fertileLand(owners,surface).length,0);
});

test('farming permanently clears trees only from qualifying fertile tiles', () => {
  const {surface,tiles,resident} = world();
  surface.editCorner(3,3,1); // Keep this a house rather than a nine-tile castle.
  const owner = resident(4,4);
  const fields = new Set(fertileLand([owner],surface).map(point=>`${point.x},${point.z}`));
  for (const tile of tiles) if (!tile.house) tile.tree = true;
  reconcileSettlements([owner],tiles,surface);
  assert.equal(owner.power,4);
  for (const tile of tiles) assert.equal(tile.tree,!fields.has(`${tile.x},${tile.z}`));
  assert.equal(tiles[3 * 8 + 3].tree,true); // Non-flat tile in range retains its trees.
  surface.editCorner(4,4,1);
  reconcileSettlements([owner],tiles,surface);
  assert.equal(owner.home,null);
  assert.equal(tiles[5 * 8 + 5].tree,false); // Trees do not regrow after the farm disappears.
});

test('castle buffers block houses until there are two clear tiles, including diagonally', () => {
  const {surface,tiles,resident} = world(10);
  const castle = resident(4,4);
  reconcileSettlements([castle],tiles,surface);
  assert.equal(tiles.filter(tile=>tile.castleGap).length,40);
  for (const [x,z] of [[6,4],[2,4],[4,6],[4,2],[6,6],[2,2],[7,4],[4,7],[7,7],[1,1]]) {
    const walker = {tile:tiles[z * 10 + x],home:null,power:0,homeLevel:null,characterPower:10};
    assert.equal(trySettle(walker,surface),false);
    assert.equal(walker.tile.reserved,false); // Buffer is not part of the castle footprint.
  }
  assert.ok(resident(8,4).home);
  assert.ok(resident(8,8).home);
});

test('castle expansion releases houses in the buffer, and downgrading frees the buffer', () => {
  const {surface,tiles,resident} = world();
  const castle = resident(4,4);
  const adjacent = resident(6,4);
  reconcileSettlements([castle,adjacent],tiles,surface);
  assert.equal(adjacent.home,null);
  assert.equal(adjacent.characterPower,10);
  assert.equal(trySettle(adjacent,surface),false);
  surface.editCorner(3,3,1);
  reconcileSettlements([castle,adjacent],tiles,surface);
  assert.equal(castle.power,4);
  assert.equal(tiles.some(tile=>tile.castleGap),false);
  assert.equal(trySettle(adjacent,surface),true);
});

test('existing castles keep priority and castle expansions respect the gap', () => {
  const {surface,tiles,resident} = world();
  const castle = resident(2,3);
  reconcileSettlements([castle],tiles,surface);
  const neighbor = resident(6,3);
  reconcileSettlements([neighbor,castle],tiles,surface);
  assert.equal(castle.power,5);
  assert.equal(neighbor.power,4);
  assert.equal(tiles.filter(tile=>tile.reserved).length,9);
});
