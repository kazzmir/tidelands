import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
test('new-world options are labelled native radio icon cards, not dropdowns',async()=>{
 const html=await readFile(new URL('../index.html',import.meta.url),'utf8'),form=html.match(/<form id="new-game-form">[\s\S]*?<\/form>/)?.[0];assert.ok(form);assert.doesNotMatch(form,/<select\b/);
 for(const [id,name,values,checked]of [['menu-game-mode','gameMode',['play','watch'],'play'],['menu-ai-difficulty','difficulty',['easy','normal','hard'],'normal'],['menu-world-size','worldSize',['small','medium','large'],'large']]){const fieldset=form.match(new RegExp(`<fieldset id="${id}"[\\s\\S]*?<\\/fieldset>`))?.[0];assert.ok(fieldset);assert.match(fieldset,/<legend>[^<]+<\/legend>/);assert.equal((fieldset.match(/data-icon=/g)||[]).length,values.length);assert.equal((fieldset.match(/ checked/g)||[]).length,1);for(const value of values)assert.match(fieldset,new RegExp(`<input type="radio" name="${name}" value="${value}"`));assert.match(fieldset,new RegExp(`value="${checked}" checked`));assert.match(fieldset,/ required/);}
});
test('icon cards preserve menu defaults, selected settings and keyboard focus styling',async()=>{
 const main=await readFile(new URL('../src/main.ts',import.meta.url),'utf8'),css=await readFile(new URL('../src/style.css',import.meta.url),'utf8');assert.match(main,/function menuChoice\(group: string\)/);assert.match(main,/input:checked/);assert.match(main,/setMenuChoice\('#menu-world-size', worldSize\)/);assert.match(main,/menuChoice\('#menu-ai-difficulty'\)/);assert.match(css,/:has\(input:checked\)/);assert.match(css,/:has\(input:focus-visible\)/);
});
