import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

const source=await readFile(new URL('../src/survival.ts',import.meta.url),'utf8');
const {outputText}=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}});
const {advanceSurvival,createSurvival,DROWNING_SECONDS,SINKING_SECONDS}=await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);

test('flooding begins drowning immediately, even while paused',()=>{
  const state=createSurvival();
  advanceSurvival(state,0,true);
  assert.deepEqual(state,{phase:'drowning',elapsed:0});
  advanceSurvival(state,0,true);
  assert.equal(state.elapsed,0);
});

test('a settler has two full simulation seconds to be rescued before death',()=>{
  const state=createSurvival();
  advanceSurvival(state,1.99,true);
  assert.equal(state.phase,'drowning');
  advanceSurvival(state,0.01,true);
  assert.equal(state.phase,'sinking');
  assert.equal(state.elapsed,0);
  assert.equal(DROWNING_SECONDS,2);
});

test('restoring land before drowning ends resets the state completely',()=>{
  const state=createSurvival();
  advanceSurvival(state,1.9,true);
  advanceSurvival(state,0,false);
  assert.deepEqual(state,createSurvival());
  advanceSurvival(state,1.5,true);
  assert.equal(state.phase,'drowning');
  assert.equal(state.elapsed,1.5);
});

test('dead settlers sink and cannot be rescued after the two-second deadline',()=>{
  const state=createSurvival();
  advanceSurvival(state,2,true);
  advanceSurvival(state,0.4,false);
  assert.equal(state.phase,'sinking');
  advanceSurvival(state,0.4,false);
  assert.equal(state.phase,'dead');
  advanceSurvival(state,0,false);
  assert.equal(state.phase,'dead');
  assert.equal(SINKING_SECONDS,0.8);
});

test('large time steps carry time from drowning into the sinking animation',()=>{
  const state=createSurvival();
  advanceSurvival(state,2.5,true);
  assert.equal(state.phase,'sinking');
  assert.equal(state.elapsed,0.5);
  advanceSurvival(state,1,true);
  assert.equal(state.phase,'dead');
});

test('dry settlers do not drown and pause stops the drowning timer',()=>{
  const state=createSurvival();
  advanceSurvival(state,100,false);
  assert.deepEqual(state,createSurvival());
  advanceSurvival(state,1,true);
  advanceSurvival(state,0,true);
  assert.equal(state.elapsed,1);
});
