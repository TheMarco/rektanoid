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

// Giant dollar sign — final boss
export const stage10: LevelDefinition = {
  id: 'stage10',
  name: 'The Flippening',
  flavorText: 'This is it. The final boss candle.',
  speedMultiplier: 1.4,
  allowedPowerups: null,
  layout: [
    [_, _, _, _, _, H, H, _, _, _, _, _],
    [_, _, _, H, H, H, H, H, H, _, _, _],
    [_, _, H, H, Z, _, _, Z, H, H, _, _],
    [_, _, H, H, _, _, _, _, _, _, _, _],
    [_, _, _, H, H, H, _, _, _, _, _, _],
    [_, _, _, _, _, H, H, H, _, _, _, _],
    [_, _, _, _, _, _, _, H, H, _, _, _],
    [_, _, Z, _, _, _, _, H, H, _, _, _],
    [_, _, H, H, _, _, Z, H, H, _, _, _],
    [_, _, _, H, H, H, H, H, _, _, _, _],
    [_, _, _, _, _, H, H, _, _, _, _, _],
    [_, _, _, _, _, D, D, _, _, _, _, _],
  ],
};
