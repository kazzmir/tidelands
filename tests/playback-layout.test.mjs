import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

test('bottom playback panel is content-sized and anchored on the right',async()=>{
 const css=await readFile(new URL('../src/style.css',import.meta.url),'utf8');
 assert.match(css,/\.bottom-bar\{[^}]*left:auto;right:27px;width:max-content;max-width:calc\(100% - 54px\)/);
 assert.match(css,/\.bottom-bar\{left:auto;right:12px;[^}]*flex-direction:column/);
 const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
 for(const id of ['pause','enemy-view','reset-view','tool-hint'])assert.ok(html.includes(`id="${id}"`));
 for(const speed of [1,2,4])assert.ok(html.includes(`data-speed="${speed}"`));
});
