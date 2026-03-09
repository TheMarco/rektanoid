import type { LevelDefinition } from '../../types/LevelDefinition';

const S = 'standard';
const T = 'tough';
const H = 'tough3';
const E = 'explosive';
const D = 'drop';
const U = 'sentimentUp';
const R = 'sentimentDown';
const I = 'indestructible';
const C = 'stable';
const M = 'diamond';
const G = 'rug';
const _ = null;

// Diamond shape around halving wall — stablecoins and diamonds frame the event
export const stage07: LevelDefinition = {
  id: 'stage07',
  name: 'The Halving',
  flavorText: 'Block rewards cut in half. Adapt or die.',
  speedMultiplier: 1.25,
  allowedPowerups: null,
  layout: [
    [M, S, S, I, I, S, S, M],
    [S, T, S, I, I, C, _, S],
    [T, S, M, I, I, M, _, T],
    [D, _, M, I, I, M, _, D],
    [T, C, G, I, I, G, C, T],
    [S, _, C, I, I, C, _, S],
    [U, S, _, I, I, _, C, U],
    [M, S, S, I, I, S, S, M],
  ],
};
