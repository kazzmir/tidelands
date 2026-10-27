import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { transformWithOxc } from 'vite';

const source = await readFile(new URL('../src/terrain-contours.ts',import.meta.url),'utf8');
const { code: outputText } = await transformWithOxc(source, 'test.ts', { target: 'es2022' });
const { elevationContours } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
const segments = values => Array.from({length:values.length/6},(_,i)=>Array.from(values.slice(i*6,i*6+6)));

test('a slope from height 1 to 3 gets a contour at height 2',()=>{
  const lines = segments(elevationContours([0,1,0, 0,3,1, 1,3,0],1));
  const middle = lines.find(line=>line[1]===2 && line[4]===2);
  assert.ok(middle);
  const endpoints = [middle.slice(0,3),middle.slice(3)].sort((a,b)=>a[0]-b[0]);
  assert.deepEqual(endpoints,[[0,2,0.5],[0.5,2,0]]);
});

test('flat surfaces have no contour grid and a touching corner creates no segment',()=>{
  assert.equal(elevationContours([0,2,0, 0,2,1, 1,2,0],1).length,0);
  const lines = segments(elevationContours([0,1,0, 0,2,1, 1,2,0],1));
  assert.equal(lines.length,1);
  assert.equal(lines[0][1],2);
});

test('shared contour edges are drawn only once',()=>{
  const triangle = [0,1,0, 0,2,1, 1,2,0];
  const lines = segments(elevationContours([...triangle,...triangle],1));
  assert.equal(lines.length,1);
});

test('contours respect world height spacing and tolerate Float32 rounding',()=>{
  const vertices = new Float32Array([0,0.65,0, 0,1.95,1, 1,1.95,0]);
  const lines = segments(elevationContours(vertices,0.65));
  const middle = lines.find(line=>Math.abs(line[1]-1.3)<1e-6);
  assert.ok(middle);
  for(const line of lines){
    assert.ok(Math.abs(line[1]/0.65-Math.round(line[1]/0.65))<1e-6);
    assert.equal(line[1],line[4]);
  }
});
