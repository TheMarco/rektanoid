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
  /** Optional: has countdown timer — bonus if destroyed in time, explodes if not */
  fomo?: boolean;
  /** Optional: indestructible in neutral sentiment, destructible when depegged */
  stable?: boolean;
  /** Optional: score multiplies on each hit, but spawns hazards */
  leverage?: boolean;
  /** Optional: neighbors fall when destroyed */
  rug?: boolean;
  /** Optional: high HP tank, drops multiple powerups */
  whale?: boolean;
  /** Optional: converts adjacent same-type bricks to standard on destroy */
  influencer?: boolean;
  /** Optional: immune to explosions, 3x score + guaranteed powerup */
  diamond?: boolean;
}
