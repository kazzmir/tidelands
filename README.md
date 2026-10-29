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

## Start a game

The page opens with a **New game** menu. Choose **Easy / Normal / Hard AI** and **Small (200×200)**, **Medium (350×350)**, or **Large (500×500)**, then press **Start new game**. A live **red AI vs blue AI** match plays behind the menu; your own world is not generated until you confirm. Both populations start with **24 settlers and 500 power**.

The background preview uses the real simulation/AI controllers and the **same house, castle, character, and knight models as normal play**. It runs independently at up to 6× simulation speed, and restarts after **two minutes of visible, unpaused preview time** (not two accelerated game-minutes). An early elimination waits until that deadline before restarting. **Pause preview / Play preview** controls it; reduced-motion preferences start it paused. Starting your game stops and disposes the preview, without carrying over its population, terrain, power, or RNG.

**New world** reopens the menu with the current settings. While it is open, the existing game is frozen; Cancel/Escape returns to it without losing progress or changing its pause state. Confirming starts a fresh, unpaused world at 1× speed. Terrain storage, streaming, navigation, starts, and minimap use the selected dimensions.

## AI difficulty and simulation tournaments

Choose **Easy / Normal / Hard** in the startup menu. The header difficulty control also opens that menu to confirm a new game; it does not discard the current world until Start is pressed. These are different decision policies, **not** HP, currency, damage, or income cheats.

```sh
npm run ai:tournament # 1,000 seeded, side-swapped AI-vs-AI games; Node 22+
npm run ai:tournament -- --games 5000 --workers 4 --out reports/long.json.gz
npm run ai:replay -- --replay reports/ai-tournament.json --match 42
```

The headless simulator reuses production terrain/economy/population/combat/spell/knight modules. Five candidate policies compete across multiple map scenarios, with held-out seeds, seed-cluster uncertainty estimates, JSON/CSV/Markdown reports, exact replay, and crash/Ctrl+C checkpoints. The optional, paid Armageddon referee finale finishes otherwise open-ended sandbox matches; unresolved time limits remain draws. It does **not** enable automatic Armageddon in the live enemy.

