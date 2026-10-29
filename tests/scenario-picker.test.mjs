import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {parseSync} from 'vite';
const source=await readFile(new URL('../src/main.ts',import.meta.url),'utf8');
const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
const functions=new Map();
function visit(node){if(!node||typeof node!=='object')return;if(node.type==='FunctionDeclaration'&&node.id)functions.set(node.id.name,source.slice(node.start,node.end));for(const value of Object.values(node))if(Array.isArray(value))value.forEach(visit);else if(value&&typeof value==='object')visit(value);}
visit(parseSync('main.ts',source).program);

test('test scenarios are an accessible native dropdown, including combat and the funded small-map sandbox',()=>{
 const picker=html.match(/<select id="test-scenario"[\s\S]*?<\/select>/)?.[0];assert.ok(picker);assert.match(picker,/aria-label="Test scenario \(resets world\)"/);assert.match(picker,/<option value="combat">Shared-island combat<\/option>/);assert.match(picker,/<option value="sandbox">Small map · 20,000 power<\/option>/);assert.doesNotMatch(html,/<button id="test-scenario"/);
});
test('sandbox starts a real small normal world, keeps difficulty, grants only player 20,000 power, and refreshes spells/HUD',()=>{
 const action=functions.get('startTestScenario');assert.match(action,/selection === 'combat'\) startWorld\(true\)/);assert.match(action,/applyNewGame\(\{ difficulty, worldSize: 'small' \}\)/);assert.match(action,/powerMeter.value = 20_000;\s*updatePowerDisplay\(\)/);assert.doesNotMatch(action,/enemyPowerMeter.value\s*=|encounterTest\s*=\s*true/);
 assert.match(functions.get('applyNewGame'),/SIZE = worldDimension\(worldSize\)/);assert.match(functions.get('applyNewGame'),/startWorld\(false\)/);
});
test('scenario picker can rerun either selection and regular new worlds restore their ordinary power budgets',()=>{
 assert.match(functions.get('startTestScenario'),/else return;/);assert.match(functions.get('startTestScenario'),/select.value = ''/);assert.match(functions.get('generateWorld'),/powerMeter.reset\(\);\s*enemyPowerMeter.reset\(\)/);assert.match(functions.get('generateWorld'),/testSelect.classList.toggle\('active', encounterTest\)/);
});
