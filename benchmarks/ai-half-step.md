# Tidelands AI tournament

100 games · seeds starting 81000 · 64×64 · 240s regular phase + up to 180s paid finale · 0.5s steps

Scenarios: plains, tidal, islands, highlands

## Training

| Profile | Games | W / D / L | Score | Approx. 95% CI | Timeouts | Mean knights trained |
|---|---:|---:|---:|---:|---:|---:|
| sorcerer | 32 | 25 / 0 / 7 | 78.1% | 66.4–89.9% | 0 | 0.94 |
| balanced | 32 | 22 / 0 / 10 | 68.8% | 56.5–81.0% | 0 | 0.84 |
| raider | 32 | 15 / 0 / 17 | 46.9% | 40.8–53.0% | 0 | 1.63 |
| steward | 32 | 14 / 0 / 18 | 43.8% | 27.9–59.6% | 0 | 0.81 |
| patient | 32 | 4 / 0 / 28 | 12.5% | 0.0–29.8% | 0 | 0.91 |

## Unseen holdout seeds

| Profile | Games | W / D / L | Score | Approx. 95% CI | Timeouts | Mean knights trained |
|---|---:|---:|---:|---:|---:|---:|
| balanced | 8 | 7 / 0 / 1 | 87.5% | 0.0–100.0% | 0 | 0.88 |
| sorcerer | 8 | 7 / 0 / 1 | 87.5% | 0.0–100.0% | 0 | 1.00 |
| patient | 8 | 3 / 0 / 5 | 37.5% | 0.0–100.0% | 0 | 1.00 |
| raider | 8 | 2 / 0 / 6 | 25.0% | 0.0–100.0% | 0 | 1.50 |
| steward | 8 | 1 / 0 / 7 | 12.5% | 0.0–100.0% | 0 | 0.88 |

Training recommendations: Easy **patient**, Normal **raider**, Hard **sorcerer**. These are recommendations, not an automatic change to the game.

- Ranking uses actual elimination or Armageddon leader deaths: win=1, draw=0.5. Time limits are draws, never material-score victories.
- Optional referee finale starts paid Armageddon at the regular horizon if either side can pay 6000. Payer priority alternates by seed; the other side is forced to rally, exactly as in the game. Disable with --finale 0 for natural-elimination-only matches.
- Each pair plays both sides of the same seeded world. Confidence intervals are approximate 95% seed-cluster intervals, not proof of superiority.
- Recommendations use training seeds only; holdout seeds are reported separately and are not used to select profiles.
- Shared production terrain, economy, growth, combat, spell, and AI modules run without rendering. Fixed-step movement/contact timing and compact controlled maps differ from the interactive 500x500 game; benchmark strength is not a guarantee against humans.
- No resource, HP, damage, birth-rate, or price bonuses. All profiles start with 24 characters and 10000 power per side.

Engine digest: `a084ab936671255a704a02f5176e38bbcbe87f523a76b335ab6dab354803e350`
