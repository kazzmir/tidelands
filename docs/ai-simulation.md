# AI simulation, tournaments, and difficulty

The game has a rendering-free fixed-step simulator, five parameterized policies, and a startup menu with **Easy / Normal / Hard** AI and world-size choices. The current live game and default tournaments start each population with **500 power**. The checked-in historical calibration used **10,000 power**; its scores have not been revalidated for the new funding or the current **attack power / 5 HP/s** combat rate (historical reports used /10). Policies share production rules/controllers; they do not get extra starting money, residents, HP, income, or damage.

## Startup attract mode

The setup menu now shows a separate **AI-vs-AI simulation** in the background. `AttractSimulation` runs the real `SimulationGame` with two policies, 24 characters/500 power per side, a compact 64×64 arena, 0.25-second steps and up to 6× presentation speed. It starts a fresh seed after **120 seconds of visible, unpaused real time**, independent of the 6× simulation speed. Early elimination holds the result until the two-minute deadline, rather than restarting early. It neither advances nor initializes the player's world.

The Three.js preview uses `createGameModels()` from `src/game-models.ts`, the **same factory normal play uses** for houses, complete castles, characters, knight armor/equipment and leader objects. Model geometry, materials, colors, scale and articulated limbs are not simplified substitutes. Terrain triangles, instanced trees and the game's water textures complete the scene. It shares the existing renderer, not the player's scene or state. Preview work is bounded to two simulation steps per animation frame; hidden tabs do not advance it or catch up. Pause/Play is available in the menu, and reduced-motion preferences begin paused. Paused scenes are only redrawn when needed (for example, resize).

Starting play disposes preview geometry/materials/textures, releases its simulation and caches, and restores normal canvas layout. Reopening setup during an existing player game still freezes that game rather than launching a demo over it. Preview camera/presentation limits and accelerated timing have no effect on live-game rules or tournament results.

## Read-only watch mode

The new-game menu also offers **Watch AI vs AI**. Both sides use the selected difficulty profile on the selected generated world (150/200/300), with 24 citizens and 500 power each. `WatchSimulation` advances the shared `SimulationGame` at 0.25-second steps, bounded to two steps per frame, without human commands or a player simulation running underneath. It has no demo restart, forced Armageddon, or score-based timeout: actual elimination ends the match, which remains visible until a new game is confirmed. The shared model presentation renders real combat pairs without automatic camera movement. Spectators can pan, rotate and zoom with mouse/touch, pan with arrow keys, and click/drag the live minimap (terrain, teams and camera footprint), including after elimination. Watcher input cannot alter terrain, units, orders, spells or simulation speed. Settings/hidden tabs freeze it without catch-up, and switching modes fully disposes spectator resources.

## Playable presets

- **Easy — Patient:** slower terrain work/spells, a later muster, and one active knight.
- **Normal — Balanced:** the familiar existing balance of spell attacks, three-knight cap, and economical musters.
- **Hard — Sorcerer:** earlier, more frequent attacks, accurate cluster targeting, and a strong Swamp preference; still pays every ordinary cost.

The 1,000-game training field selected Patient/Sorcerer as the weak/strong extremes; Balanced is deliberately retained as the stable Normal baseline. See [recorded calibration results](../benchmarks/README.md), including held-out results, a 100-game resolution check, and the limited full-world smoke sample. These presets are calibrated to the documented benchmark objective, not claimed to be universally optimal.

## Run a tournament

Node **22.12+** and the existing npm dependencies are sufficient. No browser, WebGL, Python, or extra packages are required.

```sh
npm run ai:tournament -- --help

# Default: 1,000 games, five policies, four controlled map types.
npm run ai:tournament

# Re-run the historical baseline's funding: 50 seeds × 10 pairs × 2 sides.
npm run ai:tournament -- --games 1000 --seed 73129 --seconds 240 --finale 180 --starting-power 10000 \
  --workers 4 --out reports/ai-baseline.json.gz

# Longer games; larger batches need no source changes.
npm run ai:tournament -- --games 5000 --seconds 900 --finale 180 \
  --workers 4 --out reports/ai-long.json.gz

# Natural elimination only, without a referee-triggered finale.
npm run ai:tournament -- --games 1000 --seconds 900 --finale 0 \
  --out reports/ai-natural.json.gz

# Validate policies on the actual production-sized generated archipelago.
npm run ai:tournament -- --profiles balanced,sorcerer --games 4 --seed 90010 \
  --size 500 --scenarios generated --seconds 240 --finale 900 --workers 1 \
  --out reports/ai-full-world.json.gz

# Check sensitivity to fixed-step resolution.
npm run ai:tournament -- --games 100 --seed 81000 --seconds 240 --finale 180 \
  --step 0.5 --workers 4 --out reports/ai-half-step.json.gz
```

