import { SPELL_COSTS } from './spells';
import type { KnightPolicy } from './ai-profiles';
import type { CombatCharacter } from './knights';
import type { PopulationColor } from './population';
import type { GridPoint } from './terrain-surface';

export type KnightMuster<C> =
  | { kind: 'gather'; leader: C; recruits: readonly C[] }
  | { kind: 'convert'; leader: C; successor: C }
  | { kind: 'handoff'; leader: C; successor: C };

/** Recruit real citizens, preserve an economic reserve, and train at most a few active knights. */
export class EnemyKnightStrategy<C extends CombatCharacter> {
  phase: 'idle' | 'gathering' | 'handoff' = 'idle';
  commander: C | null = null;
  successor: C | null = null;
  readonly recruits = new Set<C>();
  created = 0;
  dispatched = 0;
  private remaining: number;
  private elapsed = 0;
  readonly targetPower: number;
  readonly knightCap: number;
  readonly normalReserve: number;
  private readonly policy: KnightPolicy;

  constructor(policy: Partial<KnightPolicy> = {}) {
    this.policy = {
      initialDelay: 120,
      cooldown: 150,
      targetPower: 40,
      knightCap: 3,
      normalReserve: 6,
      maxDonors: 3,
      ...policy,
    };
    if (
      Object.values(this.policy).some((value) => !Number.isFinite(value) || value <= 0) ||
      ![this.policy.knightCap, this.policy.normalReserve, this.policy.maxDonors].every(
        Number.isSafeInteger,
      )
    )
      throw new Error('Invalid knight policy');
    this.targetPower = this.policy.targetPower;
    this.knightCap = this.policy.knightCap;
    this.normalReserve = this.policy.normalReserve;
    this.remaining = this.policy.initialDelay;
  }

  get reservedPower(): number {
    return this.phase === 'gathering' ? SPELL_COSTS.knight : 0;
  }
  holds(character: C): boolean {
    return this.phase !== 'idle' && character === this.commander;
  }
  donates(character: C): boolean {
    return this.phase === 'gathering' && this.recruits.has(character);
  }
  follows(character: C): boolean {
    return this.donates(character) || (this.phase === 'handoff' && character === this.successor);
  }
  isSuccessor(character: C): boolean {
    return this.phase === 'handoff' && character === this.successor;
  }

  cancel(): void {
    this.phase = 'idle';
    this.commander = null;
    this.successor = null;
    this.recruits.clear();
    this.elapsed = 0;
    this.remaining = 30;
  }
  reset(): void {
    this.cancel();
    this.remaining = this.policy.initialDelay;
    this.created = 0;
    this.dispatched = 0;
  }
  converted(): void {
    if (this.phase !== 'gathering' || !this.commander?.knight) return;
    this.created++;
    this.phase = 'handoff';
    this.elapsed = 0;
    this.recruits.clear();
  }
  complete(successor: C): boolean {
    if (!this.isSuccessor(successor)) return false;
    this.dispatched++;
    this.cancel();
    this.remaining = this.policy.cooldown;
    return true;
  }

  advance(
    seconds: number,
    characters: readonly C[],
    owner: C | null,
    population: PopulationColor,
    budget: { value: number },
    positionOf: (character: C) => GridPoint,
    available: (character: C) => boolean,
  ): KnightMuster<C> | null {
    if (!Number.isFinite(seconds) || seconds <= 0) return null;
    const living = characters.filter(
      (c) => c.population === population && c.characterPower > 0 && c.survival.phase === 'alive',
    );
    const normals = living.filter((c) => !c.knight);
    const healthy = (c: C | null): c is C => !!c && living.includes(c);
    const near = (origin: C, candidates: readonly C[]): C[] => {
      const point = positionOf(origin);
      return candidates
        .filter((c) => c !== origin && available(c))
        .slice()
        .sort((a, b) => {
          const p = positionOf(a),
            q = positionOf(b);
          return (
            Number(!!a.home) - Number(!!b.home) ||
            (p.x - point.x) ** 2 +
              (p.z - point.z) ** 2 -
              ((q.x - point.x) ** 2 + (q.z - point.z) ** 2)
          );
        });
    };
    if (this.phase !== 'idle') {
      this.elapsed += seconds;
      if (!healthy(this.commander) || owner !== this.commander || this.elapsed > 75) {
        this.cancel();
        return null;
      }
      if (this.phase === 'handoff') {
        if (!healthy(this.successor) || this.successor.knight) {
          this.successor = near(this.commander, normals)[0] ?? null;
          if (!this.successor) {
            this.cancel();
            return null;
          }
          return { kind: 'handoff', leader: this.commander, successor: this.successor };
        }
        return null;
      }
      if (normals.length - 1 < this.normalReserve) {
        this.cancel();
        return null;
      }
      if (!healthy(this.successor) || this.successor.knight) {
        this.successor = near(this.commander, normals).find((c) => !this.recruits.has(c)) ?? null;
        if (!this.successor) {
          this.cancel();
          return null;
        }
      }
      if (
        this.commander.characterPower >= this.targetPower &&
        !this.commander.home &&
        budget.value >= SPELL_COSTS.knight &&
        this.successor
      ) {
        return { kind: 'convert', leader: this.commander, successor: this.successor };
      }
      return null;
    }
    this.remaining -= seconds;
    if (this.remaining > 1e-9) return null;
    this.remaining = 20;
    if (!healthy(owner) || !available(owner)) return null;
    const candidates = near(owner, normals);
    if (owner.knight) {
      if (normals.length < this.normalReserve || !candidates[0]) return null;
      this.commander = owner;
      this.successor = candidates[0];
      this.phase = 'handoff';
      this.elapsed = 0;
      return { kind: 'handoff', leader: owner, successor: this.successor };
    }
    const knights = characters.filter(
      (c) =>
        c.population === population &&
        c.knight &&
        c.characterPower > 0 &&
        (c.survival.phase === 'alive' || c.survival.phase === 'drowning'),
    ).length;
    if (
      knights >= this.knightCap ||
      budget.value < SPELL_COSTS.knight ||
      normals.length - 1 < this.normalReserve
    )
      return null;
    const recruits: C[] = [];
    let power = owner.characterPower;
    const maximum = Math.min(this.policy.maxDonors, normals.length - this.normalReserve - 1);
    const nearest = candidates.slice(0, maximum);
    const donors =
      power + nearest.reduce((sum, c) => sum + c.characterPower, 0) >= this.targetPower
        ? nearest
        : candidates
            .slice()
            .sort((a, b) => b.characterPower - a.characterPower)
            .slice(0, maximum);
    for (const candidate of donors) {
      if (power >= this.targetPower || recruits.length >= maximum) break;
      recruits.push(candidate);
      power += candidate.characterPower;
    }
    const successor = candidates.find((c) => !recruits.includes(c));
    if (power < this.targetPower || !successor) return null;
    this.commander = owner;
    this.successor = successor;
    this.phase = 'gathering';
    this.elapsed = 0;
    recruits.forEach((c) => this.recruits.add(c));
    return { kind: 'gather', leader: owner, recruits };
  }
}
