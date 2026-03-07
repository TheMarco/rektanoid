import Phaser from 'phaser';

interface Shard {
  x: number;
  y: number;
  vx: number;
  vy: number;
  w: number;
  h: number;
  rot: number;
  rotSpeed: number;
  alpha: number;
}

export function createBrickShards(
  scene: Phaser.Scene,
  x: number,
  y: number,
  color: number,
  count: number = 6,
): void {
  const shards: Shard[] = [];

  for (let i = 0; i < count; i++) {
    shards.push({
      x: 0,
      y: 0,
      vx: (Math.random() - 0.5) * 200,
      vy: (Math.random() - 0.5) * 200 - 50,
      w: 4 + Math.random() * 8,
      h: 3 + Math.random() * 5,
      rot: Math.random() * Math.PI,
      rotSpeed: (Math.random() - 0.5) * 6,
      alpha: 1,
    });
  }

  const g = scene.add.graphics();
  g.setPosition(x, y);
  g.setBlendMode(Phaser.BlendModes.ADD);

  let elapsed = 0;
  const duration = 600;

  const timer = scene.time.addEvent({
    delay: 16,
    repeat: Math.ceil(duration / 16),
    callback: () => {
      elapsed += 16;
      const t = elapsed / duration;
      g.clear();

      for (const s of shards) {
        s.x += s.vx * 0.016;
        s.y += s.vy * 0.016;
        s.vy += 150 * 0.016; // gravity
        s.rot += s.rotSpeed * 0.016;
        s.alpha = 1 - t;

        g.save();
        g.fillStyle(color, s.alpha * 0.6);
        g.fillRect(s.x - s.w / 2, s.y - s.h / 2, s.w, s.h);
        g.restore();
      }

      if (t >= 1) {
        g.destroy();
        timer.destroy();
      }
    },
  });
}
