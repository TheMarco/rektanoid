import type { LevelDefinition } from '../../types/LevelDefinition';

const S = 'standard';
const T = 'tough';
const H = 'tough3';
const D = 'drop';
const U = 'sentimentUp';
const E = 'explosive';
const _ = null;

// Ethereum diamond shape
export const stage05: LevelDefinition = {
  id: 'stage05',
  name: 'Diamond Formation',
  flavorText: 'Diamond hands never fold.',
  speedMultiplier: 1.15,
  allowedPowerups: null,
  layout: [
    [_, _, _, _, _, H, H, _, _, _, _, _],
    [_, _, _, _, H, T, T, H, _, _, _, _],
    [_, _, _, H, S, S, S, S, H, _, _, _],
    [_, _, H, S, S, D, D, S, S, H, _, _],
    [_, H, S, S, U, S, S, U, S, S, H, _],
    [H, S, S, E, S, D, D, S, E, S, S, H],
    [_, H, S, S, S, S, S, S, S, S, H, _],
    [_, _, H, S, S, S, S, S, S, H, _, _],
    [_, _, _, H, T, S, S, T, H, _, _, _],
    [_, _, _, _, H, T, T, H, _, _, _, _],
    [_, _, _, _, _, H, H, _, _, _, _, _],
  ],
};
