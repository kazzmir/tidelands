# Tidelands

A small, Populous-inspired isometric sandbox built with **Three.js 0.186.1**, **strict TypeScript 7.0.2**, and **Vite 8.3.4**. All scenery is generated in code; no game assets are required. The optional Google Fonts stylesheet falls back to system fonts offline.

## Run

```sh
npm install
npm run dev
```

Open the local URL printed by Vite. Requires Node.js 22.12+ (or 20.19+).

```sh
npm test         # Run simulation and architecture tests
npm run build    # Type-check and produce dist/
npm run preview # Serve the production build
```

Tests use Vite's Oxc transformer and parser rather than the legacy TypeScript compiler API removed in TypeScript 7. Type-checking uses the pinned TypeScript 7.0.2 compiler.

## World size and rendering

Worlds contain **1,000 × 1,000 tiles**, initially at sea level. The generator chooses high points (levels **6–8**) in nine seeded clusters, then raises surrounding points only as needed to satisfy the same **one-level neighboring-height invariant** used by editing. Nearby summit foothills naturally overlap into continuous, multi-mountain landmasses, roughly **30–100 tiles across**. There are **no artificial bridges, island masks, or separately sculpted coastlines**: every raised point is required by a summit’s height constraint. Separated clusters retain water between them. Settlers start near the camera on dry ground.

Only a padded camera region is converted into render geometry; that region streams as the camera pans, rotates, or zooms. Tile objects are created lazily and retain their building, farming, and tree state when revisited. Trees are drawn in instanced batches, and settlement updates touch home neighborhoods rather than scanning the million-tile map. Height edits remain global, including cascades beyond the current view. Water, wave detail, lighting, and shadows cover/follow the expanded world.

## Controls

- **Left-click:** raise the nearest grid corner one level, regardless of the selected tool.
- **Right-click:** lower the nearest grid corner one level. Level 0 is water.
- A red point with a softly fading halo highlights the selected corner. Its height is shared by up to four neighboring tiles. Surrounding points automatically adjust as needed so neighboring heights never differ by more than one level, including diagonally.
- **Hold Shift:** select and highlight the whole surface instead of a point. **Shift+left-click** raises all four corners; **Shift+right-click** lowers all four. The tile keeps its shape, and neighboring tiles follow the shared points. If any corner would exceed heights 0–14, the entire edit is rejected.
- **1 / Raise, 2 / Lower:** select the action for touch taps; mouse clicks always use the button mapping above.
- **3 / Inspect:** hover to see elevation, terrain, and inhabitants; touch taps inspect without editing.
- **Arrow keys / drag:** pan; **hold middle button and drag:** orbit; **scroll:** zoom. Hold arrows for continuous, camera-relative movement, including while paused.
- **Touch:** drag to pan; use two fingers to zoom/orbit.
- **Space:** pause/resume; **1× / 2× / 4×:** simulation speed.
- **Reset camera icon:** return to the original isometric view.
- **New world:** generate a fresh island and population.

Settlers choose neighboring dry tiles, climb one elevation step at a time, and avoid trees and cottages. After walking onto an unoccupied, treeless tile with four equal, above-water corner heights, they build a house and live inside it, disappearing from the map. Each house belongs to one settler; total population includes both roaming and housed settlers. Making a home’s ground non-flat (including through a cascaded edit) removes it and returns its resident to walking. Moving all four corners together preserves the home if it remains dry. Flooding a home also releases its resident. Settlers whose ground disappears stay in place and wave their arms for **2 simulation seconds** while drowning. Raising land under their actual position before that deadline rescues them and restores normal walking. Otherwise they die, leave the population count, and sink below the water over 0.8 seconds. They cannot be revived after death. Pause freezes the timer; speed controls accelerate it. Hover the population count to see roaming, housed, drowning, and castle counts; Inspect identifies occupied homes and drowning settlers. This is a terrain and settlement sandbox, not yet a full civilization simulation. Worlds are not persisted between reloads.

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

House size reflects its power. Inspect a house to see its exact power and support count. At power 5, a castle occupies all nine tiles, clears vegetation there, and releases residents of other homes within its footprint or its two-tile surrounding buffer. Houses must leave **at least two clear tiles** between themselves and the castle footprint, including diagonally. Walkers can cross this buffer, but cannot settle there. Roaming settlers cannot enter or build in the castle footprint itself. Existing castles have priority; another home cannot expand a castle footprint into an existing footprint or its required buffer. Downgrading or removing a castle frees its buffer for new houses.

Changing an outer tile recomputes support immediately, downgrading the castle to a house and freeing its footprint when support drops below nine. Making its center non-flat, submerged, or changing the center’s height releases the castle resident instead. Restoring nine connected flat tiles can upgrade a surviving house again. These building transitions preserve residents, though anyone released into water can subsequently drown.

