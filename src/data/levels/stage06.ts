import type { LevelDefinition } from '../../types/LevelDefinition';

const S = 'standard';
const T = 'tough';
const H = 'tough3';
const E = 'explosive';
const D = 'drop';
const R = 'sentimentDown';
const Z = 'hazard';
const I = 'indestructible';
const L = 'leverage';
const _ = null;

// Descending staircase chart — bear market crash with leveraged positions
export const stage06: LevelDefinition = {
  id: 'stage06',
  name: 'Bear Market',
  flavorText: 'The charts only go right... and down.',
  speedMultiplier: 1.2,
  allowedPowerups: null,
  layout: [
    [R, R, R, R, _, _, _, _],
    [I, I, R, L, _, _, _, _],
    [_, _, R, R, R, _, _, _],
    [_, _, I, I, R, L, _, _],
    [_, _, _, _, T, R, R, _],
    [_, _, _, _, I, I, R, R],
    [_, _, _, _, _, _, H, R],
    [_, _, _, _, _, _, D, E],
  ],
};
