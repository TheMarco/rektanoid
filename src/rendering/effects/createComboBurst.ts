import Phaser from 'phaser';
import { COL_GOLD } from '../colorTokens';

export function createComboBurst(
  scene: Phaser.Scene,
  x: number,
  y: number,
  comboLevel: number,
): void {
  const g = scene.add.graphics();
  g.setPosition(x, y);
  g.setBlendMode(Phaser.BlendModes.ADD);

  const ringCount = Math.min(comboLevel, 3);
  for (let i = 0; i < ringCount; i++) {
    const r = 10 + i * 8;
    g.lineStyle(2 - i * 0.5, COL_GOLD, 0.6 - i * 0.15);
    g.strokeCircle(0, 0, r);
  }

  scene.tweens.add({
    targets: g,
    alpha: 0,
    scaleX: 1.8,
    scaleY: 1.8,
    duration: 400,
    ease: 'Quad.easeOut',
    onComplete: () => g.destroy(),
  });
}