Default maps are **64×64**: plains, a tidal causeway, separated islands, and symmetric highland perturbations. They deliberately cover different combat/access conditions and are not presented as identical to full generated worlds. `generated` uses the existing world generator and starting anchors (minimum size 150; current live presets are 150, 200 and 300). The archived 500×500 checks remain historical. Initial populations use the same radius-14, dry walkable spawning distribution as normal play.

With all five policies, `--games` must be a multiple of **20**, so every seed contains every pair on both sides. For N selected policies it must be a multiple of **N × (N−1)**. `--profiles patient,balanced,sorcerer` selects a subset. Unknown IDs, malformed options, partial rounds, invalid time steps, and invalid world sizes fail before work starts.

## What a match means

Both sides begin with **24 characters at 10 HP** and **500 power** by default. `--starting-power` changes both sides equally for controlled experiments and is recorded in new reports. Use `--starting-power 10000` only when deliberately comparing with the historical calibration. The simulator runs the ordinary game for `--seconds` simulation seconds. Policies terraform, build, reproduce, earn income, cast harmful spells, gather real donors, train paid knights, physically transfer leadership, and pursue opponents. Stalled hostile pursuits can request local shore bridging: paid height-one corner raises share the terrace controller's edit interval and reserve-aware budget, obey character reach, and open a route for the actual attacker. The live enemy and both headless sides use the same bridge planner; historical calibration predates this strategy. Death, permanent sickness, two-second drowning, buildings releasing their existing defenders, isolated-island shore routing, and knight multipliers use the game's modules.

The sandbox can continue indefinitely without a human choosing Armageddon. Therefore the tournament has an explicit, optional **referee finale**:

1. At the regular horizon, if both populations survive and `--finale` is positive, a side that can afford **6,000 power** pays for the real Armageddon spell. First payer priority alternates by seed; if it cannot pay, the other side may pay. If neither can pay, no free spell is granted.
2. Both populations evacuate, rally into their real leaders, and march/fight under the production Armageddon rules. Followers move exactly **5% faster**; only leaders fight; zero-height nearby land is raised under the same finale rules. Births, ordinary AI, and other spells stop.
3. A leader's death determines the result, including simultaneous-death draws. Remaining followers do not override a defeated leader.
4. If the extra finale time expires, the match is a **draw**. With `--finale 0`, every unresolved regular match is a draw.

There is **no material-score adjudication** or invented victory for having more money, HP, or houses. Regular elimination and Armageddon leader deaths are recorded separately. A forced finale is a benchmark protocol, **not** a new ability for the interactive enemy to cast Armageddon automatically. The benchmark's horizon/finale affect which policy is favored; compare multiple horizons and natural-only runs before making stronger claims.

## Reports, replay, and recovery

`--out reports/run.json` writes JSON; `.json.gz` writes compressed JSON. The runner also writes:

- `run.md`: training/holdout standings, scores, approximate confidence intervals, and policy recommendations;
- `run.csv`: every match's seed, sides, map, result, reason, and duration;
- `run.json[.gz].checkpoint.json`: completed matches, settings, and policy snapshots, written atomically during the batch and on shutdown.

```sh
# Verify the exact outcome/metrics of one recorded match.
npm run ai:replay -- --replay reports/ai-baseline.json.gz --match 42

# Continue after Ctrl+C or a worker failure. Completed matches are not rerun.
npm run ai:tournament -- --resume reports/ai-baseline.json.gz.checkpoint.json \
  --workers 4
```

Reports contain every profile's complete parameters, starting power, seed, map type, time step, horizon, finale window, raw results, runtime information, and a SHA-256 digest of the bundled engine. **Replays and resumes reject a different engine/profile version.** Check out the original source revision to reproduce old results. `--allow-version-change` is an explicit replay-only comparison escape hatch, not a way to mix engines in one tournament.

Resume uses the checkpoint's original settings; new horizon/seed/policy flags are not mixed into an existing batch. Treat checkpoint/report files as immutable inputs rather than editing them by hand.

Old checked-in reports without a `startingPower` field used 10,000; the replay reader restores that legacy value explicitly. Their old engine digest still requires the original revision (for example `2503c34`), or `--allow-version-change` for an intentional comparison under today's engine. Historical results are kept unchanged, not relabeled as 500-power results.

