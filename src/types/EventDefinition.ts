import type { MarketStateId } from './MarketState';

export type EventId =
  | 'flashCrash'
  | 'shortSqueeze'
  | 'exchangeOutage'
  | 'gasWar'
  | 'secProbe'
  | 'deadCatBounce';

export interface EventContext {
  nowMs: number;
  stageNumber: number;
  sentiment: number;
  combo: number;
  marketState: MarketStateId;
  // Facades - kept lightweight, Game provides implementations
  addCallout: (x: number, y: number, text: string, color: string, size: number) => void;
  flashScreen: (color: number, intensity: number) => void;
  adjustSentiment: (delta: number) => void;
  getActiveBrickCount: () => number;
  setBallSpeedMultiplier: (mult: number) => void;
  setHazardBias: (bias: number) => void;
  addTickerMessage: (msg: string) => void;
  setSellWallAccelerated: (active: boolean) => void;
}

export interface EventDefinition {
  id: EventId;
  label: string;
  durationMs: number;
  cooldownMs: number;
  baseWeight: number;
  allowedStages: number[];
  allowedStates?: MarketStateId[];
  startCallout: string;
  tickerMessages: string[];
  applyStart?: (ctx: EventContext) => void;
  applyTick?: (ctx: EventContext, dt: number, elapsed: number) => void;
  applyEnd?: (ctx: EventContext) => void;
}

export interface ActiveEvent {
  id: EventId;
  elapsedMs: number;
  durationMs: number;
  cooldownRemainingMs: number;
  startedAtMs: number;
}
