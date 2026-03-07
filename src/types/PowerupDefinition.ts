export interface PowerupDefinition {
  id: string;
  name: string;
  positive: boolean;
  /** Duration in ms, 0 = instant */
  duration: number;
  renderKey: string;
  color: number;
  /** Short label for HUD */
  label: string;
}
