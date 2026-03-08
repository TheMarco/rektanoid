import type { MarketStateId } from './MarketState';

export interface MarketModifiers {
  state: MarketStateId;
  scoreMultiplier: number;
  hazardBias: number;
  positiveDropBias: number;
  negativeDropBias: number;
  pickupFallSpeedMultiplier: number;
  comboGraceMultiplier: number;
  ballSpeedMultiplier: number;
  eventWeightMultiplier: number;
  visualProfile: {
    trailIntensity: number;
    backgroundPulse: number;
    hudMood: 'panic' | 'neutral' | 'bullish' | 'manic';
    vignetteBias: number;
  };
}
