import type { LevelDefinition } from '../../types/LevelDefinition';

const S = 'standard';
const T = 'tough';
const E = 'explosive';
const D = 'drop';
const U = 'sentimentUp';
const R = 'sentimentDown';
const F = 'fomo';
const G = 'rug';
const _ = null;

// Two candlesticks: green pump on left, red dump on right — FOMO bricks add urgency
export const stage04: LevelDefinition = {
  id: 'stage04',
  name: 'Pump & Dump',
  flavorText: 'Number go up... then number go down.',
  speedMultiplier: 1.1,
  allowedPowerups: null,
  layout: [
    [_, U, _, _, _, _, _, _],
    [U, U, U, _, _, _, R, _],
    [U, U, U, F, _, R, R, R],
    [U, U, U, D, _, R, R, R],
    [_, U, _, _, _, R, R, R],
    [_, _, _, D, F, G, R, R],
    [_, _, _, _, _, R, R, R],
    [_, _, _, E, E, _, R, _],
  ],
};
