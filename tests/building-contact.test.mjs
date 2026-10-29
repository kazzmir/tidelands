import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {transformWithOxc} from 'vite';
async function load(path){const {code}=await transformWithOxc(await readFile(new URL(path,import.meta.url),'utf8'),'test.ts',{target:'es2022'});return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);}
const {enemyBuildingContacts,touchesBuilding,buildingDefenderPoint}=await load('../src/building-contact.ts');
const {evacuateSettlements}=await load('../src/settlement.ts');
const {CombatSystem}=await load('../src/combat.ts');
function tile(x,z){return{x,z,tree:false,house:false,reserved:false,castleGap:false};}
function actor(population,x,z,hp=10){return{population,point:{x,z},tile:tile(Math.floor(x),Math.floor(z)),home:null,power:0,homeLevel:null,characterPower:hp,knight:false,survival:{phase:'alive',elapsed:0}};}
function resident(population='blue',level=3,hp=37.5){const value=actor(population,5.5,5.5,hp);value.home=value.tile;value.home.house=true;value.homeLevel=4;value.power=level;return value;}

test('houses trigger at adjacent side contact, not from afar or diagonally around an untouched corner',()=>{
 const home=tile(5,5);
 assert.ok(touchesBuilding({x:6.5,z:5.5},home,1));assert.ok(touchesBuilding({x:4.5,z:5.5},home,4));
 assert.equal(touchesBuilding({x:7.5,z:5.5},home,4),false);assert.equal(touchesBuilding({x:6.5,z:6.5},home,1),false);
});
test('castles use the full 3x3 footprint, including the sides away from the center',()=>{
 const home=tile(5,5);assert.ok(touchesBuilding({x:7.5,z:6.5},home,5));
 assert.ok(touchesBuilding({x:3.5,z:5.5},home,5));assert.equal(touchesBuilding({x:8.5,z:5.5},home,5),false);
 assert.equal(touchesBuilding({x:7.5,z:7.5},home,5),false);
});
test('ordinary characters trigger enemy buildings in either population; friendlies and busy or drowning walkers do not',()=>{
 for(const [owner,enemy]of [['red','blue'],['blue','red']]){
  const defender=resident(owner),attacker=actor(enemy,6.5,5.5);
  assert.equal(enemyBuildingContacts([attacker,defender],a=>a.point,()=>true)[0].defender,defender);
  assert.equal(enemyBuildingContacts([attacker,defender],a=>a.point,()=>false).length,0);
  attacker.population=owner;assert.equal(enemyBuildingContacts([attacker,defender],a=>a.point,()=>true).length,0);
  attacker.population=enemy;attacker.survival.phase='drowning';assert.equal(enemyBuildingContacts([attacker,defender],a=>a.point,()=>true).length,0);
 }
});
test('contact searches cross spatial bucket boundaries without re-sampling walker positions',()=>{
 const defender=resident('blue',5);defender.home.x=7;const attacker=actor('red',9.5,6.5);let samples=0;
 const contacts=enemyBuildingContacts([attacker,defender],a=>{samples++;return a.point;},()=>true);
 assert.equal(samples,1);assert.equal(contacts.length,1);assert.equal(contacts[0].defender,defender);
});
test('one building releases once, pairing with the nearest eligible attacker',()=>{
 const defender=resident(),far=actor('red',6.5,5.5),near=actor('red',6.4,5.5);
 const contacts=enemyBuildingContacts([far,near,defender],a=>a.point,()=>true);
 assert.equal(contacts.length,1);assert.equal(contacts[0].attacker,near);assert.equal(defender.characterPower,37.5);assert.ok(defender.home);
});
test('castle release preserves the resident and exact character power, removes reservations, and starts the requested duel',()=>{
 const defender=resident('blue',5),attacker=actor('red',7.5,5.5),home=defender.home,tiles=new Map();
 for(let z=2;z<=8;z++)for(let x=2;x<=8;x++){const t=x===5&&z===5?home:tile(x,z);t.reserved=true;t.castleGap=true;tiles.set(`${x},${z}`,t);}
 const contacts=enemyBuildingContacts([attacker,defender],a=>a.point,()=>true);assert.equal(contacts.length,1);
 evacuateSettlements([defender],(x,z)=>tiles.get(`${x},${z}`));defender.point=buildingDefenderPoint(home,attacker.point);
 assert.equal(defender.home,null);assert.equal(defender.power,0);assert.equal(defender.characterPower,37.5);assert.equal(home.house,false);
 assert.ok([...tiles.values()].every(t=>!t.reserved&&!t.castleGap));assert.ok(Math.abs(Math.hypot(defender.point.x-attacker.point.x,defender.point.z-attacker.point.z)-.75)<1e-10);
 const bystander=actor('blue',7.4,5.5),combat=new CombatSystem();assert.ok(combat.engage(attacker,defender));combat.match([attacker,bystander,defender],a=>a.point);
 assert.equal(combat.opponent(attacker),defender);combat.advance(1);assert.equal(attacker.characterPower,2.5);assert.equal(defender.characterPower,35.5);assert.equal(bystander.characterPower,10);
});
test('housed residents cannot be attacked by the old remote garrison combat path',()=>{
 const defender=resident(),attacker=actor('red',6.5,5.5);attacker.knight=true;
 const combat=new CombatSystem();combat.match([attacker,defender],a=>a.point);assert.equal(combat.pairs.length,0);assert.equal(combat.engage(attacker,defender),false);
});
