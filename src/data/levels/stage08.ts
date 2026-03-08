import type { LevelDefinition } from '../../types/LevelDefinition';

const S = 'standard';
const T = 'tough';
const E = 'explosive';
const D = 'drop';
const U = 'sentimentUp';
const I = 'indestructible';
const W = 'whale';
const N = 'influencer';
const G = 'rug';
const _ = null;

// Liquidity pool maze — whale walls block paths, influencers at junctions
export const stage08: LevelDefinition = {
  id: 'stage08',
  name: 'DeFi Maze',
  flavorText: 'Yield farming through the labyrinth.',
  speedMultiplier: 1.3,
  allowedPowerups: null,
  layout: [
    [I, W, _, _, _, _, W, I],
    [I, _, I, N, G, I, _, I],
    [I, _, W, _, _, W, _, I],
    [_, _, _, D, U, _, _, _],
    [I, _, W, _, _, W, _, I],
    [I, _, I, G, N, I, _, I],
    [I, W, _, E, E, _, W, I],
    [_, D, _, S, S, _, D, _],
    [_, _, G, _, _, G, _, _],
  ],
};
