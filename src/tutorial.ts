import type { GridPoint } from './terrain-surface';
export type TutorialStep = 'house' | 'fortress' | 'pole' | 'knight' | 'spell' | 'complete';
export interface TutorialFacts {
  housed: boolean;
  fortress: boolean;
  poleRecovered: boolean;
  knight: boolean;
}
/** A deliberately small, safe practice island; normal worlds and economies are unchanged. */
export class Tutorial {
  readonly size = 150;
  readonly center = { x: 68, z: 75 };
  readonly playerStart = { x: 64, z: 75 };
  readonly enemyStart = { x: 82, z: 75 };
  readonly raise = { x: 69, z: 76 };
  readonly lower = { x: 67, z: 74 };
  readonly pole = { x: 63, z: 72 };
  readonly levels: Uint8Array;
  step: TutorialStep = 'house';
  private raised = false;
  private lowered = false;
  private movedPole = false;
  constructor() {
    this.levels = new Uint8Array((this.size + 1) ** 2);
    for (let z = 0; z <= this.size; z++)
      for (let x = 0; x <= this.size; x++) {
        const distance = Math.max(Math.abs(x - this.center.x), Math.abs(z - this.center.z));
        this.levels[z * (this.size + 1) + x] = distance <= 22 ? 2 : distance <= 23 ? 1 : 0;
      }
    this.levels[this.raise.z * (this.size + 1) + this.raise.x] = 1;
    this.levels[this.lower.z * (this.size + 1) + this.lower.x] = 3;
  }
  get target(): GridPoint {
    return this.step === 'house'
      ? this.raise
      : this.step === 'fortress'
        ? this.lower
        : this.step === 'pole' || this.step === 'knight'
          ? this.pole
          : this.enemyStart;
  }
  get allowedSpell(): string | null {
    return this.step === 'pole'
      ? 'pole'
      : this.step === 'knight'
        ? 'knight'
        : this.step === 'spell'
          ? 'earthquake'
          : null;
  }
  canEdit(point: GridPoint, delta: number, wholeSurface: boolean): boolean {
    return (
      !wholeSurface &&
      point.x === this.target.x &&
      point.z === this.target.z &&
      ((this.step === 'house' && delta === 1 && !this.raised) ||
        (this.step === 'fortress' && delta === -1 && !this.lowered))
    );
  }
  edited(): void {
    if (this.step === 'house') this.raised = true;
    else if (this.step === 'fortress') this.lowered = true;
  }
  canCast(spell: string, point?: GridPoint): boolean {
    return (
      spell === this.allowedSpell &&
      (spell === 'knight' || (!!point && point.x === this.target.x && point.z === this.target.z))
    );
  }
  cast(spell: string): void {
    if (this.step === 'pole' && spell === 'pole') this.movedPole = true;
    if (this.step === 'spell' && spell === 'earthquake') this.step = 'complete';
  }
  update(facts: TutorialFacts): void {
    if (this.step === 'house' && this.raised && facts.housed) this.step = 'fortress';
    else if (this.step === 'fortress' && this.lowered && facts.fortress) this.step = 'pole';
    else if (this.step === 'pole' && this.movedPole && facts.poleRecovered) this.step = 'knight';
    else if (this.step === 'knight' && facts.knight) this.step = 'spell';
  }
}
export function tutorialCopy(step: TutorialStep): {
  title: string;
  detail: string;
  button: string;
} {
  switch (step) {
    case 'house':
      return {
        title: '1 / 5 · Make room for a house',
        detail:
          'Settlers need flat, dry land. Press Raise land, then tap the gold ring to raise its low corner once. Your builder will settle on the flat tile. This practice world supplies 5,000 power; normal worlds start with 500.',
        button: '#tutorial-raise',
      };
    case 'fortress':
      return {
        title: '2 / 5 · Grow a fortress',
        detail:
          'More connected flat land supports larger homes. Press Lower land, then tap the gold ring to lower the high corner once. Nine flat tiles around your house make a level-five fortress, earning power for spells. On mobile you can also hold still for 0.5 seconds, then release to lower.',
        button: '#tutorial-lower',
      };
    case 'pole':
      return {
        title: '3 / 5 · Move the leader pole',
        detail:
          'Press the highlighted white-pole spell (100 power), then tap the gold ring. Moving the artifact does not teleport a follower: wait for a follower to walk over and pick it up.',
        button: '[data-spell="pole"]',
      };
    case 'knight':
      return {
        title: '4 / 5 · Create a knight',
        detail:
          'Your outdoor pole holder is the leader. Press Knight (1,000 power) to permanently multiply their current HP and strength by 1.5. Knights hunt enemies and do not build houses.',
        button: '[data-spell="knight"]',
      };
    case 'spell':
      return {
        title: '5 / 5 · Strike the enemy',
        detail:
          'Press Earthquake (800 power), then tap the gold ring on the blue enemy fortress. Spells use your accumulated power, not your characters’ HP. The enemy waits while you practise.',
        button: '[data-spell="earthquake"]',
      };
    case 'complete':
      return {
        title: 'Tutorial complete!',
        detail:
          'You raised and lowered land, built a house and fortress, moved and recovered the leader pole, created a knight and struck the enemy with a spell. Start a normal world to play with independent enemy AI, births, combat and the usual 24 settlers / 500 power per side.',
        button: '#tutorial-finish',
      };
  }
}
