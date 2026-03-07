import Phaser from 'phaser';
import type { PowerupDefinition } from '../../types/PowerupDefinition';

const CAPSULE_W = 36;
const CAPSULE_H = 16;

export function buildPowerupVisual(
  scene: Phaser.Scene,
  def: PowerupDefinition,
): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics();
  const hw = CAPSULE_W / 2;
  const hh = CAPSULE_H / 2;

  // Outer glow
  g.fillStyle(def.color, 0.1);
  g.fillRoundedRect(-hw - 2, -hh - 2, CAPSULE_W + 4, CAPSULE_H + 4, 6);

  // Body
  g.fillStyle(def.color, def.positive ? 0.25 : 0.15);
  g.fillRoundedRect(-hw, -hh, CAPSULE_W, CAPSULE_H, 4);

  // Border - green/solid for positive, red/dashed-feel for negative
  g.lineStyle(1.5, def.color, 0.8);
  g.strokeRoundedRect(-hw, -hh, CAPSULE_W, CAPSULE_H, 4);

  // Center indicator dot
  g.fillStyle(def.color, 0.8);
  g.fillCircle(0, 0, 2);

  return g;
}
