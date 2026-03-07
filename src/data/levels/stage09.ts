import type { LevelDefinition } from '../../types/LevelDefinition';

const S = 'standard';
const T = 'tough';
const H = 'tough3';
const E = 'explosive';
const D = 'drop';
const R = 'sentimentDown';
const I = 'indestructible';
const Z = 'hazard';
const _ = null;

// Skull/danger pattern — tight grid with hazards everywhere
export const stage09: LevelDefinition = {
  id: 'stage09',
  name: 'Margin Call',
  flavorText: 'Leveraged 100x. No way out.',
  speedMultiplier: 1.35,
  allowedPowerups: null,
  layout: [
    [_, _, H, H, H, H, H, H, H, H, _, _],
    [_, H, Z, H, T, T, T, T, H, Z, H, _],
    [H, H, _, H, T, _, _, T, H, _, H, H],
    [H, T, _, _, T, T, T, T, _, _, T, H],
    [H, T, T, _, _, _, _, _, _, T, T, H],
    [H, _, T, _, H, _, _, H, _, T, _, H],
    [_, H, T, T, _, D, D, _, T, T, H, _],
    [_, _, H, T, T, E, E, T, T, H, _, _],
    [_, _, _, H, H, R, R, H, H, _, _, _],
  ],
};
