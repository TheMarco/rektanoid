import type { LevelDefinition } from '../../types/LevelDefinition';

const S = 'standard';
const T = 'tough';
const H = 'tough3';
const E = 'explosive';
const D = 'drop';
const R = 'sentimentDown';
const I = 'indestructible';
const Z = 'hazard';
const G = 'rug';
const _ = null;

// Skull/danger pattern — tight grid with hazards and rug pulls
export const stage09: LevelDefinition = {
  id: 'stage09',
  name: 'Margin Call',
  flavorText: 'Leveraged 100x. No way out.',
  speedMultiplier: 1.35,
  allowedPowerups: null,
  layout: [
    [_, H, H, H, H, H, H, _],
    [H, Z, H, T, T, H, Z, H],
    [H, _, H, G, G, H, _, H],
    [H, T, _, _, _, _, T, H],
    [H, T, _, H, H, _, T, H],
    [H, _, T, _, _, T, _, H],
    [_, H, T, D, D, T, H, _],
    [_, _, H, E, E, H, _, _],
  ],
};
