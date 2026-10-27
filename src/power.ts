/** Accumulates building income at a fixed interval measured in simulation seconds. */
export class PowerMeter {
  value: number;
  private elapsed = 0;
  private rockElapsed = 0;

  constructor(
    readonly interval = 5,
    readonly initialPower = 0,
  ) {
    if (!Number.isFinite(interval) || interval <= 0)
      throw new Error('Power interval must be positive');
    if (!Number.isSafeInteger(initialPower) || initialPower < 0)
      throw new Error('Initial power must be a nonnegative integer');
    this.value = initialPower;
  }

  spend(amount: number): boolean {
    if (!Number.isSafeInteger(amount) || amount < 0 || amount > this.value) return false;
    this.value -= amount;
    return true;
  }

  advance(seconds: number, buildingPower: number, rockBuildingPower = 0): void {
    if (!Number.isFinite(seconds) || seconds <= 0) return;
    this.elapsed += seconds;
    this.rockElapsed += seconds;
    const payouts = Math.floor((this.elapsed + 1e-9) / this.interval);
    const rockPayouts = Math.floor((this.rockElapsed + 1e-9) / (this.interval * 2));
    this.elapsed = Math.max(0, this.elapsed - payouts * this.interval);
    this.rockElapsed = Math.max(0, this.rockElapsed - rockPayouts * this.interval * 2);
    this.value +=
      payouts * Math.max(0, Math.trunc(buildingPower)) +
      rockPayouts * Math.max(0, Math.trunc(rockBuildingPower));
  }

  reset(): void {
    this.value = this.initialPower;
    this.elapsed = 0;
    this.rockElapsed = 0;
  }
}