Worker count/completion order does not change individual results or standings. Workers are independent; no live game state, shared RNG, or cross-game economy persists between matches. The renderer bundle never imports the tournament/Node runner.

## Fair comparisons and interpretation

- Each pair plays **both sides of the same seeded map**, controlling for geography, initial initiative, and spawn luck.
- Separate seeded RNG streams control world generation and each side's actions; replay uses the complete original policy configuration.
- With at least five seed blocks, the first **80%** are training and the final **20%** are held out. Recommendations are selected using training data **only**. The holdout results are not silently used to optimize policies.
- Ranking is average match points: **win 1, draw 0.5, loss 0**. HP, income, training counts, costs, and currency are diagnostics, not hidden win criteria.
- Approximate 95% intervals cluster results by seed, rather than incorrectly treating swapped sides and opponents on the same map as independent samples. Small batches or all-tied scores emit an explicit insufficient-evidence warning.
- Every game audits `currency = startingPower + building income − terrain costs − spell costs − knight costs − finale costs` (normally startingPower = 500), and checks finite/nonnegative character state. Worker errors stop the batch and preserve a checkpoint; incomplete tournaments are never ranked as complete.

Compact AI-vs-AI performance is **not proof of universal strength against humans**. Human terrain editing, orders, pole relocation, global Flood, and choosing when to cast Armageddon add options autonomous tournament policies do not use. Simulation movement/contact decisions are fixed-step, not the browser's animation loop. Fractional movement distance is carried across tile boundaries, preserving speed and the exact 1.05× finale follower multiplier even at coarse steps. Use `--step 0.5` or smaller to check ranking stability. Rendering, camera, sheep animation, and purely visual effects are intentionally absent.

## Add or tune a policy

Edit `src/ai-profiles.ts`. `aiProfiles()` is the registry; `difficultyProfile()` maps the three playable levels to policy IDs. The current candidates are **Patient, Balanced, Raider, Sorcerer, Steward**. Their parameters control:

- terraform cadence (**never faster than the normal four-second limit**);
- spell cooldowns, spell-choice weights, and target-selection noise;
- knight opening delay, cooldown, target gathered strength, active cap, donor limit, and ordinary-population reserve.

Terrain reach, paid slope cascades, spell prices/effects, HP, initial population/currency, combat damage, birth rates, and building income remain common rules. Add new candidates by returning additional distinct profiles; the scheduler automatically creates all pairings. For a genuinely different decision algorithm, implement it in shared controller code and use it from both `src/main.ts` and `src/simulation/game.ts`, rather than adding a benchmark-only combat approximation.

The startup menu lets you choose AI and Small/Normal/Large world size (150×150 / 200×200 / 300×300) before generating a world. New world and the header AI selector reopen that menu; only confirmation discards the old game. Cancelling preserves its world and pause state. The **Test scenario** dropdown offers **Shared-island combat** (ordinary enemy AI/births/building disabled) and **Small map · 20,000 power** (150×150 normal gameplay, current difficulty, 20,000 player power and the normal 500 enemy power). Either selection resets immediately; repeating it restarts the scenario. Extra sandbox funding never changes ordinary new-game defaults. The live controller instances and headless teams receive the **same policy objects**. Difficulty is not changed automatically by a tournament: inspect the training recommendations, holdout intervals, and full-world/step-sensitivity results before editing the mapping.

## Code map and tests

- `src/game-models.ts`: shared normal-play and preview model factory and resource ownership.
- `src/attract-simulation.ts`, `src/attract-view.ts`: bounded startup AI match and isolated 3D presentation.
- `src/simulation/game.ts`: headless game orchestration and optional paid finale.
- `src/simulation/walk.ts`: continuous tile movement with fractional-distance carry.
- `src/simulation/tournament.ts`: balanced schedule, validation, seed-cluster statistics, reports.
- `tools/run-ai.mjs`: builds the typed headless modules with the already installed Vite into ignored `.cache/ai-tournament/`.
- `tools/ai-entry.mjs`: CLI, worker pool, compressed/atomic reports, checkpoints and replay.
- `src/spell-plan.ts`, `src/birth-location.ts`: spell planning/friendly safety and birth exits shared with the browser.
- `tests/simulation.test.mjs`: determinism, parameter fairness, currency audits, real musters/finales, exact movement rates, paired scheduling, holdout separation, malformed reports, worker-count independence, replay and resume.

Run `npm test` and `npm run build` before accepting a policy or engine change. Check the browser's difficulty control, resource invariants, existing gathering/building preservation, spell selection, and Armageddon after integration changes.
