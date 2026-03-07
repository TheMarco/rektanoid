import Phaser from 'phaser';

export function createGlowFlash(
  scene: Phaser.Scene,
  x: number,
  y: number,
  color: number = 0x00ff88,
  radius: number = 30,
): void {
  const g = scene.add.graphics();
  g.setPosition(x, y);
  g.setBlendMode(Phaser.BlendModes.ADD);
  g.fillStyle(color, 0.4);
  g.fillCircle(0, 0, radius);

  scene.tweens.add({
    targets: g,
    alpha: 0,
    scaleX: 2,
    scaleY: 2,
    duration: 300,
    ease: 'Quad.easeOut',
    onComplete: () => g.destroy(),
  });
}
