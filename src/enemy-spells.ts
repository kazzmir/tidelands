import { SPELL_COSTS } from './spells';
import type { SpellPolicy } from './ai-profiles';
import type { GridPoint } from './terrain-surface';

export type EnemySpell = 'earthquake' | 'swamp' | 'volcano';
export interface EnemySpellTarget extends GridPoint {
  weight: number;
}
export interface EnemySpellCast {
  spell: EnemySpell;
  target: GridPoint;
}

/** Paid, occasional god attacks, with an opening grace period and no catch-up bursts. */
export class EnemySpellcaster {
  casts = 0;
  spent = 0;
  lastSpell: EnemySpell | null = null;
  lastTarget: GridPoint | null = null;
  private remaining: number;

  constructor(
    private readonly minimumDelay = 75,
    private readonly maximumDelay = 120,
    private readonly policy: Pick<
      SpellPolicy,
      'earthquake' | 'swamp' | 'volcano' | 'targetNoise'
    > = { earthquake: 50, swamp: 30, volcano: 20, targetNoise: 0.2 },
  ) {
    if (
      !Number.isFinite(minimumDelay) ||
      !Number.isFinite(maximumDelay) ||
      minimumDelay <= 0 ||
      maximumDelay < minimumDelay ||
      [policy.earthquake, policy.swamp, policy.volcano, policy.targetNoise].some(
        (value) => !Number.isFinite(value) || value < 0,
      ) ||
      policy.earthquake + policy.swamp + policy.volcano <= 0
    )
      throw new Error('Invalid enemy spell cooldown');
    this.remaining = minimumDelay;
  }

  reset(): void {
    this.casts = 0;
    this.spent = 0;
    this.lastSpell = null;
    this.lastTarget = null;
    this.remaining = this.minimumDelay;
  }

  advance(
    seconds: number,
    budget: { value: number },
    players: readonly EnemySpellTarget[],
    allies: readonly GridPoint[],
    cast: (spell: EnemySpell, target: GridPoint) => boolean,
    random: () => number = Math.random,
  ): EnemySpellCast | null {
    if (!Number.isFinite(seconds) || seconds <= 0) return null;
    if (!players.length || !allies.length) {
      this.remaining = this.minimumDelay;
      return null;
    }
    this.remaining -= seconds;
    if (this.remaining > 1e-9) return null;
    this.remaining = this.minimumDelay + random() * (this.maximumDelay - this.minimumDelay);
    const options: { spell: EnemySpell; weight: number; radius: number }[] = [
      { spell: 'earthquake', weight: this.policy.earthquake, radius: 6 },
      { spell: 'swamp', weight: this.policy.swamp, radius: 10 },
      { spell: 'volcano', weight: this.policy.volcano, radius: 6 },
    ];
    const choices = options.filter(
      (choice) => choice.weight > 0 && budget.value >= SPELL_COSTS[choice.spell],
    );
    if (!choices.length) return null;
    let roll = random() * choices.reduce((sum, choice) => sum + choice.weight, 0);
    const chosen =
      choices.find((choice) => {
        roll -= choice.weight;
        return roll < 0;
      }) ?? choices[choices.length - 1];
    let target: EnemySpellTarget | null = null,
      best = -Infinity;
    for (const candidate of players) {
      // Do not bombard a frontline occupied by the enemy's own army or homes.
      if (
        allies.some((ally) => (ally.x - candidate.x) ** 2 + (ally.z - candidate.z) ** 2 <= 20 ** 2)
      )
        continue;
      const score =
        players.reduce((sum, other) => {
          const distance = Math.hypot(other.x - candidate.x, other.z - candidate.z);
          return (
            sum +
            (distance <= chosen.radius ? other.weight * (1 - distance / (chosen.radius + 1)) : 0)
          );
        }, 0) *
        (1 - this.policy.targetNoise / 2 + random() * this.policy.targetNoise);
      if (score > best) {
        target = candidate;
        best = score;
      }
    }
    if (!target || !cast(chosen.spell, target)) return null;
    this.casts++;
    this.spent += SPELL_COSTS[chosen.spell];
    this.lastSpell = chosen.spell;
    this.lastTarget = { x: target.x, z: target.z };
    return { spell: chosen.spell, target: this.lastTarget };
  }
}
