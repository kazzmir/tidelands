import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

test('pause overlay starts hidden and announces a prominent paused status',async()=>{
 const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
 assert.match(html,/<div id="pause-overlay"[^>]*role="status"[^>]*aria-live="polite"[^>]*hidden><strong>PAUSED<\/strong><\/div>/);
 const main=await readFile(new URL('../src/main.ts',import.meta.url),'utf8');
 assert.match(main,/element\('#pause-overlay'\).hidden = !paused/);
 assert.match(main,/button.setAttribute\('aria-pressed', String\(paused\)\)/);
});

test('pause overlay covers and dims the game without trapping resume controls',async()=>{
 const css=await readFile(new URL('../src/style.css',import.meta.url),'utf8');
 assert.match(css,/\.pause-overlay\{[^}]*inset:0;[^}]*background:rgba\(0,0,0,\.58\);[^}]*pointer-events:none/);
 assert.match(css,/\.pause-overlay\[hidden\]\{display:none\}/);
 assert.match(css,/\.pause-overlay strong\{[^}]*font-size:clamp\(48px,8vw,104px\)/);
 assert.match(css,/\.bottom-bar\{z-index:5\}/);
});
