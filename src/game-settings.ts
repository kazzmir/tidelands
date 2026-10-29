import type { Difficulty } from './ai-profiles';

export const STARTING_POWER = 500;
/** Walking tile progress per simulation second, shared by settlers and knights. */
export const CHARACTER_SPEED = 0.715;
export type WorldSize = 'small' | 'medium' | 'large';
export interface NewGameSettings {
  difficulty: Difficulty;
  worldSize: WorldSize;
}

export function worldDimension(size: WorldSize): number {
  const dimensions: Record<WorldSize, number> = { small: 150, medium: 200, large: 300 };
  return dimensions[size];
}
export function newGameSettings(difficulty: string, worldSize: string): NewGameSettings | null {
  if (difficulty !== 'easy' && difficulty !== 'normal' && difficulty !== 'hard') return null;
  if (worldSize !== 'small' && worldSize !== 'medium' && worldSize !== 'large') return null;
  return { difficulty, worldSize };
}
