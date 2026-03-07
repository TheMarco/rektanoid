export interface BrickDefinition {
  id: string;
  name: string;
  hp: number;
  score: number;
  destructible: boolean;
  /** Sentiment delta when destroyed: positive = bullish, negative = bearish */
  sentimentDelta: number;
  /** Base chance 0-1 of dropping a powerup */
  dropChance: number;
  /** Key into the render recipe system */
  renderKey: string;
  /** Color tint (hex number) */
  color: number;
  /** Optional: explodes on destroy, damaging neighbors */
  explosive?: boolean;
  /** Optional: spawns hazard on destroy */
  hazard?: boolean;
}
