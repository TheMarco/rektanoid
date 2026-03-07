import Phaser from 'phaser';
import { COL_GREEN_BRIGHT } from '../colorTokens';
import { BALL_RADIUS } from '../../data/balance';

const TRAIL_LENGTH = 8;
const TRAIL_INTERVAL = 30; // ms

export function createBallTrail(scene: Phaser.Scene): {
  update: (x: number, y: number) => void;
  destroy: () => void;
  graphics: Phaser.GameObjects.Graphics;
} {
  const g = scene.add.graphics();
  g.setBlendMode(Phaser.BlendModes.ADD);
  g.setDepth(0);

  const positions: { x: number; y: number }[] = [];
  let lastTime = 0;

  return {
    graphics: g,
    update(x: number, y: number) {
      const now = scene.time.now;
      if (now - lastTime > TRAIL_INTERVAL) {
        positions.push({ x, y });
        if (positions.length > TRAIL_LENGTH) positions.shift();
        lastTime = now;
      }

      g.clear();
      for (let i = 0; i < positions.length; i++) {
        const t = i / positions.length;
        const r = BALL_RADIUS * t * 0.6;
        g.fillStyle(COL_GREEN_BRIGHT, t * 0.15);
        g.fillCircle(positions[i].x, positions[i].y, r);
      }
    },
    destroy() {
      g.destroy();
    },
  };
}
