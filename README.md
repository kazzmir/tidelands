# Tidelands

A small, Populous-inspired isometric sandbox built with **Three.js**, **strict TypeScript**, and **Vite 8.3.4**. All scenery is generated in code; no game assets are required. The optional Google Fonts stylesheet falls back to system fonts offline.

## Run

```sh
npm install
npm run dev
```

Open the local URL printed by Vite. Requires Node.js 22.12+ (or 20.19+).

```sh
npm test         # Check slope continuity and terrain sampling
npm run build    # Type-check and produce dist/
npm run preview # Serve the production build
```

## Controls

- **Left-click:** raise the nearest grid corner one level, regardless of the selected tool.
- **Right-click:** lower the nearest grid corner one level. Level 0 is water.
- A red point with a softly fading halo highlights the selected corner. Its height is shared by up to four neighboring tiles; only that point changes per click.
- **Hold Shift:** select and highlight the whole surface instead of a point. **Shift+left-click** raises all four corners; **Shift+right-click** lowers all four. The tile keeps its shape, and neighboring tiles follow the shared points. If any corner would exceed heights 0–8, the entire edit is rejected.
- **1 / Raise, 2 / Lower:** select the action for touch taps; mouse clicks always use the button mapping above.
- **3 / Inspect:** hover to see elevation, terrain, and inhabitants; touch taps inspect without editing.
- **Drag:** pan; **right-drag:** orbit; **scroll:** zoom.
- **Touch:** drag to pan; use two fingers to zoom/orbit.
- **Space:** pause/resume; **1× / 2× / 4×:** simulation speed.
- **Reset camera icon:** return to the original isometric view.
- **New world:** generate a fresh island and population.

Settlers choose neighboring dry tiles, climb one elevation step at a time, and avoid trees and cottages. They can explore newly connected land. Lowering an occupied tile into the sea relocates its inhabitant to the nearest dry ground. Day progression is cosmetic; this is a terrain/walking prototype, not yet a full civilization simulation. Worlds are not persisted between reloads.

## Structure

- `src/main.ts` — procedural terrain, scenery, settler simulation, camera, and interaction.
- `src/terrain-surface.ts` — shared-corner triangle mesh and matching surface-height sampling.
- `tests/terrain-surface.test.mjs` — slope continuity, mesh winding, height sampling, and edit tests.
- `src/style.css` — responsive game HUD.
- `index.html` — accessible interface and canvas shell.

Terrain stores integer heights (0–8) directly at the shared grid corners. Each tile consists of two triangles using only its four corners, without an independent center height. Equal-height corners make a perfectly flat tile; four coplanar corners make a single flat plane, including inclined planes. Editing one corner updates all adjoining tiles without changing the other corner heights. Settlers sample this exact surface as they walk, while cottages have foundations and paths follow the slopes. A seeded generator creates the islands and decorations. An orthographic camera supplies the isometric view; surface raycasting maps pointer input back to grid cells, including underwater cells.
