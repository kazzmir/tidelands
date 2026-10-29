export type Difficulty = 'easy' | 'normal' | 'hard';
export interface KnightPolicy {
  initialDelay: number;
  cooldown: number;
  targetPower: number;
  knightCap: number;
  normalReserve: number;
  maxDonors: number;
}
export interface SpellPolicy {
  minimumDelay: number;
  maximumDelay: number;
  earthquake: number;
  swamp: number;
  volcano: number;
  targetNoise: number;
}
export interface AIProfile {
  id: string;
  label: string;
  terrainInterval: number;
  spells: SpellPolicy;
  knights: KnightPolicy;
}

/** Policies change decisions, never prices, starting resources, damage, growth, or terrain reach. */
export function aiProfiles(): readonly AIProfile[] {
  return [
    {
      id: 'patient',
      label: 'Patient',
      terrainInterval: 8,
      spells: {
        minimumDelay: 150,
        maximumDelay: 210,
        earthquake: 60,
        swamp: 25,
        volcano: 15,
        targetNoise: 0.7,
      },
      knights: {
        initialDelay: 210,
        cooldown: 240,
        targetPower: 32,
        knightCap: 1,
        normalReserve: 12,
        maxDonors: 3,
      },
    },
    {
      id: 'balanced',
      label: 'Balanced',
      terrainInterval: 4,
      spells: {
        minimumDelay: 75,
        maximumDelay: 120,
        earthquake: 50,
        swamp: 30,
        volcano: 20,
        targetNoise: 0.2,
      },
      knights: {
        initialDelay: 120,
        cooldown: 150,
        targetPower: 40,
        knightCap: 3,
        normalReserve: 6,
        maxDonors: 3,
      },
    },
    {
      id: 'raider',
      label: 'Raider',
      terrainInterval: 4,
      spells: {
        minimumDelay: 110,
        maximumDelay: 160,
        earthquake: 30,
        swamp: 20,
        volcano: 50,
        targetNoise: 0.2,
      },
      knights: {
        initialDelay: 75,
        cooldown: 90,
        targetPower: 40,
        knightCap: 3,
        normalReserve: 8,
        maxDonors: 3,
      },
    },
    {
      id: 'sorcerer',
      label: 'Sorcerer',
      terrainInterval: 4,
      spells: {
        minimumDelay: 45,
        maximumDelay: 75,
        earthquake: 15,
        swamp: 65,
        volcano: 20,
        targetNoise: 0.1,
      },
      knights: {
        initialDelay: 165,
        cooldown: 180,
        targetPower: 40,
        knightCap: 2,
        normalReserve: 10,
        maxDonors: 3,
      },
    },
    {
      id: 'steward',
      label: 'Steward',
      terrainInterval: 4,
      spells: {
        minimumDelay: 100,
        maximumDelay: 150,
        earthquake: 60,
        swamp: 30,
        volcano: 10,
        targetNoise: 0.1,
      },
      knights: {
        initialDelay: 150,
        cooldown: 180,
        targetPower: 50,
        knightCap: 3,
        normalReserve: 12,
        maxDonors: 4,
      },
    },
  ];
}
export function profileById(id: string): AIProfile {
  const profile = aiProfiles().find((profile) => profile.id === id);
  if (!profile) throw new Error(`Unknown AI profile: ${id}`);
  return profile;
}
export function difficultyProfile(difficulty: Difficulty): AIProfile {
  const mapping: Record<Difficulty, string> = {
    easy: 'patient',
    normal: 'balanced',
    hard: 'sorcerer',
  };
  return profileById(mapping[difficulty]);
}
