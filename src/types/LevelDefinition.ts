export interface LevelDefinition {
  id: string;
  name: string;
  flavorText: string;
  /** 2D grid of brick type IDs. null = empty cell */
  layout: (string | null)[][];
  /** Speed multiplier for this stage */
  speedMultiplier: number;
  /** Allowed powerup IDs for this stage (null = all) */
  allowedPowerups: string[] | null;
}
