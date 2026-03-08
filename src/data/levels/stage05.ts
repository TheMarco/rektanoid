import type { LevelDefinition } from '../../types/LevelDefinition';

const S = 'standard';
const T = 'tough';
const H = 'tough3';
const D = 'drop';
const U = 'sentimentUp';
const E = 'explosive';
const C = 'stable';
const _ = null;

// Ethereum diamond shape — stablecoins at core require sentiment shift to break
export const stage05: LevelDefinition = {
  id: 'stage05',
  name: 'Diamond Formation',
  flavorText: 'Diamond hands never fold.',
  speedMultiplier: 1.15,
  allowedPowerups: null,
  layout: [
    [_, _, _, H, H, _, _, _],
    [_, _, H, T, T, H, _, _],
    [_, H, S, S, S, S, H, _],
    [H, S, U, C, C, U, S, H],
    [H, S, E, C, C, E, S, H],
    [_, H, S, S, S, S, H, _],
    [_, _, H, T, T, H, _, _],
    [_, _, _, D, D, _, _, _],
  ],
};
