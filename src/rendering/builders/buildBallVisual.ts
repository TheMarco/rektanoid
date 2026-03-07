import Phaser from 'phaser';
import { COL_GREEN_BRIGHT } from '../colorTokens';
import { BALL_RADIUS } from '../../data/balance';

export function buildBallVisual(scene: Phaser.Scene): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics();
  const color = COL_GREEN_BRIGHT;

  // Outer glow
  g.fillStyle(color, 0.1);
  g.fillCircle(0, 0, BALL_RADIUS * 2.5);

  // Mid glow
  g.fillStyle(color, 0.25);
  g.fillCircle(0, 0, BALL_RADIUS * 1.5);

  // Core
  g.fillStyle(color, 0.9);
  g.fillCircle(0, 0, BALL_RADIUS);

  // Bright center
  g.fillStyle(0xffffff, 0.6);
  g.fillCircle(0, 0, BALL_RADIUS * 0.4);

  return g;
}
