import type { Difficulty } from './ai-profiles';

export const STARTING_POWER = 500;
export type WorldSize = 'small' | 'medium' | 'large';
export interface NewGameSettings {
  difficulty: Difficulty;
  worldSize: WorldSize;
}

export function worldDimension(size: WorldSize): number {
  const dimensions: Record<WorldSize, number> = { small: 200, medium: 350, large: 500 };
  return dimensions[size];
}
export function newGameSettings(difficulty: string, worldSize: string): NewGameSettings | null {
  if (difficulty !== 'easy' && difficulty !== 'normal' && difficulty !== 'hard') return null;
  if (worldSize !== 'small' && worldSize !== 'medium' && worldSize !== 'large') return null;
  return { difficulty, worldSize };
}
