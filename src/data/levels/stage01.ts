import type { LevelDefinition } from '../../types/LevelDefinition';

const S = 'standard';
const T = 'tough';
const D = 'drop';
const U = 'sentimentUp';
const _ = null;

// Bitcoin "B" shape
export const stage01: LevelDefinition = {
  id: 'stage01',
  name: 'Genesis Block',
  flavorText: 'Every degen starts somewhere...',
  speedMultiplier: 1.0,
  allowedPowerups: null,
  layout: [
    [_, S, S, S, S, S, S, _, _, _, _, _],
    [_, S, _, _, _, _, S, S, _, _, _, _],
    [_, S, _, _, _, _, _, S, _, _, _, _],
    [_, S, _, _, _, _, S, S, _, _, _, _],
    [_, S, S, S, S, S, S, _, _, _, _, _],
    [_, S, _, _, _, _, S, T, _, _, _, _],
    [_, S, _, _, _, _, _, T, _, _, _, _],
    [_, S, _, _, _, D, S, T, _, _, _, _],
    [_, S, S, S, S, S, S, _, _, _, _, _],
  ],
};
