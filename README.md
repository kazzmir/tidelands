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

- **1 / Raise:** click to raise a tile one level.
- **2 / Lower:** click to lower a tile. Level 0 is water.
- **3 / Inspect:** hover to see elevation, terrain, and inhabitants.
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

Terrain uses integer center heights with a fixed world-space step. Shared corners average neighboring elevations; four triangles connect each tile center to those corners, producing continuous diagonal hills instead of vertical steps. Settlers sample this exact surface as they walk, while cottages have foundations and paths follow the slopes. A seeded generator creates the islands and decorations. An orthographic camera supplies the isometric view; surface raycasting maps pointer input back to grid cells, including underwater cells.
