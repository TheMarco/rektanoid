/**
 * Thin adapter for RetroZone integration.
 * Centralizes all imports from retrozone so the rest of the game
 * doesn't depend on retrozone internals directly.
 */
import {
  RetroDisplay,
  drawGlowLine,
  drawGlowCircle,
  drawGlowPolygon,
  drawGlowArc,
  drawGlowEllipse,
  drawGlowDiamond,
  vectorText,
  vectorTextWidth,
  ExplosionRenderer,
} from 'retrozone';

export {
  RetroDisplay,
  drawGlowLine,
  drawGlowCircle,
  drawGlowPolygon,
  drawGlowArc,
  drawGlowEllipse,
  drawGlowDiamond,
  vectorText,
  vectorTextWidth,
  ExplosionRenderer,
};

let retroDisplay: RetroDisplay | null = null;

export function initRetroDisplay(canvas: HTMLCanvasElement, mode: 'vector' | 'crt' = 'vector'): RetroDisplay {
  if (retroDisplay) {
    retroDisplay.destroy();
  }
  retroDisplay = new RetroDisplay(canvas);
  retroDisplay.setMode(mode);
  return retroDisplay;
}

export function getRetroDisplay(): RetroDisplay | null {
  return retroDisplay;
}

export function destroyRetroDisplay(): void {
  if (retroDisplay) {
    retroDisplay.destroy();
    retroDisplay = null;
  }
}

/**
 * Create a Phaser Graphics object configured for glow rendering.
 * RetroZone glow functions need ADD blend mode.
 */
export function createGlowGraphics(scene: Phaser.Scene): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics();
  g.setBlendMode(Phaser.BlendModes.ADD);
  return g;
}
