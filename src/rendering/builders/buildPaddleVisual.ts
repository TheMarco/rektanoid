import Phaser from 'phaser';
import { COL_CYAN, COL_GREEN } from '../colorTokens';
import { PADDLE_HEIGHT } from '../../data/balance';

export function buildPaddleVisual(
  scene: Phaser.Scene,
  width: number,
): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics();
  const hw = width / 2;
  const hh = PADDLE_HEIGHT / 2;
  const color = COL_CYAN;

  // Main body fill
  g.fillStyle(color, 0.25);
  g.fillRect(-hw, -hh, width, PADDLE_HEIGHT);

  // Bright border
  g.lineStyle(2, color, 0.9);
  g.strokeRect(-hw, -hh, width, PADDLE_HEIGHT);

  // Inner highlight line
  g.lineStyle(1, COL_GREEN, 0.4);
  g.lineBetween(-hw + 4, 0, hw - 4, 0);

  // Edge indicators
  g.fillStyle(color, 0.7);
  g.fillRect(-hw, -hh, 3, PADDLE_HEIGHT);
  g.fillRect(hw - 3, -hh, 3, PADDLE_HEIGHT);

  return g;
}
