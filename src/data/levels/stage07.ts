import type { LevelDefinition } from '../../types/LevelDefinition';

const S = 'standard';
const T = 'tough';
const H = 'tough3';
const E = 'explosive';
const D = 'drop';
const U = 'sentimentUp';
const R = 'sentimentDown';
const I = 'indestructible';
const Z = 'hazard';
const _ = null;

// Split in half — left side green, right side mirrored, indestructible wall down center
export const stage07: LevelDefinition = {
  id: 'stage07',
  name: 'The Halving',
  flavorText: 'Block rewards cut in half. Adapt or die.',
  speedMultiplier: 1.25,
  allowedPowerups: null,
  layout: [
    [U, S, T, S, D, I, I, D, S, T, S, R],
    [S, T, H, T, _, I, I, _, T, H, T, S],
    [T, S, E, _, _, I, I, _, _, E, S, T],
    [S, H, _, _, _, I, I, _, _, _, H, S],
    [D, _, _, _, _, I, I, _, _, _, _, D],
    [S, H, _, _, _, I, I, _, _, _, H, S],
    [T, S, E, _, _, I, I, _, _, E, S, T],
    [S, T, H, T, _, I, I, _, T, H, T, S],
    [U, S, T, S, D, I, I, D, S, T, S, R],
  ],
};
