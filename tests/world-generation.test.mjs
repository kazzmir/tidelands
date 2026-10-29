import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { transformWithOxc } from 'vite';

async function moduleUrl(path, dependencies = {}) {
  const source = await readFile(new URL(path, import.meta.url), 'utf8');
  let { code: outputText } = await transformWithOxc(source, 'test.ts', { target: 'es2022' });
  for (const [name, url] of Object.entries(dependencies)) {
    outputText = outputText.replaceAll(`'${name}'`, JSON.stringify(url)).replaceAll(`"${name}"`, JSON.stringify(url));
  }
  return `data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`;
}
const terrainUrl = await moduleUrl('../src/terrain-surface.ts');
const { TerrainSurface } = await import(terrainUrl);
const { generateWorldHeights, generateWorldLayout, playerStartAnchor, enemyStartAnchor } = await import(await moduleUrl('../src/world-generation.ts', { './terrain-surface': terrainUrl }));

const size = 1000, width = size + 1;
const start = playerStartAnchor(size);
const layout = generateWorldLayout(size, 34);
const levels = generateWorldHeights(size, 34);

test('a 1000×1000 world grows varied-height land from summit seeds while preserving the invariant', () => {
  assert.equal(levels.length, 1001 * 1001);
  let land = 0, startingLand = 0;
  const heights = new Set();
  for (let z = 0; z <= size; z++) for (let x = 0; x <= size; x++) {
    const h = levels[z * width + x];
    assert.ok(h <= 8);
    if (h > 0) { land++; heights.add(h); if (Math.abs(x - start.x) <= 50 && Math.abs(z - start.z) <= 50) startingLand++; }
    for (const [dx, dz] of [[1, 0], [0, 1], [1, 1], [-1, 1]]) {
      if (x + dx >= 0 && x + dx <= size && z + dz <= size && Math.abs(h - levels[(z + dz) * width + x + dx]) > 1) assert.fail(`steep terrain at ${x},${z}`);
    }
  }
  assert.ok(land > 40000 && land < 300000, `${land} dry points`);
  assert.ok(startingLand > 1000, `${startingLand} dry points near the start`);
  assert.ok(heights.size >= 6);
});

test('human starting land is near the far western edge, with room for its natural foothills',async()=>{
  assert.deepEqual(start,{x:48,z:500});
  assert.ok(size/2-start.x>=450);
  const home=layout.clusters.find(cluster=>cluster.starting==='player');
  assert.ok(Math.abs(home.x-start.x)<=4 && Math.abs(home.z-start.z)<=4);
  assert.ok(home.peaks.every(peak=>peak.x-peak.height+1>=0 && peak.x+peak.height-1<size));
  const source=await readFile(new URL('../src/main.ts',import.meta.url),'utf8');
  assert.match(source,/Math.hypot\(tile.x - anchor.x, tile.z - anchor.z\)/);
  assert.match(source,/element\('#reset-view'\).addEventListener\('click', resetPlayerCamera\)/);
});

test('enemy start uses the farthest inset corner on the opposite side',()=>{
  const enemy=enemyStartAnchor(size);
  assert.deepEqual(enemy,{x:952,z:952});
  const distance=Math.hypot(enemy.x-start.x,enemy.z-start.z);
  assert.ok(distance>1000);
  for(const x of [48,952])for(const z of [48,952])assert.ok(Math.hypot(x-start.x,z-start.z)<=distance);
  assert.ok(layout.clusters.some(cluster=>Math.abs(cluster.x-952)<=4 && Math.abs(cluster.z-952)<=4));
});

