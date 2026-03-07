import Phaser from 'phaser';
import { COL_RED } from '../colorTokens';

export function createWarningPulse(
  scene: Phaser.Scene,
  x: number,
  y: number,
  radius: number = 40,
): void {
  const g = scene.add.graphics();
  g.setPosition(x, y);
  g.setBlendMode(Phaser.BlendModes.ADD);
  g.lineStyle(2, COL_RED, 0.5);
  g.strokeCircle(0, 0, radius * 0.5);

  scene.tweens.add({
    targets: g,
    alpha: 0,
    scaleX: 2,
    scaleY: 2,
    duration: 500,
    ease: 'Quad.easeOut',
    onComplete: () => g.destroy(),
  });
}
