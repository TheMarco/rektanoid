export interface RenderRecipeParams {
  color: number;
  width: number;
  height: number;
  glowIntensity?: number;
  pulseSpeed?: number;
  damageLevel?: number;
}

export interface FXPreset {
  color: number;
  alpha: number;
  radius: number;
  duration: number;
  blendMode: number;
}
