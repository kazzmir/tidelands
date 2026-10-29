# Tidelands AI tournament

1000 games · seeds starting 73129 · 64×64 · 240s regular phase + up to 180s paid finale · 1s steps

Scenarios: plains, tidal, islands, highlands

## Training

| Profile | Games | W / D / L | Score | Approx. 95% CI | Timeouts | Mean knights trained |
|---|---:|---:|---:|---:|---:|---:|
| sorcerer | 320 | 268 / 0 / 52 | 83.8% | 79.5–88.0% | 0 | 0.83 |
| balanced | 320 | 163 / 0 / 157 | 50.9% | 46.0–55.9% | 0 | 0.79 |
| steward | 320 | 138 / 0 / 182 | 43.1% | 37.3–48.9% | 0 | 0.75 |
| raider | 320 | 119 / 1 / 200 | 37.3% | 32.1–42.6% | 0 | 1.53 |
| patient | 320 | 111 / 1 / 208 | 34.8% | 30.6–39.1% | 0 | 0.70 |

## Unseen holdout seeds

| Profile | Games | W / D / L | Score | Approx. 95% CI | Timeouts | Mean knights trained |
|---|---:|---:|---:|---:|---:|---:|
| sorcerer | 80 | 64 / 0 / 16 | 80.0% | 68.3–91.7% | 0 | 0.89 |
| balanced | 80 | 44 / 0 / 36 | 55.0% | 45.9–64.1% | 0 | 0.81 |
| steward | 80 | 38 / 0 / 42 | 47.5% | 39.5–55.5% | 0 | 0.70 |
| raider | 80 | 28 / 0 / 52 | 35.0% | 30.1–39.9% | 0 | 1.51 |
| patient | 80 | 26 / 0 / 54 | 32.5% | 22.0–43.0% | 0 | 0.64 |

Training recommendations: Easy **patient**, Normal **steward**, Hard **sorcerer**. These are recommendations, not an automatic change to the game.

- Ranking uses actual elimination or Armageddon leader deaths: win=1, draw=0.5. Time limits are draws, never material-score victories.
- Optional referee finale starts paid Armageddon at the regular horizon if either side can pay 6000. Payer priority alternates by seed; the other side is forced to rally, exactly as in the game. Disable with --finale 0 for natural-elimination-only matches.
- Each pair plays both sides of the same seeded world. Confidence intervals are approximate 95% seed-cluster intervals, not proof of superiority.
- Recommendations use training seeds only; holdout seeds are reported separately and are not used to select profiles.
- Shared production terrain, economy, growth, combat, spell, and AI modules run without rendering. Fixed-step movement/contact timing and compact controlled maps differ from the interactive 500x500 game; benchmark strength is not a guarantee against humans.
- No resource, HP, damage, birth-rate, or price bonuses. All profiles start with 24 characters and 10000 power per side.

Engine digest: `a084ab936671255a704a02f5176e38bbcbe87f523a76b335ab6dab354803e350`
