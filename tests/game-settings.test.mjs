import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {transformWithOxc,parseSync} from 'vite';
async function url(path,deps={}){let {code}=await transformWithOxc(await readFile(new URL(path,import.meta.url),'utf8'),'test.ts',{target:'es2022'});for(const[name,value]of Object.entries(deps))code=code.replaceAll(`'${name}'`,JSON.stringify(value)).replaceAll(`"${name}"`,JSON.stringify(value));return `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;}
const {STARTING_POWER,worldDimension,newGameSettings}=await import(await url('../src/game-settings.ts'));
const terrain=await url('../src/terrain-surface.ts'),{TerrainSurface}=await import(terrain);
const {generateWorldHeights,playerStartAnchor,enemyStartAnchor}=await import(await url('../src/world-generation.ts',{'./terrain-surface':terrain}));

test('new game settings offer three distinct safe dimensions and 500 starting power',()=>{
 assert.equal(STARTING_POWER,500);assert.deepEqual(['small','medium','large'].map(worldDimension),[200,350,500]);
 for(const difficulty of ['easy','normal','hard'])for(const worldSize of ['small','medium','large'])assert.deepEqual(newGameSettings(difficulty,worldSize),{difficulty,worldSize});
 for(const [difficulty,size]of [['unknown','small'],['normal','huge'],['','large'],['hard','__proto__']])assert.equal(newGameSettings(difficulty,size),null);
});
test('every selectable world generates correctly sized terrain and separate dry population starts',()=>{
 for(const preset of ['small','medium','large']){
  const size=worldDimension(preset),levels=generateWorldHeights(size,34),surface=new TerrainSurface(size,levels,.65),human=playerStartAnchor(size),enemy=enemyStartAnchor(size);
  assert.equal(levels.length,(size+1)**2);assert.ok(Math.hypot(human.x-enemy.x,human.z-enemy.z)>50);
  for(const point of [human,enemy])assert.ok(surface.sample(point.x+.5,point.z+.5)>.08);
 }
});
test('startup presents an accessible settings dialog without generating or simulating the player world first',async()=>{
 const html=await readFile(new URL('../index.html',import.meta.url),'utf8'),source=await readFile(new URL('../src/main.ts',import.meta.url),'utf8');
 assert.match(html,/<dialog id="new-game-menu"[^>]*aria-labelledby="new-game-title"/);assert.match(html,/id="menu-ai-difficulty"/);assert.match(html,/id="menu-world-size"/);assert.match(html,/id="start-new-game" type="submit"/);assert.match(html,/id="cancel-new-game" type="button" hidden/);
 const {program}=parseSync('main.ts',source),entry=program.body.find(n=>n.type==='FunctionDeclaration'&&n.id.name==='startGame');
 const directCalls=entry.body.body.filter(n=>n.type==='ExpressionStatement'&&n.expression.type==='CallExpression').map(n=>n.expression.callee.name);
 assert.ok(directCalls.includes('openNewGameMenu'));assert.ok(!directCalls.includes('generateWorld'));assert.match(source,/if\s*\(!gameStarted\s*\|\|\s*newGameMenu.open\)\s*return/);
 assert.equal([...source.matchAll(/new PowerMeter\(5, STARTING_POWER\)/g)].length,2);assert.match(source,/cornerLevels = new Uint8Array/);assert.match(source,/minimapTerrain = createMinimapTerrain\(\)/);
});
