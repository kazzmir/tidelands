/** Accumulates building income at a fixed interval measured in simulation seconds. */
export class PowerMeter {
  value = 0;
  private elapsed = 0;

  constructor(readonly interval = 5) {
    if (!Number.isFinite(interval) || interval <= 0) throw new Error('Power interval must be positive');
  }

  advance(seconds: number, buildingPower: number): void {
    if (!Number.isFinite(seconds) || seconds <= 0) return;
    this.elapsed += seconds;
    const payouts = Math.floor((this.elapsed + 1e-9) / this.interval);
    if (!payouts) return;
    this.elapsed = Math.max(0, this.elapsed - payouts * this.interval);
    this.value += payouts * Math.max(0, Math.trunc(buildingPower));
  }

  reset(): void {
    this.value = 0;
    this.elapsed = 0;
  }
}
