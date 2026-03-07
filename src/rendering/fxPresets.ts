import { COL_GREEN, COL_RED, COL_GOLD, COL_CYAN } from './colorTokens';
import type { FXPreset } from './renderTypes';

export const FX_IMPACT: FXPreset = {
  color: COL_GREEN,
  alpha: 0.8,
  radius: 12,
  duration: 200,
  blendMode: 1, // ADD
};

export const FX_COMBO: FXPreset = {
  color: COL_GOLD,
  alpha: 0.6,
  radius: 20,
  duration: 400,
  blendMode: 1,
};

export const FX_WARNING: FXPreset = {
  color: COL_RED,
  alpha: 0.5,
  radius: 40,
  duration: 500,
  blendMode: 1,
};

export const FX_SHIELD: FXPreset = {
  color: COL_CYAN,
  alpha: 0.4,
  radius: 30,
  duration: 300,
  blendMode: 1,
};

export const FX_BULL_PULSE: FXPreset = {
  color: COL_GREEN,
  alpha: 0.3,
  radius: 50,
  duration: 600,
  blendMode: 1,
};

export const FX_BEAR_DIM: FXPreset = {
  color: COL_RED,
  alpha: 0.15,
  radius: 60,
  duration: 800,
  blendMode: 1,
};