### Fertile land

Flat tiles at a home’s height receive a transparent black-grid farming texture. Ordinary houses influence a centered **3×3 area** (one tile in each direction); castles influence a centered **7×7 area** (three tiles in each direction, including diagonals). Downgrading a castle shrinks its farming influence back to the house range. Castle power still depends only on the central nine tiles. Cultivated tiles have their trees permanently removed. The overlay preserves the terrain’s elevation colors, updates after edits and building changes, and disappears when no home influences the tile. Overlapping influence areas share one overlay per tile. Castle courtyards show the same pattern over their foundations. Fertility applies to all qualifying flat tiles in range; house power still requires edge-connected support.

## Sheep

Sheep do not appear immediately when farmland is created. While grazing space is available, there is a **50% chance to spawn one sheep every 10 simulation seconds**, globally, with no catch-up bursts. Sheep then wander between edge-adjacent farm tiles. New worlds and periods without available grazing space reset the spawn wait. The flock never exceeds **two sheep per occupied building**; a castle counts as one building, not nine. Sheep avoid building footprints and do not enter non-farmed land or water. A sheep disappears when the ground under its actual position ceases to be farmland, and losing buildings trims the flock to the new cap. Sheep do not count toward settler population. Inspect farm tiles to see grazing sheep, or hover Population for the total flock size. Pause and speed controls also apply to sheep.

## Character power and births

Every starting settler has **10 character power**, separate from the player’s spendable Power and a building’s terrain-derived level. Character power stays with the settler when they build a home, leave it, or are displaced by a castle.

On ordinary ground, housed residents accumulate character power at a rate tuned to these nominal birth intervals:

| Building level | Simulation seconds per birth |
| --- | --- |
| 1 | 120 |
| 2 | 97.5 |
| 3 | 75 |
| 4 | 52.5 |
| 5 (castle) | 30 |

When a resident exceeds **20 character power**, their power is divided equally: one half stays in the building, and the other becomes a new walking settler. Growth is `10 / birth interval` power per simulation second, so castles accumulate four times as fast as level-1 houses. Intervals assume a resident starts at 10 power (as after a typical split); inherited or retained power can shorten the first interval. New settlers carry their inherited power into any home they later build.

Newborns appear on the nearest reachable dry, unobstructed walking tile outside the building/castle. If no safe tile is available, the resident retains their power and the birth waits. Pause stops growth, and speed controls accelerate it. Inspect shows character power, resident growth, and the birth threshold.

## Accumulated power

The upper-right HUD shows total population and accumulated **Power**. Each world starts with **10,000 power**. Every **5 simulation seconds**, power increases by the sum of occupied ordinary-ground building power levels (houses 1–4, castles 5). Rock-ground buildings pay their full level only every **10 simulation seconds**. For example, two power-2 houses and a castle on ordinary ground produce 9 power per collection. Roaming settlers produce none. Pausing stops collection; 2×/4× speed accelerates it. Existing power is retained if a building is lost; creating a new world resets the balance to 10,000 and resets the collection timer. Hover the Power number to see the current income rate.

### Terraforming costs

Raising or lowering costs **1 power per height level changed per point**. Every point adjusted by the neighboring-height cascade counts, and Shift edits charge for all four selected points plus propagated changes. The complete edit is previewed first: if the available balance cannot cover it, **no power is spent and no terrain, homes, farms, or trees change**. Attempts beyond the height limits cost nothing.

## Spells

The right-hand spell palette lists icons from lowest to highest power cost: Earthquake, Knight, Swamp, Volcano, Flood, with hover/focus tooltips. Affordable spell names are light; unaffordable names and icons are dimmed. For **Earthquake, Volcano, and Swamp**, click an icon to select the spell, then **left-click a highlighted tile** to cast at that location. Selection spends no power. **Knight and Flood cast immediately when their icons are clicked**, without selecting a map tile. Press **Escape**, right-click, click the selected spell again, or choose a terrain tool to cancel. Spells use a fixed power cost (no additional per-point terraforming cost), and only spend power when they have a valid effect.

