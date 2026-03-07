import type { LevelDefinition } from '../../types/LevelDefinition';

const S = 'standard';
const T = 'tough';
const H = 'tough3';
const E = 'explosive';
const D = 'drop';
const U = 'sentimentUp';
const I = 'indestructible';
const Z = 'hazard';
const _ = null;

// Maze with corridors — DeFi yield farming paths
export const stage08: LevelDefinition = {
  id: 'stage08',
  name: 'DeFi Maze',
  flavorText: 'Yield farming through the labyrinth.',
  speedMultiplier: 1.3,
  allowedPowerups: null,
  layout: [
    [I, I, I, I, I, _, _, I, I, I, I, I],
    [I, D, _, _, _, _, _, _, _, _, D, I],
    [I, _, I, I, I, I, _, I, I, I, _, I],
    [I, _, I, U, _, _, _, _, S, I, _, I],
    [I, _, _, T, _, I, I, _, T, _, _, I],
    [I, _, I, S, _, _, _, _, U, I, _, I],
    [I, _, I, I, I, _, I, I, I, I, _, I],
    [I, D, _, _, _, _, _, _, _, _, D, I],
    [I, I, I, I, _, E, E, _, I, I, I, I],
  ],
};
