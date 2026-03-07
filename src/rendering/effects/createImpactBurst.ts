import Phaser from 'phaser';

export function createImpactBurst(
  scene: Phaser.Scene,
  x: number,
  y: number,
  color: number = 0x00ff88,
  scale: number = 1,
): void {
  const g = scene.add.graphics();
  g.setPosition(x, y);
  g.setBlendMode(Phaser.BlendModes.ADD);

  // Radial lines
  const count = 8;
  const len = 12 * scale;
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2;
    const dx = Math.cos(angle) * len;
    const dy = Math.sin(angle) * len;
    g.lineStyle(1.5, color, 0.8);
    g.lineBetween(0, 0, dx, dy);
  }

  scene.tweens.add({
    targets: g,
    alpha: 0,
    scaleX: 1.5,
    scaleY: 1.5,
    duration: 200,
    onComplete: () => g.destroy(),
  });
}
