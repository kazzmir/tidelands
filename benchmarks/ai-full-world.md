# Tidelands AI tournament

4 games · seeds starting 90010 · 500×500 · 240s regular phase + up to 900s paid finale · 1s steps

Scenarios: generated

## Training

| Profile | Games | W / D / L | Score | Approx. 95% CI | Timeouts | Mean knights trained |
|---|---:|---:|---:|---:|---:|---:|
| sorcerer | 4 | 3 / 0 / 1 | 75.0% | 26.0–100.0% | 0 | 0.50 |
| balanced | 4 | 1 / 0 / 3 | 25.0% | 0.0–74.0% | 0 | 0.50 |

## Unseen holdout seeds

| Profile | Games | W / D / L | Score | Approx. 95% CI | Timeouts | Mean knights trained |
|---|---:|---:|---:|---:|---:|---:|
| balanced | 0 | 0 / 0 / 0 | 0.0% | 0.0–100.0% | 0 | 0.00 |
| sorcerer | 0 | 0 / 0 / 0 | 0.0% | 0.0–100.0% | 0 | 0.00 |

Training recommendations: Easy **balanced**, Normal **balanced**, Hard **sorcerer**. These are recommendations, not an automatic change to the game.

- Ranking uses actual elimination or Armageddon leader deaths: win=1, draw=0.5. Time limits are draws, never material-score victories.
- Optional referee finale starts paid Armageddon at the regular horizon if either side can pay 6000. Payer priority alternates by seed; the other side is forced to rally, exactly as in the game. Disable with --finale 0 for natural-elimination-only matches.
- Each pair plays both sides of the same seeded world. Confidence intervals are approximate 95% seed-cluster intervals, not proof of superiority.
- Recommendations use training seeds only; holdout seeds are reported separately and are not used to select profiles.
- Shared production terrain, economy, growth, combat, spell, and AI modules run without rendering. Fixed-step movement/contact timing and compact controlled maps differ from the interactive 500x500 game; benchmark strength is not a guarantee against humans.
- No resource, HP, damage, birth-rate, or price bonuses. All profiles start with 24 characters and 10000 power per side.
- Insufficient independent seeds or no score separation: recommendations are not evidence of different strength. Run more/longer games.

Engine digest: `a084ab936671255a704a02f5176e38bbcbe87f523a76b335ab6dab354803e350`
