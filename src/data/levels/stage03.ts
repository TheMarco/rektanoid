import type { LevelDefinition } from '../../types/LevelDefinition';

const S = 'standard';
const T = 'tough';
const H = 'tough3';
const E = 'explosive';
const D = 'drop';
const U = 'sentimentUp';
const R = 'sentimentDown';
const L = 'leverage';
const Z = 'hazard';
const _ = null;

// Falling knife / liquidation waterfall — leverage positions cascade downward
export const stage03: LevelDefinition = {
  id: 'stage03',
  name: 'Liquidation Cascade',
  flavorText: 'Positions are being liquidated...',
  speedMultiplier: 1.1,
  allowedPowerups: null,
  layout: [
    [L, L, L, L, L, L, L, L],
    [E, L, L, R, R, L, L, E],
    [_, E, R, R, R, R, E, _],
    [_, _, Z, R, R, Z, _, _],
    [_, _, _, L, R, _, _, _],
    [_, _, Z, E, E, Z, _, _],
    [_, Z, R, R, R, R, Z, _],
    [_, _, _, D, U, _, _, _],
  ],
};
