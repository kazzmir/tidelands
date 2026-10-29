import { difficultyProfile, type Difficulty } from './ai-profiles';
import { worldDimension, STARTING_POWER, type WorldSize } from './game-settings';
import { SimulationGame } from './simulation/game';
import { eliminationWinner, type GameWinner } from './game-result';
import { CastleSoundTracker, type GameSound } from './game-audio';

/** One real AI-vs-AI match, not the short looping startup demo. No human command API. */
export class WatchSimulation {
  readonly round = 1;
  readonly maxStepsPerFrame = 2;
  readonly stepSeconds = 0.25;
  paused = false;
  outcome: GameWinner | null = null;
  private match: SimulationGame | null;
  private accumulator = 0;
  private readonly castles = new CastleSoundTracker();
  constructor(
    difficulty: Difficulty,
    worldSize: WorldSize,
    seed: number,
    private readonly sound: (sound: GameSound) => void = () => {},
  ) {
    const profile = difficultyProfile(difficulty);
    this.match = new SimulationGame({
      seed,
      red: profile,
      blue: profile,
      scenario: 'generated',
      size: worldDimension(worldSize),
      startingPower: STARTING_POWER,
      seconds: 7200,
      step: this.stepSeconds,
      finaleSeconds: 0,
    });
  }
  get game(): SimulationGame {
    if (!this.match) throw new Error('Watch simulation disposed');
    return this.match;
  }
  get disposed(): boolean {
    return this.match === null;
  }
  advance(seconds: number): number {
    if (
      this.disposed ||
      this.paused ||
      this.outcome !== null ||
      !Number.isFinite(seconds) ||
      seconds <= 0
    )
      return 0;
    this.accumulator = Math.min(
      this.accumulator + Math.min(seconds, 0.05),
      this.stepSeconds * this.maxStepsPerFrame,
    );
    let steps = 0;
    while (this.accumulator + 1e-9 >= this.stepSeconds && steps < this.maxStepsPerFrame) {
      const before = this.game.sides.map((s) => ({
        spells: s.spells.casts,
        knights: s.knights.created,
      }));
      this.game.step(this.stepSeconds);
      this.accumulator = Math.max(0, this.accumulator - this.stepSeconds);
      steps++;
      this.game.sides.forEach((side, i) => {
        if (side.spells.casts > before[i]!.spells && side.spells.lastSpell)
          this.sound(side.spells.lastSpell);
        if (side.knights.created > before[i]!.knights) this.sound('knight');
      });
      if (
        this.castles.update(
          this.game.people
            .filter((c) => c.home && c.power === 5 && c.characterPower > 0)
            .map((c) => `${c.population}:${c.home!.index}`),
        )
      )
        this.sound('castle');
      this.outcome = eliminationWinner(this.game.people);
      if (this.outcome !== null) {
        this.paused = true;
        this.accumulator = 0;
        break;
      }
    }
    return steps;
  }
  dispose(): void {
    this.match = null;
    this.accumulator = 0;
    this.castles.reset();
  }
}
