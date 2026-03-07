import Phaser from 'phaser';
import { dimColor } from '../colorTokens';
import { BRICK_WIDTH, BRICK_HEIGHT } from '../../data/balance';
import type { BrickDefinition } from '../../types/BrickDefinition';

export function buildBrickVisual(
  scene: Phaser.Scene,
  def: BrickDefinition,
  currentHp: number,
): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics();
  const w = BRICK_WIDTH;
  const h = BRICK_HEIGHT;
  const hw = w / 2;
  const hh = h / 2;

  const damageFactor = currentHp / def.hp;
  const color = damageFactor < 1 ? dimColor(def.color, 0.5 + 0.5 * damageFactor) : def.color;

  // Solid fill
  g.fillStyle(color, 0.2);
  g.fillRect(-hw, -hh, w, h);

  // Bright border
  g.lineStyle(2, color, 0.9);
  g.strokeRect(-hw, -hh, w, h);

  // Inner detail lines for reinforced bricks
  if (def.hp >= 2) {
    g.lineStyle(1, color, 0.5);
    g.strokeRect(-hw + 3, -hh + 3, w - 6, h - 6);
  }
  if (def.hp >= 3) {
    g.lineStyle(1, color, 0.4);
    g.strokeRect(-hw + 6, -hh + 5, w - 12, h - 10);
  }

  // Type-specific decorations
  if (def.id === 'indestructible') {
    g.lineStyle(1.5, color, 0.6);
    g.lineBetween(-hw + 4, -hh + 4, hw - 4, hh - 4);
    g.lineBetween(hw - 4, -hh + 4, -hw + 4, hh - 4);
  } else if (def.explosive) {
    g.lineStyle(1.5, color, 0.8);
    g.lineBetween(-6, -2, 0, -hh + 3);
    g.lineBetween(0, -hh + 3, 6, -2);
  } else if (def.id === 'sentimentUp') {
    g.lineStyle(1.5, color, 0.8);
    g.lineBetween(0, hh - 3, 0, -hh + 3);
    g.lineBetween(-4, -2, 0, -hh + 3);
    g.lineBetween(4, -2, 0, -hh + 3);
  } else if (def.id === 'sentimentDown') {
    g.lineStyle(1.5, color, 0.8);
    g.lineBetween(0, -hh + 3, 0, hh - 3);
    g.lineBetween(-4, 2, 0, hh - 3);
    g.lineBetween(4, 2, 0, hh - 3);
  } else if (def.id === 'hazard') {
    g.lineStyle(1, 0xff0066, 0.7);
    g.lineBetween(-hw + 6, -hh + 4, hw - 6, hh - 4);
    g.lineBetween(hw - 6, -hh + 4, -hw + 6, hh - 4);
  } else if (def.id === 'drop') {
    g.fillStyle(color, 0.7);
    g.fillCircle(0, 0, 3);
  }

  // Damage cracks
  if (damageFactor < 1 && def.destructible) {
    g.lineStyle(1, 0xff4444, 0.5 * (1 - damageFactor));
    g.lineBetween(-hw + 4, -2, -hw / 3, 3);
    g.lineBetween(hw - 4, 2, hw / 3, -3);
  }

  return g;
}
