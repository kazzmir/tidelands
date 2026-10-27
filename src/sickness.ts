export interface SickCharacter {
  characterPower: number;
  sick: boolean;
}

/** Infection persists after leaving swamp; character power is also their health. */
export function advanceSickness(
  character: SickCharacter,
  seconds: number,
  onSwamp: boolean,
): boolean {
  if (onSwamp) character.sick = true;
  if (character.sick && Number.isFinite(seconds) && seconds > 0) {
    character.characterPower = Math.max(0, character.characterPower - seconds);
  }
  return character.characterPower <= 0;
}
