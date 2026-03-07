import Phaser from 'phaser';
import { drawGlowPolygon, drawGlowCircle, drawGlowLine } from '../retrozoneAdapter';
import { COL_RED, COL_GOLD, COL_CYAN } from '../colorTokens';
import type { BossDefinition } from '../../types/BossDefinition';

export function buildBossVisual(
  scene: Phaser.Scene,
  def: BossDefinition,
  phase: number,
): Phaser.GameObjects.Container {
  const base = scene.add.graphics();
  const glow = scene.add.graphics();
  glow.setBlendMode(Phaser.BlendModes.ADD);

  const color = phase === 0 ? COL_GOLD : COL_RED;

  // Core body - large diamond shape
  const size = 60;
  const points = [
    { x: 0, y: -size },
    { x: size * 0.8, y: 0 },
    { x: 0, y: size * 0.5 },
    { x: -size * 0.8, y: 0 },
  ];
  base.fillStyle(color, 0.15);
  base.fillPoints(points.map(p => new Phaser.Geom.Point(p.x, p.y)), true);
  base.lineStyle(2, color, 0.8);
  base.strokePoints(points.map(p => new Phaser.Geom.Point(p.x, p.y)), true);

  drawGlowPolygon(glow, points, color);

  // Inner core
  drawGlowCircle(glow, 0, -10, 12, COL_CYAN, 12);

  // Weak point indicator
  base.fillStyle(COL_CYAN, 0.4);
  base.fillCircle(0, -10, 8);

  // Phase decorations
  for (let i = 0; i < Math.min(phase + 1, 3); i++) {
    const offset = (i - 1) * 25;
    drawGlowLine(glow, offset - 8, size * 0.3, offset + 8, size * 0.3, color);
  }

  return scene.add.container(0, 0, [base, glow]);
}
