export type SurvivalPhase = 'alive' | 'drowning' | 'sinking' | 'dead';
export interface Survival { phase: SurvivalPhase; elapsed: number }
export const DROWNING_SECONDS = 2;
export const SINKING_SECONDS = 0.8;

export function createSurvival(): Survival {
  return { phase: 'alive', elapsed: 0 };
}

/** Ground restored before death rescues a settler; death and sinking cannot be undone. */
export function advanceSurvival(state: Survival, seconds: number, submerged: boolean): void {
  const dt = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  if (state.phase === 'dead') return;
  if (state.phase !== 'sinking') {
    if (!submerged) { state.phase = 'alive'; state.elapsed = 0; return; }
    if (state.phase === 'alive') { state.phase = 'drowning'; state.elapsed = 0; }
  }
  state.elapsed += dt;
  if (state.phase === 'drowning' && state.elapsed >= DROWNING_SECONDS) {
    state.phase = 'sinking';
    state.elapsed -= DROWNING_SECONDS;
  }
  if (state.phase === 'sinking' && state.elapsed >= SINKING_SECONDS) {
    state.phase = 'dead';
    state.elapsed = SINKING_SECONDS;
  }
}
