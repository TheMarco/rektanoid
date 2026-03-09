import type { EventId } from './EventDefinition';
import type { MarketStateId } from './MarketState';

export interface StageMechanics {
  /** Descending sell walls: row segments that pulse downward */
  sellWalls?: {
    enabled: boolean;
    /** Seconds between sell wall activations */
    intervalMin: number;
    intervalMax: number;
    /** Max rows a single wall can descend before stopping */
    maxDrops: number;
    /** Number of columns the wall spans (2-6) */
    widthMin: number;
    widthMax: number;
  };
  /** Liquidation lanes: telegraphed column strikes */
  liqLanes?: {
    enabled: boolean;
    /** Seconds between lane strike attempts */
    intervalMin: number;
    intervalMax: number;
    /** Max concurrent lane strikes */
    maxConcurrent: number;
  };
  /** Rug-pull collapse intensity (0 = default, higher = wider spread) */
  rugCollapseRadius?: number;
}

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
  mechanics?: StageMechanics;
}
