export type MarketStateId = 'bear' | 'neutral' | 'bull' | 'euphoria';

export interface MarketStateConfig {
  id: MarketStateId;
  minSentiment: number;
  maxSentiment: number;
  label: string;
}