- **Earthquake — 500 power:** reshapes points within roughly six tiles of the selected tile: each point has a **10% chance to rise** by one or two levels and a **90% chance to lower**, potentially all the way to water (height 0). Subsidence is applied after uplift so most affected land sinks. Neighboring heights still differ by at most one. The entire interface shakes for one real-time second (suppressed for reduced-motion preferences).
- **Knight — 1,000 power:** permanently converts the current living, outdoor leader into a knight, multiplying their current character power/HP by **1.5** once. Housed, drowning, missing, or already-knighted leaders cannot be converted; rejected casts spend nothing. Knights render at **twice a normal character's scale**, clad head-to-toe in reflective **silver plate armor**: a closed helmet, gorget, cuirass, hip plates, shoulder plates, arm guards, gauntlets, greaves, knee guards, and boots. Armor follows the animated limbs and fully covers the original clothes and skin. They retain their sword, population-colored shield, and white leader pole. This visual size increase does not change the existing 1.5× HP/power bonus. They remain outside, do not build houses, and seek living enemy characters along reachable land routes when enemies exist; with no enemies they wander. Melee exchanges simultaneous damage and retaliation based on remaining character power, with minimum damage of 1.5 HP/s for knights versus 1 HP/s for normal characters so even equal-strength fights finish. Housed enemies can be engaged from outside their buildings. No enemy population is spawned yet. There is no reversal spell. Death drops only the leader pole: a successor who picks it up remains a normal character unless separately converted.
- **Volcano — 2,000 power:** raises up to three spaced-out points around the selected tile to maximum height **14** (six levels above the old cap), prioritizing a corner of that tile. All land touched by the full height cascade becomes distinctly gray **volcanic rock**, replacing any swamp there. No power is spent if no eligible nearby points remain.
- **Flood — 3,000 power:** lowers **every point in the entire world** by one height level, clamped at 0—equivalent to raising the sea level by one. Clicking its icon casts immediately; the effect is global, including offscreen land. Repeated casts can submerge all land; a cast on an already all-water world costs nothing. Flood can destroy homes, remove farming/sheep, and strand settlers who then begin drowning.

- **Swamp — 1,500 power:** each dry surface within a **10-tile Euclidean radius** of the targeted tile has a **75% chance** of becoming swamp. Animated, mottled green mold covers both flat and sloping swamp ground. Swamp is excluded from building support and farmland: a home on swamp releases its resident, and any swamp in a castle’s central nine tiles downgrades it (or releases the owner when the center is swamped). Submerging a swamp tile destroys it permanently; raising that ground later does not restore swamp.

Walking onto swamp or standing on newly swamped ground causes **persistent sickness**. Character power is HP; sick settlers take **1 HP of damage per simulation second**, including after leaving the marsh or moving into a healthy house. Their heads turn green, and Inspect/Population show sickness. There is no automatic cure. At 0 HP they die and leave the population; an occupied building is removed if its resident dies. Pausing stops damage, and speed controls accelerate it. Newborns do not inherit sickness.

All spells update homes, castles, farming, trees, and settler positions just like ordinary terrain edits. Spells can be cast while the simulation is paused.

## Population colors

All members of the current population wear the same **red shirt**, including leaders and newborns. **Blue** is the reserved shirt color for a future enemy population; no enemies are spawned yet. Shirt color is independent of character count, sickness, and leadership. Every house (levels 1–4) and castle always displays a flag in its population's matching red/blue color; flags and shirts share the same palette.

## Leader and gathering

Each new population starts with exactly **one leader**, marked by a large white object on a staff. While walking, the leader carries the object; when housed, the object marks the roof. In normal wandering mode a non-knight leader can build and produce children like other residents, so gathering down to one character does not prevent the population from regrowing. Inspect its tile or hover the Gather button to see its character power/HP.

**Gather followers** is a free toggle. When enabled, residents—including a housed leader—leave their homes (retaining their character power). Followers stop building and use reachable dry routes toward the leader. On entering the leader's tile, a follower disappears and transfers **all remaining character power/HP** to the leader. This reduces the population by one, does not award player currency, and does not cap the leader at the normal birth threshold while gathering. Once gathering is disabled, a non-knight leader can settle again and normal birth/power-splitting rules resume. Vacated houses, castle reservations, farmland, and their sheep are removed. Clicking **Stop gathering** returns the remaining followers to wandering and building new homes.

When the leader dies, the white object stays on the **actual tile of death**, including water, and remains after the corpse disappears. There is no automatic remote replacement: the next living walker to reach that tile picks up the object and becomes the sole new leader. A submerged object remains visible above the water and can be recovered after the ground is restored. Gathering remains enabled if already active, so followers target the dropped object until it is picked up; unreachable followers wait rather than walking into water. New world resets the role and gathering state.

## Volcanic rock

Rock has a gray/basalt palette distinct from ordinary terrain, with matching contour colors. Flat, dry rock remains buildable and can be farmed. A building anchored on rock produces player power every **10 simulation seconds instead of 5**, and its resident gains character power at **half speed**, doubling all birth cycles (level 1: 240 seconds; castle: 60 seconds). Inspect shows the adjusted growth rate and birth interval, and the Power tooltip separates regular and rock income.

