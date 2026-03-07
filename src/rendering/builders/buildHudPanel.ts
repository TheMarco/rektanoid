import Phaser from 'phaser';
import { COL_GREEN_DIM, COL_GREEN } from '../colorTokens';

export function buildHudPanel(
  scene: Phaser.Scene,
  width: number,
  height: number,
  color: number = COL_GREEN_DIM,
): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics();
  g.fillStyle(color, 0.1);
  g.fillRect(0, 0, width, height);
  g.lineStyle(1, COL_GREEN, 0.3);
  g.strokeRect(0, 0, width, height);
  return g;
}
