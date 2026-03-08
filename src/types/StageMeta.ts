import type { EventId } from './EventDefinition';
import type { MarketStateId } from './MarketState';

export interface StageMeta {
  stageNumber: number;
  stageName: string;
  eventPool: EventId[];
  dominantBrickTypes: string[];
  preferredMarketMood: MarketStateId | 'mixed';
  dropBias: {
    positive: number;
    negative: number;
  };
  signatureGimmick:
    | 'intro'
    | 'betrayal'
    | 'downward-pressure'
    | 'volatility'
    | 'endurance'
    | 'scarcity'
    | 'maze'
    | 'pressure'
    | 'flip';
  bossId?: string;
}
