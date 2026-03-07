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

// Cascading waterfall / liquidation bars falling left to right
export const stage03: LevelDefinition = {
  id: 'stage03',
  name: 'Liquidation Cascade',
  flavorText: 'Positions are being liquidated...',
  speedMultiplier: 1.1,
  allowedPowerups: null,
  layout: [
    [R, R, R, _, _, _, _, _, _, _, _, _],
    [E, R, R, R, _, _, _, _, _, _, _, _],
    [_, E, R, R, R, _, _, _, _, _, _, _],
    [_, _, Z, T, R, R, _, _, _, _, _, _],
    [_, _, _, Z, T, R, R, _, _, _, _, _],
    [_, _, _, _, Z, T, R, R, _, _, _, _],
    [_, _, _, _, _, Z, T, R, R, _, _, _],
    [_, _, _, _, _, _, D, T, R, R, _, _],
    [_, _, _, _, _, _, _, D, H, R, R, _],
    [_, _, _, _, _, _, _, _, U, H, R, R],
  ],
};
