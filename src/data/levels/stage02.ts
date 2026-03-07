import type { LevelDefinition } from '../../types/LevelDefinition';

const S = 'standard';
const T = 'tough';
const E = 'explosive';
const D = 'drop';
const U = 'sentimentUp';
const R = 'sentimentDown';
const I = 'indestructible';
const _ = null;

// Bull horns shape — rising chart that crashes
export const stage02: LevelDefinition = {
  id: 'stage02',
  name: 'Bull Trap',
  flavorText: 'Looks green... but is it?',
  speedMultiplier: 1.05,
  allowedPowerups: null,
  layout: [
    [U, _, _, _, _, _, _, _, _, _, _, U],
    [S, U, _, _, _, _, _, _, _, _, U, S],
    [S, S, U, _, _, _, _, _, _, U, S, S],
    [_, S, S, U, _, _, _, _, U, S, S, _],
    [_, _, S, S, T, _, _, T, S, S, _, _],
    [_, _, _, S, S, T, T, S, S, _, _, _],
    [_, _, _, _, D, R, R, D, _, _, _, _],
    [_, _, _, _, _, R, R, _, _, _, _, _],
    [_, _, _, _, _, E, E, _, _, _, _, _],
  ],
};