test('variable-size summit clusters naturally form connected islands without sculpted land', () => {
  assert.ok(layout.clusters.length>=75 && layout.clusters.length<=105);
  for (const cluster of layout.clusters) {
    assert.ok(cluster.peaks.length >= 1);
    const left = Math.min(...cluster.peaks.map(p => p.x - p.height + 1));
    const right = Math.max(...cluster.peaks.map(p => p.x + p.height - 1));
    const top = Math.min(...cluster.peaks.map(p => p.z - p.height + 1));
    const bottom = Math.max(...cluster.peaks.map(p => p.z + p.height - 1));
    assert.ok(right - left + 2 >= 10 && right - left + 2 <= 100);
    assert.ok(bottom - top + 2 >= 10 && bottom - top + 2 <= 100);
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

test('islands cover every region of the map, not only the player start and central area',()=>{
  const regions=new Set(layout.clusters.map(cluster=>`${Math.min(4,Math.floor(cluster.x/200))},${Math.min(4,Math.floor(cluster.z/200))}`));
  assert.ok(regions.size>=20,'islands should cover the map without requiring one in every grid cell');
  for(const [left,top] of [[true,true],[false,true],[true,false],[false,false]]){
    assert.ok(layout.clusters.filter(cluster=>(cluster.x<500)===left && (cluster.z<500)===top).length>=8);
  }
  const nearOldGrid=value=>Math.abs((value-48)/113-Math.round((value-48)/113))*113<6;
  const aligned=layout.clusters.filter(cluster=>nearOldGrid(cluster.x)&&nearOldGrid(cluster.z)).length;
  assert.ok(aligned<layout.clusters.length/4,'centers must not follow the old jittered lattice');
});

function islandFootprint(cluster){
  const cells=new Set();
  for(const peak of cluster.peaks)for(let z=peak.z-peak.height+1;z<peak.z+peak.height;z++)for(let x=peak.x-peak.height+1;x<peak.x+peak.height;x++)cells.add(z*width+x);
  return cells;
}

test('archipelago mixes tiny islets, medium islands, and substantially larger landmasses',()=>{
  const areas=layout.clusters.map(cluster=>islandFootprint(cluster).size);
  assert.ok(Math.min(...areas)<200);assert.ok(Math.max(...areas)>2500);
  assert.ok(Math.max(...areas)/Math.min(...areas)>12);
  assert.ok(layout.clusters.filter(cluster=>cluster.kind==='small').length>=15);
  assert.ok(layout.clusters.filter(cluster=>cluster.kind==='medium').length>=10);
  assert.ok(layout.clusters.filter(cluster=>cluster.kind==='large'&&!cluster.starting).length>=5);
});

test('both populations receive broad medium-to-large home islands across new-world seeds',()=>{
  for(const seed of [34,51,68,85,102]){
    const generated=generateWorldLayout(size,seed);
    for(const side of ['player','enemy']){
      const home=generated.clusters.find(cluster=>cluster.starting===side);
      assert.ok(home);assert.equal(home.kind,'large');
      assert.ok(islandFootprint(home).size>=1800,`${side} has too little land for seed ${seed}`);
      assert.ok(Math.max(...home.peaks.map(peak=>peak.x+peak.height-1))-Math.min(...home.peaks.map(peak=>peak.x-peak.height+1))+1>=50);
      assert.ok(Math.max(...home.peaks.map(peak=>peak.z+peak.height-1))-Math.min(...home.peaks.map(peak=>peak.z-peak.height+1))+1>=50);
      assert.ok(home.peaks.every(peak=>peak.x-peak.height+1>=0 && peak.z-peak.height+1>=0 && peak.x+peak.height-1<=size && peak.z+peak.height-1<=size));
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
  const a = layout.clusters.find(cluster=>cluster.starting==='player');
  assert.ok(levels[Math.round(a.z)*width+Math.round(a.x+55)]===0,'starting island should retain an ocean gap');
});

test('world generation is seeded and reproducible', () => {
  assert.deepEqual(generateWorldHeights(100, 34), generateWorldHeights(100, 34));
  assert.notDeepEqual(generateWorldHeights(100, 34), generateWorldHeights(100, 51));
});

test('the playable world is 500×500 with scaled island count and full-sized starting islands',async()=>{
  const dimension=500,small=generateWorldLayout(dimension,34),heights=generateWorldHeights(dimension,34);
  assert.equal(heights.length,501*501);
  assert.deepEqual(playerStartAnchor(dimension),{x:48,z:250});
  assert.deepEqual(enemyStartAnchor(dimension),{x:452,z:452});
  assert.ok(small.clusters.length>=20 && small.clusters.length<=26);
  for(const side of ['player','enemy']){
    const home=small.clusters.find(cluster=>cluster.starting===side);
    const occupied=new Set();
    for(const peak of home.peaks)for(let z=peak.z-peak.height+1;z<peak.z+peak.height;z++)for(let x=peak.x-peak.height+1;x<peak.x+peak.height;x++){
      assert.ok(x>=0&&z>=0&&x<=dimension&&z<=dimension);occupied.add(z*501+x);
    }
    assert.ok(occupied.size>=1800);
  }
  const source=await readFile(new URL('../src/main.ts',import.meta.url),'utf8');
  assert.match(source,/let SIZE = worldDimension\(worldSize\);/);
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
