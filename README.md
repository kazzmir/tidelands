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
- A red point with a softly fading halo highlights the selected corner. Its height is shared by up to four neighboring tiles. Surrounding points automatically adjust as needed so neighboring heights never differ by more than one level, including diagonally.
- **Hold Shift:** select and highlight the whole surface instead of a point. **Shift+left-click** raises all four corners; **Shift+right-click** lowers all four. The tile keeps its shape, and neighboring tiles follow the shared points. If any corner would exceed heights 0–8, the entire edit is rejected.
- **1 / Raise, 2 / Lower:** select the action for touch taps; mouse clicks always use the button mapping above.
- **3 / Inspect:** hover to see elevation, terrain, and inhabitants; touch taps inspect without editing.
- **Arrow keys / drag:** pan; **right-drag:** orbit; **scroll:** zoom. Hold arrows for continuous, camera-relative movement, including while paused.
- **Touch:** drag to pan; use two fingers to zoom/orbit.
- **Space:** pause/resume; **1× / 2× / 4×:** simulation speed.
- **Reset camera icon:** return to the original isometric view.
- **New world:** generate a fresh island and population.

Settlers choose neighboring dry tiles, climb one elevation step at a time, and avoid trees and cottages. After walking onto an unoccupied, treeless tile with four equal, above-water corner heights, they build a house and live inside it, disappearing from the map. Each house belongs to one settler; total population includes both roaming and housed settlers. Making a home’s ground non-flat (including through a cascaded edit) removes it and returns its resident to walking. Moving all four corners together preserves the home if it remains dry. Flooding a home also releases its resident; anyone stranded underwater relocates to the nearest dry ground. Hover the population count to see roaming/housed counts and the castle count; Inspect identifies occupied homes. This is a terrain and settlement sandbox, not yet a full civilization simulation. Worlds are not persisted between reloads.

Trees retain their species, size, rotation, and horizontal position through terrain edits. Submerged trees disappear but their locations are remembered, allowing them to return when raised above water. Farming permanently clears trees from cultivated tiles, and castle construction clears all nine footprint tiles.

## House power and castles

A home counts flat, same-height surfaces connected by tile edges within the **centered 3×3 neighborhood** (nine tiles total, including its own tile). Disconnected tiles and land outside that neighborhood do not count.

| Connected tiles | Power |
| --- | --- |
| 1 | 1 |
| 2–4 | 2 |
| 5–7 | 3 |
| 8 | 4 |
| 9 | 5 — castle |

House size reflects its power. Inspect a house to see its exact power and support count. At power 5, a castle occupies all nine tiles, clears vegetation there, and releases residents of other homes within its footprint. Roaming settlers cannot enter or build in a castle’s footprint. Existing castles have priority where footprints overlap; another home cannot expand into the same area.

Changing an outer tile recomputes support immediately, downgrading the castle to a house and freeing its footprint when support drops below nine. Making its center non-flat, submerged, or changing the center’s height releases the castle resident instead. Restoring nine connected flat tiles can upgrade a surviving house again. Total population is preserved throughout.

### Fertile land

Flat tiles at a home’s height within its centered 3×3 influence area receive a transparent black-grid farming texture. Cultivated tiles have their trees permanently removed. The overlay preserves the terrain’s elevation colors, updates after edits and building changes, and disappears when no home influences the tile. Overlapping influence areas share one overlay per tile. Castle courtyards show the same pattern over their foundations. Fertility applies to all qualifying flat tiles in range; house power still requires edge-connected support.

## Accumulated power

The upper-right HUD shows total population and accumulated **Power**. Each world starts with **500 power**. Every **5 simulation seconds**, power increases by the sum of all occupied building power levels (houses 1–4, castles 5). For example, two power-2 houses and a castle produce 9 power per collection. Roaming settlers produce none. Pausing stops collection; 2×/4× speed accelerates it. Existing power is retained if a building is lost; creating a new world resets the balance to 500 and resets the collection timer. Hover the Power number to see the current income rate.

### Terraforming costs

Raising or lowering costs **1 power per height level changed per point**. Every point adjusted by the neighboring-height cascade counts, and Shift edits charge for all four selected points plus propagated changes. The complete edit is previewed first: if the available balance cannot cover it, **no power is spent and no terrain, homes, farms, or trees change**. Attempts beyond the height limits cost nothing.

## Structure

- `src/main.ts` — procedural terrain, scenery, settler simulation, camera, and interaction.
- `src/terrain-surface.ts` — shared-corner triangle mesh and matching surface-height sampling.
- `src/terrain-contours.ts` — black contour segments where sloping triangles intersect integer elevation planes.
- `tests/terrain-contours.test.mjs` — contour placement, flat surfaces, shared edges, and height scaling tests.
- `src/power.ts` — periodic simulation-time power collection.
- `tests/power.test.mjs` — building income, timing, speed, pause, and reset tests.
- `src/settlement.ts` — flat-ground house placement, connected-land power, castle footprints, ownership, and resident release.
- `tests/settlement.test.mjs` — settlement, occupancy, flooding, and terrain-driven release tests.
- `tests/castles.test.mjs` — power thresholds, connectivity, castle promotion/demotion, displaced residents, and overlapping footprints.
- `tests/terrain-surface.test.mjs` — slope continuity, mesh winding, height sampling, and edit tests.
- `src/style.css` — responsive game HUD.
- `index.html` — accessible interface and canvas shell.

Terrain stores integer heights (0–8) directly at the shared grid corners. Each tile consists of two triangles using only its four corners, without an independent center height. Equal-height corners make a perfectly flat tile; four coplanar corners make a single flat plane, including inclined planes. Editing a corner propagates outward: raising it lifts neighbors that are too low; lowering it lowers neighbors that are too high. Each point stays within one height level of all eight surrounding points. Generated terrain follows the same rule, and scenery and settlers update across the entire affected area. Vertex colors follow each corner’s height, blending golden shores through bright grass and deep greens into rocky, pale summits; shared corners use identical colors to avoid seams. Black contour lines mark whole elevation levels on sloping land (for example, height 2 between heights 1 and 3), updating after every terrain edit without adding a grid across flat surfaces. Settlers sample this exact surface as they walk, while cottages have foundations and paths follow the slopes. A seeded generator creates the islands and decorations. An orthographic camera supplies the isometric view; surface raycasting maps pointer input back to grid cells, including underwater cells.
