import { profileById } from './ai-profiles';
import { SimulationGame } from './simulation/game';

/** A separate, bounded AI-vs-AI match. Never touches the player's world, money, or RNG. */
export class AttractSimulation {
  paused: boolean;
  round = 1;
  private match: SimulationGame | null;
  private accumulator = 0;
  // Active real time, deliberately independent of the accelerated game clock.
  private roundElapsed = 0;
  private ended = false;
  readonly stepSeconds = 0.25;
  readonly speed = 6;
  readonly maximumStepsPerFrame = 2;

  constructor(
    paused = false,
    private readonly roundSeconds = 120,
  ) {
    if (!Number.isFinite(roundSeconds) || roundSeconds <= 0 || roundSeconds > 1200)
      throw new Error('Invalid preview duration');
    this.paused = paused;
    this.match = this.newMatch();
  }
  get disposed(): boolean {
    return this.match === null;
  }
  get game(): SimulationGame {
    if (!this.match) throw new Error('Preview has been disposed');
    return this.match;
  }
  get ageSeconds(): number {
    return this.roundElapsed;
  }
  private newMatch(): SimulationGame {
    return new SimulationGame({
      seed: (1099 + this.round * 17) >>> 0,
      red: profileById(this.round % 2 ? 'balanced' : 'raider'),
      blue: profileById('sorcerer'),
      scenario: this.round % 2 ? 'highlands' : 'plains',
      size: 64,
      seconds: this.roundSeconds * this.speed,
      step: this.stepSeconds,
      finaleSeconds: 0,
    });
  }
  advance(realSeconds: number): number {
    if (this.disposed || this.paused || !Number.isFinite(realSeconds) || realSeconds <= 0) return 0;
    this.roundElapsed += realSeconds;
    if (this.roundElapsed + 1e-9 >= this.roundSeconds) {
      this.round++;
      this.match = this.newMatch();
      this.accumulator = 0;
      this.roundElapsed = 0;
      this.ended = false;
      return 0;
    }
    if (this.ended) return 0;
    const dt = Math.min(realSeconds, 0.05);
    this.accumulator = Math.min(
      this.stepSeconds * this.maximumStepsPerFrame,
      this.accumulator + dt * this.speed,
    );
    let steps = 0;
    while (this.accumulator + 1e-9 >= this.stepSeconds && steps < this.maximumStepsPerFrame) {
      this.game.step(this.stepSeconds);
      this.accumulator = Math.max(0, this.accumulator - this.stepSeconds);
      steps++;
      if (!this.game.metrics('red').population || !this.game.metrics('blue').population) {
        this.ended = true;
        this.accumulator = 0;
        break;
      }
    }
    return steps;
  }
  dispose(): void {
    this.match = null;
    this.accumulator = 0;
  }
}
