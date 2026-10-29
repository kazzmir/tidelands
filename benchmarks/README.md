# AI calibration results

> **Historical funding:** These recorded games used **10,000 starting power per side**. The live game and new tournament defaults now use **500**. The policy choices are retained, but the win rates below have **not** been revalidated for the new funding. Raw historical reports are unchanged. They also used combat damage of **attack power / 10 HP/s**; current combat uses **attack power / 5 HP/s**, so these scores are not recalibrated for the faster combat either. Current character movement is also 10% faster (**0.715 versus 0.65** tile progress/s); the archived runs retain their original rules.

## Selected playable modes

| Mode | Policy | Training score | Unseen holdout score |
|---|---|---:|---:|
| Easy | Patient | 34.8% | 32.5% |
| Normal | Balanced | 50.9% | 55.0% |
| Hard | Sorcerer | **83.8%** | **80.0%** |

Easy/Hard are the weakest/strongest policies in the **training** field. Normal deliberately retains the existing Balanced behavior, rather than automatically replacing it with the median-ranked Steward. Balanced is near the field's 50% score and was more stable than the middle-ranked policies in the resolution check. Holdout data was not used to search or tune parameters.

All modes use the same initial population/HP/currency, prices, damage, growth and income rules. Difficulty changes decision timing, spell preferences, targeting noise, and military recruitment policy, not hidden resource bonuses. Choose a mode in the startup menu; New world and the header control reopen setup, and a fresh world starts only after confirmation.

## Main experiment: 1,000 games

- Five policies: Patient, Balanced, Raider, Sorcerer, Steward.
- 50 seeds starting **73129**; each seed contains every pair on **both sides**.
- **800 training games** over 40 seeds; **200 holdout games** over 10 unseen seeds.
- 64×64 controlled maps: plains (260 games), tidal causeway (260), separated islands (240), highlands (240).
- Four-minute regular phase, then up to three minutes of **real, paid Armageddon**. Every recorded terminal result was an Armageddon leader-death result: **999 decisive games, one simultaneous-death draw, zero timeouts**.
- One-second fixed steps with fractional-distance carry; four workers, Node v22.22.1. Recorded wall time: approximately **664 seconds** on this host.

This is explicitly an **Armageddon-finale benchmark**, not evidence that the policies naturally eliminated entire populations in four minutes, nor a guarantee of strength against humans. The autonomous sandbox otherwise tends to remain open-ended. Use `--finale 0` and longer horizons to investigate natural elimination; unresolved games remain draws, never material-score wins.

| Candidate | Training score | Approx. 95% seed-cluster interval | Holdout score |
|---|---:|---:|---:|
| Sorcerer | 83.8% | 79.5–88.0% | 80.0% |
| Balanced | 50.9% | 46.0–55.9% | 55.0% |
| Steward | 43.1% | 37.3–48.9% | 47.5% |
| Raider | 37.3% | 32.1–42.6% | 35.0% |
| Patient | 34.8% | 30.6–39.1% | 32.5% |

Reproduce:

```sh
npm run ai:tournament -- --games 1000 --seed 73129 --seconds 240 --finale 180 --starting-power 10000 \
  --workers 4 --out reports/ai-baseline.json.gz
npm run ai:replay -- --replay benchmarks/ai-baseline.json.gz --match 42 --allow-version-change
```

For the original engine-digest-verified replay, check out revision `2503c34` and omit `--allow-version-change`. The commands above deliberately restore legacy funding under the current engine for comparison; they do not claim that engine versions are identical.

[Full standings and protocol](ai-baseline.md) · [Raw replayable report](ai-baseline.json.gz) · [Per-game CSV](ai-baseline.csv).

## Resolution check: 100 additional games

Independent seeds starting **81000**, the same four-minute regular phase/finale protocol, and **0.5-second** rather than one-second steps. Sorcerer remained first on the 80-game training portion (78.1%); Balanced was second (68.8%). Patient remained last. Raider and Steward changed middle positions. The eight-game-per-policy holdout portion is far too small for a strong claim and tied Balanced/Sorcerer at 87.5%.

This supports, but does not prove, coarse-step stability of the selected extremes. It also illustrates why the middle-profile ordering should not be overinterpreted.

```sh
npm run ai:tournament -- --games 100 --seed 81000 --seconds 240 --finale 180 \
  --step 0.5 --starting-power 10000 --workers 2 --out reports/ai-half-step.json.gz
```

[Standings](ai-half-step.md) · [Raw report](ai-half-step.json.gz) · [CSV](ai-half-step.csv).

## Actual 500×500 world smoke check: four additional games

Balanced versus Sorcerer, two new seeds (**90010–90011**), both side assignments, actual generated archipelagos and production starting anchors. Four-minute normal play plus up to 900 seconds of paid finale travel/combat. All four completed; Sorcerer won three and Balanced one. Full-world match 0 was replayed and **exactly verified**.

Four games are a functional/fidelity smoke check, **not a statistically meaningful full-world ranking**. Its wide intervals and lack of holdout data are retained in the report.

```sh
npm run ai:tournament -- --profiles balanced,sorcerer --games 4 --seed 90010 \
  --size 500 --scenarios generated --seconds 240 --finale 900 --starting-power 10000 --workers 1 \
  --out reports/ai-full-world.json.gz
npm run ai:replay -- --replay benchmarks/ai-full-world.json.gz --match 0 --allow-version-change
```

[Standings](ai-full-world.md) · [Raw report](ai-full-world.json.gz) · [CSV](ai-full-world.csv).

## Further work

Run longer natural-only matches, more production-sized worlds, finer steps, and human playtests before claiming universal superiority or revising the mapping. The existing tools support all of these without changes to the simulator. See [the simulation guide](../docs/ai-simulation.md) for policy tuning, balanced scheduling, confidence intervals, checkpoints, replay, and implementation limits.