Rock persists through dry terrain edits. Lowering it into water destroys the rock substrate permanently; raising the ground later produces ordinary land. Trees retain the existing preservation rules unless farming or a castle clears them.

## Structure

- `src/main.ts` — a single `startGame()` entry point owns game state; named functions create the scene/icons/water, bind terrain/spell/tool/simulation/keyboard input, and start rendering. Terrain, scenery, simulation, and interactions run inside functions rather than module-level initialization.
- `src/terrain-surface.ts` — shared-corner triangle mesh, bounded camera-region geometry, and matching surface-height sampling.
- `src/world-generation.ts` — high-point seeding and clustered terrain growth using the shared height-invariant propagation.
- `tests/world-generation.test.mjs` — world dimensions, clustered-land connectivity, exact peak-derived heights (no artificial connectors), full-map slope limits, reproducibility, and bounded rendering.
- `src/terrain-contours.ts` — elevation contour segments where sloping triangles intersect integer height planes.
- `tests/terrain-contours.test.mjs` — contour placement, flat surfaces, shared edges, and height scaling tests.
- `src/spells.ts` — Earthquake, Volcano, global Flood, targeted Swamp, and fixed power costs.
- `src/sickness.ts` — persistent swamp infection and character-power health damage.
- `tests/swamp.test.mjs` — conversion radius/chance, sickness/death, building displacement, castle downgrade, and permanent water cleansing.
- `tests/spells.test.mjs` — spell costs, effects, maximum peaks, slope limits, and valid targets.
- `src/sheep.ts` — timed probabilistic spawning, bounded flock planning, and farmland-only grazing routes.
- `tests/sheep.test.mjs` — two-per-building caps, lost farmland, blocked footprints, spawn space, and grazing paths.
- `src/survival.ts` — drowning, rescue, death, and sinking lifecycle.
- `tests/survival.test.mjs` — two-second rescue window, pause, irreversible death, and sinking timing.
- `src/population.ts` — resident character-power growth, equal-power births, and safe-spawn deferral.
- `tests/population.test.mjs` — growth scaling, splits, inheritance, pause/speed, and blocked births.
- `src/knight-armor.ts` — double-scale silver armor attached to animated body parts.
- `tests/knight-armor.test.mjs` — scale, full armor coverage, material, animation attachment, and cleanup ownership.
- `src/knights.ts` — permanent leader conversion, enemy selection, and simultaneous melee combat.
- `tests/knights.test.mjs` — spell validation/payment, multiplier, targeting, combat, and normal pole succession.
- `src/leadership.ts` — unique leader/object ownership, additive absorption, and shared rally routing.
- `tests/leadership.test.mjs` — succession, water drops, HP transfer, cancellation, pathfinding, and home evacuation.
- `src/rock.ts` — volcano substrate conversion and permanent water cleansing.
- `tests/rock.test.mjs` — cascade-wide conversion, flat-rock building, slower income/births, and cleansing.
- `src/power.ts` — periodic simulation-time power collection, including the slower rock-building timer.
- `tests/power.test.mjs` — building income, timing, speed, pause, and reset tests.
- `src/settlement.ts` — flat-ground house placement, connected-land power, castle footprints, ownership, and resident release.
- `tests/settlement.test.mjs` — settlement, occupancy, flooding, and terrain-driven release tests.
- `tests/castles.test.mjs` — power thresholds, connectivity, castle promotion/demotion, displaced residents, and overlapping footprints.
- `tests/terrain-surface.test.mjs` — slope continuity, mesh winding, height sampling, and edit tests.
- `src/style.css` — responsive game HUD.
- `index.html` — accessible interface and canvas shell.

Terrain stores integer heights (0–14) directly at the shared grid corners. Each tile consists of two triangles using only its four corners, without an independent center height. Equal-height corners make a perfectly flat tile; four coplanar corners make a single flat plane, including inclined planes. Editing a corner propagates outward: raising it lifts neighbors that are too low; lowering it lowers neighbors that are too high. Each point stays within one height level of all eight surrounding points. Generated terrain follows the same rule, and scenery and settlers update across the entire affected area. Vertex colors follow each corner’s height, blending golden shores through bright grass and deep greens into rocky, pale summits; shared corners use identical colors to avoid seams. Subtle contour lines, tinted slightly darker than the terrain color at each height, mark whole elevation levels on sloping land (for example, height 2 between heights 1 and 3), updating after every terrain edit without adding a grid across flat surfaces. Settlers sample this exact surface as they walk, while cottages have foundations and paths follow the slopes. A seeded generator creates the islands and decorations. An orthographic camera supplies the isometric view; surface raycasting maps pointer input back to grid cells, including underwater cells.
