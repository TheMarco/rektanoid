export interface RiskProfile {
  id: string;
  name: string;
  label: string;
  description: string;
  color: string;
  modifiers: {
    lives: number;
    ballSpeedMult: number;
    scoreMult: number;
    hazardFreqMult: number;
    powerupDropMult: number;
    fomoTimerMult: number;
  };
}

export const RISK_PROFILES: RiskProfile[] = [
  {
    id: 'spot',
    name: 'Spot',
    label: '1x',
    description: 'Safe. No leverage. Steady gains.',
    color: '#00ff88',
    modifiers: {
      lives: 5,
      ballSpeedMult: 0.9,
      scoreMult: 0.8,
      hazardFreqMult: 0.7,
      powerupDropMult: 1.2,
      fomoTimerMult: 1.3,
    },
  },
  {
    id: 'margin',
    name: 'Margin',
    label: '5x',
    description: 'Standard risk. Standard returns.',
    color: '#ffaa00',
    modifiers: {
      lives: 3,
      ballSpeedMult: 1.0,
      scoreMult: 1.0,
      hazardFreqMult: 1.0,
      powerupDropMult: 1.0,
      fomoTimerMult: 1.0,
    },
  },
  {
    id: 'degen',
    name: 'Degen',
    label: '100x',
    description: 'Max leverage. Moon or zero.',
    color: '#ff2222',
    modifiers: {
      lives: 2,
      ballSpeedMult: 1.15,
      scoreMult: 2.0,
      hazardFreqMult: 1.5,
      powerupDropMult: 0.7,
      fomoTimerMult: 0.7,
    },
  },
];