Completed calibration: **1,000 baseline games**, **100 half-step games**, and **four actual 500×500-world checks**. Easy uses **Patient**, Normal retains **Balanced**, and Hard uses **Sorcerer** (80% held-out score in the **historical 10,000-power** baseline's paid-finale protocol; this is not a revalidated result for the current 500-power start). Raw replayable reports and limitations are in **[benchmark results](benchmarks/README.md)**.

See **[AI simulation guide](docs/ai-simulation.md)** for setup, policy tuning, larger/full-world batches, natural-only matches, step-resolution checks, resume/replay, and interpretation limits.

## World size and rendering

Worlds contain **200×200, 350×350, or 500×500 tiles**, according to the menu selection. The island counts and coordinates in the following description refer to **Large** worlds. Large worlds contain **500 × 500 tiles**, initially at sea level. The generator chooses high points (levels **6–8**) in **roughly 20–26 irregularly scattered islands across the full map**, then raises surrounding points only as needed to satisfy the same **one-level neighboring-height invariant** used by editing. Nearby summit foothills naturally overlap into continuous, multi-mountain landmasses: small islets roughly **10–35 tiles across**, medium islands, and larger islands reaching **60–95 tiles across**. There are **no artificial bridges, island masks, or separately sculpted coastlines**: every raised point is required by a summit’s height constraint. Separated clusters retain water between them. The archipelago includes northern, southern, eastern, central, and corner islands—not just the player's western starting area. There are **no rows, columns, or fixed island grid**. Seeded rejection sampling scatters variable-radius islands with ocean gaps, varied proportions, uneven branching ridges, and different summit counts. Broad regions retain islands while allowing irregular open-water areas. The human-controlled red population starts on a dedicated island near the **far western edge**, around tile **(48, 250)** rather than the map center. Both population starts reserve **large, broad islands** (at least 1,800 dry corner points and 50 tiles in both directions), with enough margin for their full foothills. Other islands may be much smaller. Settlers spawn on dry, walkable tiles within 14 tiles of that anchor. The initial camera, **Reset View**, and each **New world** focus on this western start. A separate **blue enemy population** starts on the opposite **southeastern corner island**, around **(452, 452)**—about 452 tiles from the human start, the farthest inset corner while leaving room for the full island.

Only a padded camera region is converted into render geometry; that region streams as the camera pans, rotates, or zooms. Tile objects are created lazily and retain their building, farming, and tree state when revisited. Trees are drawn in instanced batches, and settlement updates touch home neighborhoods rather than scanning the million-tile map. Height edits remain global, including cascades beyond the current view. Water, wave detail, lighting, and shadows cover/follow the expanded world.

## Controls

Gathering, playback, speed, and camera controls sit in a compact, right-aligned bottom panel, stacking on mobile rather than spanning the full game width.

- **Left-click:** raise the nearest grid corner one level, regardless of the selected tool.
- **Right-click:** lower the nearest grid corner one level. Level 0 is water.
- A red point with a softly fading halo highlights the selected corner. Its height is shared by up to four neighboring tiles. Surrounding points automatically adjust as needed so neighboring heights never differ by more than one level, including diagonally.
- **Terrain reach:** manual raising/lowering requires the selected corner (or Shift-selected tile center) to be within **10 tiles** horizontally of a living human character. Occupied-home residents and drowning characters count; enemies, dead characters, and an unattended pole do not. Out-of-range edits show a blocked cursor/message and spend no power. Full paid slope cascades can still extend beyond the selected point's range. Spells retain their existing targeting rules.
- **Hold Shift:** select and highlight the whole surface instead of a point. **Shift+left-click** raises all four corners; **Shift+right-click** lowers all four. The tile keeps its shape, and neighboring tiles follow the shared points. If any corner would exceed heights 0–14, the entire edit is rejected.
- **1 / 2:** select the action for touch taps; mouse clicks always use the button mapping above.
- **3 (Inspect):** hover to see elevation, terrain, and inhabitants; touch taps inspect without editing.
- **Arrow keys / drag:** pan; **hold middle button and drag:** orbit; **scroll:** zoom. Hold arrows for continuous, camera-relative movement, including while paused. Panning stays parallel to the ground, and the camera center cannot pass the selected map's edges (the viewport can still show ocean beyond them).
- **Touch:** drag to pan; use two fingers to zoom/orbit.
- **L / leader-pole button:** jump to your pole's current position, including when housed or dropped in water, without changing zoom/orbit.
- **E / minimap:** view the enemy island; **Home / Reset View:** return to the human starting island.
- **Space / pause button:** pause/resume. Pausing dims the game area behind large centered **PAUSED** text; playback controls remain visible and usable. Camera movement, terrain editing, and spell casting still work while paused.
- **1× / 2× / 4×:** simulation speed.
- **Reset camera icon:** return to the original isometric view.
- **New world:** open the AI/world-size setup menu; confirm to generate a fresh archipelago and population, or cancel to keep playing.

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

The upper-right HUD shows total population and accumulated **Power**. Each population starts with **500 power**. Every **5 simulation seconds**, power increases by the sum of occupied ordinary-ground building power levels (houses 1–4, castles 5). Rock-ground buildings pay their full level only every **10 simulation seconds**. For example, two power-2 houses and a castle on ordinary ground produce 9 power per collection. Roaming settlers produce none. Pausing stops collection; 2×/4× speed accelerates it. Existing power is retained if a building is lost; creating a new world resets each side's balance to 500 and resets the collection timer. Hover the Power number to see the current income rate.

### Terraforming costs

Raising or lowering costs **1 power per height level changed per point**. Every point adjusted by the neighboring-height cascade counts, and Shift edits charge for all four selected points plus propagated changes. The complete edit is previewed first: if the available balance cannot cover it, **no power is spent and no terrain, homes, farms, or trees change**. Attempts beyond the height limits cost nothing.

## Spells

The right-hand spell palette lists icons from lowest to highest power cost: Move leader pole, Earthquake, Knight, Swamp, Volcano, Flood, Armageddon, with hover/focus tooltips. Affordable spell names are light; unaffordable names and icons are dimmed. For **Move leader pole, Earthquake, Volcano, and Swamp**, click an icon to select the spell, then **left-click a highlighted tile** to cast at that location. Selection spends no power. **Knight, Flood, and Armageddon cast immediately when their icons are clicked**, without selecting a map tile. Press **Escape**, right-click, click the selected spell again, or choose a terrain tool to cancel. Spells use a fixed power cost (no additional per-point terraforming cost), and only spend power when they have a valid effect.

- **Move leader pole — 100 power:** select a tile to move the human leader's pole there, on land, water, or a building. Its previous holder loses leadership but keeps their position, home, HP/power, and any permanent knighthood. An already dropped pole can also be moved. Selection/cancellation costs nothing; missing poles or an unchanged dropped location cost nothing. Normal same-team pickup applies, but a former holder standing on the selected tile must leave before reclaiming it. The pole remains visible above water/buildings and **L** locates its new position.
- **Earthquake — 500 power:** reshapes points within roughly six tiles of the selected tile: each point has a **10% chance to rise** by one or two levels and a **90% chance to lower**, potentially all the way to water (height 0). Subsidence is applied after uplift so most affected land sinks. Neighboring heights still differ by at most one. The entire interface shakes for one real-time second (suppressed for reduced-motion preferences).
- **Knight — 1,000 power:** permanently converts the current living, outdoor leader into a knight, multiplying their current character power/HP by **1.5** once. Housed, drowning, missing, or already-knighted leaders cannot be converted; rejected casts spend nothing. Knights render at **1.3× a normal character's scale**, clad head-to-toe in reflective **silver plate armor**: a closed helmet, gorget, cuirass, hip plates, shoulder plates, arm guards, gauntlets, greaves, knee guards, and boots. Armor follows the animated limbs and fully covers the original clothes and skin. They retain their sword, population-colored shield, and white leader pole, and carry a separate prominent **red/blue team flag** beside the pole. The team flag stays with the knight's equipment; only the white leader pole drops for succession. This visual size increase does not change the existing 1.5× HP/power bonus. They remain outside, do not build houses, and seek living enemy characters along reachable land routes when enemies exist; with no enemies they wander. Melee uses the same simultaneous, strength-based combat as ordinary characters, with the knight's increased power contributing to attack strength. Touching an enemy house or castle releases its resident and starts a fight. Blue enemy residents are valid opponents. If the enemy island is disconnected, knights advance to their nearest reachable shore and wait rather than drowning; a completed land bridge lets them continue toward enemies. There is no reversal spell. Death drops only the leader pole: a successor who picks it up remains a normal character unless separately converted.
- **Volcano — 2,000 power:** raises up to three spaced-out points around the selected tile to maximum height **14** (six levels above the old cap), prioritizing a corner of that tile. All land touched by the full height cascade becomes distinctly gray **volcanic rock**, replacing any swamp there. No power is spent if no eligible nearby points remain.
- **Flood — 3,000 power:** lowers **every point in the entire world** by one height level, clamped at 0—equivalent to raising the sea level by one. Clicking its icon casts immediately; the effect is global, including offscreen land. Repeated casts can submerge all land; a cast on an already all-water world costs nothing. Flood can destroy homes, remove farming/sheep, and strand settlers who then begin drowning.

- **Swamp — 1,500 power:** each dry surface within a **10-tile Euclidean radius** of the targeted tile has a **75% chance** of becoming swamp. Animated, mottled green mold covers both flat and sloping swamp ground. Swamp is excluded from building support and farmland: a home on swamp releases its resident, and any swamp in a castle’s central nine tiles downgrades it (or releases the owner when the center is swamped). Submerging a swamp tile destroys it permanently; raising that ground later does not restore swamp.

Walking onto swamp or standing on newly swamped ground causes **persistent sickness**. Character power is HP; sick settlers take **1 HP of damage per simulation second**, including after leaving the marsh or moving into a healthy house. Their heads turn green, and Inspect/Population show sickness. There is no automatic cure. At 0 HP they die and leave the population; an occupied building is removed if its resident dies. Pausing stops damage, and speed controls accelerate it. Newborns do not inherit sickness.

- **Armageddon — 6,000 power:** both populations merge into their leaders, who march across automatically raised land for a winner-deciding duel. See Armageddon below.

All spells update homes, castles, farming, trees, and settler positions just like ordinary terrain edits. Spells can be cast while the simulation is paused.

## Developer model viewer

The **code (`</>`) icon at the bottom right** toggles developer mode after starting a game. The left-side picker shows the **walking character**, **houses at levels 1–4**, **level-5 castle**, **walking knight with full equipment**, and **two characters fighting** with the normal strike poses, red glow and yellow lightning.

These are the real game models, using shared production walking/combat animations. Drag the preview to orbit and scroll/pinch to zoom. **Pause animation / Play animation** controls playback; reduced-motion preferences start it paused. The live world, economies and camera are frozen and untouched while inspecting models. Press **Escape** or the code icon to return with the original pause state and touch controls restored.

## Test scenarios

The **Test scenario dropdown beside New world** immediately loads the chosen scenario (resetting the current world). It returns to its prompt so you can select the same scenario again to restart it.

- **Shared-island combat:** the existing deterministic encounter test described below.
- **Small map · 20,000 power:** a fresh **Small (200×200)** archipelago with **20,000 player power**, the normal **500 enemy power**, and 24 settlers per side. Normal settlement growth, gathering, spells, combat and enemy AI remain enabled, using the current difficulty. The extra funding is confined to this sandbox; confirming a regular New world restores the normal 500/500 start.

**Shared-island combat** starts with 24 red and 24 blue characters on the same clear island, with camp centers just **six tiles apart**. They start in distinct unoccupied cells, wander freely, and reserve walking destinations so they go around each other instead of passing through or swapping head-on. Each side still has its own leader pole.

**Nearby opposing characters now fight in this test**, with facing, strike animations, and a red glow. Knight conversion still uses its normal 1,000-power cost; the encounter also starts with 500, so expensive spells require a separately funded development fixture. Gathering, automatic houses/births, and enemy terraforming remain disabled to keep the test focused on encounters. Manual terrain edits and other spells remain available, so environmental hazards still apply if you create them. The test starts unpaused at 1× speed; pause/speed, minimap, and camera buttons continue working. Selecting **Shared-island combat** again restarts it. **New world** opens the setup menu; confirming leaves the test and restores the regular archipelago and existing normal-game mechanics.

## Minimap

The upper-left **WORLD** minimap shows the entire archipelago: teal water and elevation-colored land, red/blue house squares, and larger castle squares. Unhoused living characters appear as team-colored dots only where there is room; leaders and knights get priority and crowded dots are suppressed. A white outline indicates the camera's ground footprint. **Click/tap or hold and drag on the minimap to move the camera** without changing zoom or orbit, spending power, or casting the selected spell. It works while paused. Dragging continues outside the minimap, clamps to map edges, and stops on release/cancellation or window focus loss.

Terrain is cached at coarse resolution to keep small islands visible, and only cells affected by terrain edits are rescanned. Building/character markers and the camera outline refresh approximately seven times per second. The minimap scales down on mobile and short windows to avoid covering the tools.

## Enemy population and terrain AI

Both sides start with **24 characters, their own leader/pole, and 500 power**. The enemy occupies the opposite southeastern corner island; its houses, castles, and shirts are blue (the opposite of the human population). The Population display counts human settlers, with an enemy count alongside it. Human Power and income exclude enemy buildings. Hover the enemy count beside Population for enemy population, housed/castle counts, power, and paid edit count. Press **E** or click the enemy area on the minimap to inspect that side; **Home / Reset View** returns to the human start.

The enemy pays the **same full cascade costs and obeys the same slope limits** as the player. Its selected edit corners must also be within **10 tiles of its own living characters**, using their current walking positions or home centers; unreachable plans are dropped without spending power. It makes at most **one one-level corner edit every 4 simulation seconds**, pauses with the game, and never catches up with bursts of edits after a stall. Its separate power budget is replenished by its own occupied homes on the same normal/rock income schedule as the human side. It stops editing if eliminated and cannot edit without sufficient power; it gets no free spells or resource bonuses.

AI plans local **3×3 flat building platforms** (16 shared corners), favoring existing high ground and modest elevation **4–7**, rather than flattening the island to one universal level. Existing homes at elevation 4 or above can be expanded at their current height without changing their foundations. Higher platforms help withstand floods; they are not immune to terrain spells. Plans protect friendly home corners, leave castle spacing, and wait for actual walkers to reach completed sites. Ordinary construction/support rules produce houses and castles—no buildings or new citizens are spawned for free. Normal births, illness, drowning, rock penalties, and combat apply to both populations. Broad flat platforms remain available for rebuilding after a uniform flood if still above water.

### Enemy spell attacks

With the **Balanced policy** (timings vary by difficulty/profile), after a **75-simulation-second opening grace period**, the enemy occasionally casts **Earthquake (500)**, **Swamp (1,500)**, or **Volcano (2,000)** against player settlements or groups of characters. Further attempts are spaced **75–120 simulation seconds** apart, with at most one attack per update and no catch-up bursts. Affordable spells are chosen with a preference for Earthquake; valuable, crowded targets receive higher priority.

Spells share the enemy's normal power budget with terrain editing and use exactly the same effects/costs as player spells—no free currency, resource bonuses, or extra per-point fees. Targets near the enemy's own population are avoided, and a final preview protects friendly homes and characters. Invalid/no-effect casts cost nothing. Enemy casting does not cancel the player's selected spell or change player currency, and successful attacks announce **Enemy casts …**. Hover the enemy population count to see spell count and power spent.

Enemy spells freeze while paused, stop if either population is eliminated, and are disabled during the encounter test and Armageddon. The AI does not cast Armageddon, global Flood, or move the player's pole.

### Enemy knight musters and raids

With the **Balanced policy**, after **120 simulation seconds**, the enemy can assemble a knight muster. Other difficulty profiles tune the timing, strength, cap, and donor/reserve limits. It prefers nearby healthy roaming citizens, drafting housed citizens only as needed: the leader and at most **three donors** leave their homes, then the donors actually walk to the leader and merge their existing HP/power. No strength or characters are created for free. The leader must accumulate **at least 40 character power** before the normal **1,000-power Knight spell** applies its permanent **1.5×** multiplier. The cost is reserved against other enemy spending while gathering.

A separate, unabsorbed successor comes to the strengthened knight and receives the white pole **in person**. Both keep their own HP, position, and equipment; the successor does not become a knight. The former leader retains silver armor, sword, blue flag/shield, and enlarged scale, then pursues the player using the normal knight combat and land-routing rules. Disconnected islands mean approaching the reachable shore, not teleporting or crossing water for free.

Further musters wait **150 simulation seconds after dispatch**, maintain at least **six ordinary citizens**, and stop at **three active enemy knights**. Lost knights can eventually be replaced. Interrupted or stalled gatherings cancel safely; the AI pays only for actual conversions. Only selected blue military recruits are mobilized—other homes keep their residents, income, farms, and growth. Normal player Gather/Attack still never evacuate buildings. Knight AI freezes while paused, is disabled in the encounter test and Armageddon, and resets with New world. Hover the enemy population count for active/trained knight counts and muster phase.

## Water waves

The ocean uses animated, seamless **wave color and ripple-normal textures** on one continuous world-aligned surface. Patterns repeat smoothly every eight world tiles, including matching slopes at the texture edges, so neighboring water tiles have no visible seams. Mipmapping, linear filtering, and anisotropic filtering keep transitions smooth when zooming or viewing at an angle. Color and normals scroll together in simulation time; pausing freezes the waves. Camera movement never repositions or snaps the pattern. The water level, shore geometry, and drowning mechanics are unchanged.

## Population colors

Human characters wear **red shirts** and enemy characters wear **blue shirts**, including newborns, which inherit their parent's population. Shirt color is independent of character count, sickness, and leadership. Every house (levels 1–4) and castle always displays a flag in its population's matching red/blue color; flags and shirts share the same palette.

## Combat

Nearby opposing outdoor characters automatically face one another and fight in stable one-on-one engagements (triggered within 1.35 tiles). They step smoothly toward each other to roughly **0.4 tiles apart**, adjusted for model size, without overshooting or stepping onto unwalkable/submerged ground. Both take damage simultaneously at **opposing combat power / 10 HP per simulation second**: a 20-power character deals 2 HP/s, while a 10-power character deals 1 HP/s. Attack power is captured when the engagement begins; wounds reduce HP without weakening the attack rate, so equal fights end rather than approaching zero forever. Power absorbed during a fight increases attack strength. Fighting pauses with the simulation and respects speed controls.

Fighters animate alternating strikes and a small body lean, with isolated red emissive materials and soft pulsing red auras. Bright **yellow zigzag lightning bolts** arc back and forth between the fighters at head height, with a moving spark marking each direction. Closing motion and lightning use simulation time, so pause freezes them and speed controls accelerate them. Other characters and shared team materials do not glow. The effects clear after combat or a world reset. Defeated characters use normal death and leader-pole succession. When any living outdoor character contacts an enemy house or castle, the building disappears and its existing resident emerges near the contacted edge. The resident retains their exact accumulated character HP/power (not the house's level), team, and leadership; no extra citizen or free power is created. Castle footprints/buffers, farms, sheep, and building income are removed through normal settlement cleanup. The attacker and released resident immediately pair off and fight. Friendly buildings are untouched, and contact conversion freezes while paused. Inspect identifies fighting characters.

## Armageddon — 6,000 power

Armageddon is an immediate, irreversible final-battle spell. Both populations evacuate every home without losing HP/power, follow their own leader, and merge all remaining character power into that leader. Existing living leaders are retained; if a pole has no living owner, that population's strongest available survivor becomes its leader. Casting requires living characters on both sides and charges only once.

The two leaders march toward each other and are the only combatants during Armageddon. Followers ignore ordinary attack orders and move **exactly 5% faster** than normal (**0.6825 versus 0.65 tiles/s**), with no random waiting, so they can catch their leaders. Arriving followers can strengthen a leader even during the duel. Both leaders automatically turn nearby water into **height-1 land** in a two-tile neighborhood; this extends as they move, preserves higher terrain/slope limits, and costs no extra power.

Normal orders, terrain editing, other spells, births, and enemy terraforming are locked during the finale; pause, speed, and camera controls still work. When a leader falls, the surviving leader's population wins: **VICTORY** or **DEFEAT** is shown and simulation freezes. Simultaneous leader deaths produce a **DRAW** rather than favoring either player. Choose **New world** or **Test scenario** to restart.

## Attack enemy order

The **crossed-swords button in the bottom toolbar** toggles **Attack enemy** for roaming human characters. Existing houses/castles remain occupied and keep their residents, HP/power, income, farms, and normal growth. Roaming characters—including newborns once outside—pursue the nearest living enemy, including residents in enemy buildings. Building contact releases the defender and starts the normal fight. Human characters do not build while attacking. Disconnected enemies are approached from the nearest reachable shore; a new crossing lets the army resume. Flow fields are shared across troops and cached with a bounded size.

Click again to cancel and resume normal orders. Attack cancels gathering (so the army does not merge into its leader), and enabling gathering cancels attack. The leader's anchor stays placed but is temporarily overridden by the attack order. With no enemies left, the army waits until attack is cancelled. Pause freezes movement/combat; confirming a New world or starting Test scenario clears the order. Enemy characters are not commanded, and HP, population, and player currency are not granted by the toggle.

## Leader HP and power panel

While your population has a pole holder (including a housed leader), a compact panel above the spells shows **HP in red** and **character combat power in blue**, with current numeric values rounded to one decimal place. Both bars have a fixed **10,000 maximum**; larger real values remain intact and simply fill the bars. This is not the player's god-power currency or a building's level. Outside combat HP and character power share the same value; during a fight the blue bar shows the engagement's attack-power pool while the red bar tracks remaining HP.

The panel refreshes when health/power changes or a new character picks up the pole, and hides while the pole has no owner. The spell stack adapts to short screens, scrolling when necessary to keep all spells accessible.

## Leader destination anchor

Click the **anchor button in the bottom toolbar**, then click a map tile to place a visible anchor. Your current human leader leaves any home without losing HP/power, follows dry walkable routes toward it, and waits there instead of building. Knights follow the anchor rather than chasing distant enemies; nearby combat still takes priority. Gathering followers can continue following the moving leader.

Click the same button again to **remove the anchor** (or cancel placement). Escape/right-click cancels pending placement without editing terrain or spending power. Water, blocked, or disconnected destinations lead the leader to the nearest reachable point, where they wait until terrain changes provide a route. The anchor persists for a successor after leadership changes. Pause freezes movement; confirming a New world or starting Test scenario clears the anchor.

## Leader and gathering

Each new population starts with exactly **one leader**, marked by a large white object on a staff. While walking, the leader carries the object; when housed, the object marks the roof. In normal wandering mode a non-knight leader can build and produce children like other residents, so gathering down to one character does not prevent the population from regrowing. Inspect its tile or hover the Gather button to see its character power/HP.

The **Gather followers flag icon** in the bottom toolbar is a free toggle; its tooltip and accessible label change to **Stop gathering** while active. When enabled, **only roaming human characters** stop building and follow reachable dry routes toward the leader, including roaming knights. Houses/castles and their residents stay in place, retaining income, farms, sheep, and growth. On reaching the leader (or the edge of the leader's building), a follower disappears and transfers **all remaining character power/HP** to the leader without removing that building. This reduces the population by one, does not award player currency, and does not cap the leader at the normal birth threshold while gathering. A housed leader keeps accumulating power while gathering but temporarily defers births, preventing the gathered pool from repeatedly splitting into newborns and merging back. Other buildings continue normal births. Once gathering is disabled, a non-knight leader can settle again and normal birth/power-splitting rules resume. Clicking **Stop gathering** returns the remaining followers to wandering and building new homes.

When the leader dies, the white object stays on the **actual tile of death**, including water, and remains after the corpse disappears. The nearest available living roaming character from the same population automatically heads toward the unattended pole and picks it up to become the sole new leader. Busy fighters, drowning/dead characters, and housed residents are not dispatched, so buildings remain intact. Recovery takes priority over wandering, attack orders, builder errands, and distant knight pursuits, but nearby combat can interrupt it. If the destination is unreachable, the collector walks to the nearest reachable point and waits for a crossing; collectors are reassigned if a closer eligible walker appears or the previous collector dies. A submerged object remains visible above the water and can be recovered after the ground is restored. Gathering remains enabled if already active, so followers target the dropped object until it is picked up; unreachable followers wait rather than walking into water. New world resets the role and gathering state.

## Volcanic rock

Rock has a gray/basalt palette distinct from ordinary terrain, with matching contour colors. Flat, dry rock remains buildable and can be farmed. A building anchored on rock produces player power every **10 simulation seconds instead of 5**, and its resident gains character power at **half speed**, doubling all birth cycles (level 1: 240 seconds; castle: 60 seconds). Inspect shows the adjusted growth rate and birth interval, and the Power tooltip separates regular and rock income.

Rock persists through dry terrain edits. Lowering it into water destroys the rock substrate permanently; raising the ground later produces ordinary land. Trees retain the existing preservation rules unless farming or a castle clears them.

## Structure

- `src/main.ts` — a single `startGame()` entry point owns game state; named functions create the scene/icons/water, bind terrain/spell/tool/simulation/keyboard input, and start rendering. Terrain, scenery, simulation, and interactions run inside functions rather than module-level initialization.
- `src/terrain-reach.ts` — circular 10-tile manual-edit influence from living own characters.
- `tests/terrain-reach.test.mjs` — radius boundaries, surface centers, ownership, movement, homes, and drowning rescue.
- `src/camera-bounds.ts` — map-size-aware camera-center limits that preserve zoom and orbit.
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
- `src/encounter-scenario.ts` — shared-island setup and occupied-step avoidance for encounter testing.
- `tests/encounter-scenario.test.mjs` — connected camps, movement reservations, and combat-enabled scenario guards.
- `src/minimap.ts` — incremental elevation raster, team markers, crowd suppression, and map navigation coordinates.
- `src/minimap-navigation.ts` — captured mouse/touch minimap dragging and release/cancellation handling.
- `tests/minimap.test.mjs` — terrain cache correctness, team glyphs, crowded characters, and coordinate bounds.
- `src/game-models.ts` — shared normal house/castle, settler, knight/equipment, leader models and walking pose, used by normal play and previews.
- `src/developer-view.ts` — isolated, orbitable developer model gallery with production walking and combat animations.
- `src/attract-simulation.ts`, `src/attract-view.ts` — isolated, bounded AI-vs-AI startup preview using the normal game's shared models.
- `tests/attract-mode.test.mjs` — preview rules, pause, frame budgets, looping, determinism, rendering cleanup, and live-game isolation.
- `src/game-settings.ts` — validated new-game choices, size presets, and shared 500-power start.
- `tests/game-settings.test.mjs` — settings validation, all world dimensions/starts, and deferred startup.
- `src/ai-profiles.ts` — shared strategy parameters and Easy/Normal/Hard mapping.
- `src/simulation/` — deterministic headless games, continuous movement, tournaments, validation, and reports.
- `tools/run-ai.mjs`, `tools/ai-entry.mjs` — Node worker CLI, checkpoints, compressed reports, and replay.
- `docs/ai-simulation.md` — reproducible AI evaluation protocol and policy tuning guide.
- `src/enemy-knights.ts` — limited real-citizen musters, strength thresholds, paid conversions, succession, and knight caps.
- `tests/enemy-knights.test.mjs` — HP conservation, costs, successive raids, reserves, caps, failed musters, succession, and reset.
- `src/enemy-spells.ts` — cooldown-limited, paid attacks against player settlements/groups with friendly-fire avoidance.
- `tests/enemy-spells.test.mjs` — grace periods, pause, budgets, targets, cooldowns, elimination, and reset.
- `src/enemy-ai.ts` — slow, paid terrace planning, friendly-home protection, and castle-site preparation.
- `tests/enemy-ai.test.mjs` — edit pacing, budgets/cascade costs, castle support, varied heights, and elimination.
- `src/water-texture.ts` — seamless periodic wave textures, ripple normals, and lightweight simulation-time animation.
- `tests/water-texture.test.mjs` — edge/derivative continuity, repeating filters, normals, and animation.
- `src/knight-armor.ts` — 1.3×-scale silver armor attached to animated body parts.
- `tests/knight-armor.test.mjs` — scale, full armor coverage, material, animation attachment, and cleanup ownership.
- `src/armageddon.ts` — final-battle state, leader selection, exact follower speed bonus, victory, and local height-one causeways.
- `tests/armageddon.test.mjs` — one-time payment, both populations' merging, speed, outcomes, and invariant-preserving land.
- `src/attack-order.ts` — human-only attack intent and shared, bounded pursuit flow fields.
- `tests/attack-order.test.mjs` — team/life filtering, cached army routes, disconnected shores, and resets.
- `src/leader-vitals.ts` — live leader HP/combat-power values and a responsive, fixed-scale two-bar view.
- `tests/leader-vitals.test.mjs` — combat power versus HP, the 10,000 scale, holder visibility, and bar colors.
- `src/pole-recovery.ts` — nearest eligible same-population collector selection for unattended leader poles.
- `tests/pole-recovery.test.mjs` — nearest selection, team/life filters, building preservation, same-tile relocation, and reassignment.
- `src/leader-anchor.ts` — toggle/placement state and cached destination routes, including unreachable shores and successors.
- `src/leader-anchor-marker.ts` — visible gold destination anchor.
- `tests/leader-anchor.test.mjs` — placement/removal, routing, arrival, bridges, succession, and marker geometry.
- `src/building-contact.ts` — enemy house/castle footprint contact and defender emergence positions.
- `tests/building-contact.test.mjs` — both populations, footprint limits, power-preserving release, and immediate defender pairing.
- `src/combat.ts` — stable opponent pairing and simultaneous proportional damage.
- `src/combat-effects.ts` — facing, strikes, isolated red emission, soft combat auras, and traveling yellow lightning.
- `tests/combat*.test.mjs` — damage, pairing, death, pause, animation, glow isolation, and cleanup.
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
