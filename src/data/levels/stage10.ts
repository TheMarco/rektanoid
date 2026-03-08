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
const F = 'fomo';
const C = 'stable';
const L = 'leverage';
const G = 'rug';
const W = 'whale';
const N = 'influencer';
const M = 'diamond';
const _ = null;

// Ascending channel — all brick types, diagonal density rising to breakout
export const stage10: LevelDefinition = {
  id: 'stage10',
  name: 'The Flippening',
  flavorText: 'This is it. The final boss candle.',
  speedMultiplier: 1.4,
  allowedPowerups: null,
  layout: [
    [_, _, _, _, _, F, M, F],
    [_, _, _, _, W, L, L, W],
    [_, _, _, N, H, G, N, _],
    [_, _, T, H, E, H, _, _],
    [_, _, U, R, U, R, _, _],
    [_, C, T, Z, Z, T, C, _],
    [I, S, H, S, E, S, _, _],
    [L, L, S, D, D, S, _, _],
    [R, R, Z, R, R, _, _, _],
    [W, I, H, I, _, _, _, _],
    [M, D, M, _, _, _, _, _],
  ],
};
