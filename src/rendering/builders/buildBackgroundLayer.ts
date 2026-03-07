import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT } from '../../constants';
import {
  createProjection, drawGlowLine, drawGlowCircle,
  FIGHTER, WARSHIP, CRYSTAL, SPINNER, BEETLE,
  CROWN, MOTH, HORNET, JELLYFISH, SPIDER,
} from 'retrozone';
import { COL_GREEN, COL_CYAN, COL_RED, COL_PURPLE, COL_GRAY, COL_GOLD, COL_BLUE, dimColor } from '../colorTokens';

const CX = GAME_WIDTH / 2;
const CY = GAME_HEIGHT / 2;

// Reduced-intensity glow passes for background grid lines
const GRID_PASSES = [
  { width: 6, alpha: 0.04 },
  { width: 3, alpha: 0.08 },
  { width: 1, alpha: 0.25 },
];

// Stronger glow for accent lines / wireframe models
const ACCENT_PASSES = [
  { width: 8, alpha: 0.06 },
  { width: 4, alpha: 0.15 },
  { width: 1.5, alpha: 0.55 },
];

// Subtle depth passes for distant elements
const DIM_PASSES = [
  { width: 5, alpha: 0.03 },
  { width: 2.5, alpha: 0.06 },
  { width: 1, alpha: 0.18 },
];

export function buildBackgroundLayer(scene: Phaser.Scene, levelIndex: number = 0): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics();
  g.setDepth(-10);
  g.setBlendMode(Phaser.BlendModes.ADD);

  const proj = createProjection({ centerX: CX, centerY: CY, perspective: 0.003 });

  switch (levelIndex) {
    case 0: bgGenesisBlock(g, proj); break;
    case 1: bgBullTrap(g, proj); break;
    case 2: bgLiquidationCascade(g, proj); break;
    case 3: bgPumpAndDump(g, proj); break;
    case 4: bgDiamondFormation(g, proj); break;
    case 5: bgBearMarket(g, proj); break;
    case 6: bgTheHalving(g, proj); break;
    case 7: bgDeFiMaze(g, proj); break;
    case 8: bgMarginCall(g, proj); break;
    case 9: bgTheFlippening(g, proj); break;
    default: bgGeneric(g, proj); break;
  }

  return g;
}

// ── Shared drawing helpers ──

type Proj = ReturnType<typeof createProjection>;
type GlowPasses = { width: number; alpha: number }[];

/** Draw a floor-like perspective grid receding into depth */
function drawFloorGrid(
  g: Phaser.GameObjects.Graphics, proj: Proj,
  color: number, floorY: number, zStart: number, zEnd: number,
  xExtent: number, gridSpacing: number, passes: GlowPasses = GRID_PASSES,
) {
  const zSteps = Math.floor((zEnd - zStart) / gridSpacing);
  // Horizontal lines receding into depth
  for (let i = 0; i <= zSteps; i++) {
    const z = zStart + i * gridSpacing;
    const p1 = proj.projectPoint(CX - xExtent, floorY, z);
    const p2 = proj.projectPoint(CX + xExtent, floorY, z);
    drawGlowLine(g, p1.x, p1.y, p2.x, p2.y, color, false, passes);
  }
  // Vertical lines converging to vanishing point
  const xSteps = Math.floor((xExtent * 2) / gridSpacing);
  for (let i = 0; i <= xSteps; i++) {
    const x = CX - xExtent + i * gridSpacing;
    const p1 = proj.projectPoint(x, floorY, zStart);
    const p2 = proj.projectPoint(x, floorY, zEnd);
    drawGlowLine(g, p1.x, p1.y, p2.x, p2.y, color, false, passes);
  }
}

/** Draw a wireframe model using RetroZone's glow renderer */
function drawModel(
  g: Phaser.GameObjects.Graphics, proj: Proj,
  model: { from: number[]; to: number[] }[],
  wx: number, wy: number, wz: number,
  scale: number, rotation: number,
  color: number, passes: GlowPasses = ACCENT_PASSES,
) {
  const lines = proj.projectModel(model, wx, wy, wz, scale, rotation);
  for (const l of lines) {
    const scaledPasses = passes.map(p => ({
      width: p.width * Math.max(0.5, l.scale),
      alpha: p.alpha * Math.max(0.4, l.scale),
    }));
    drawGlowLine(g, l.x1, l.y1, l.x2, l.y2, color, false, scaledPasses);
  }
}

/** Draw a 3D wireframe box */
function drawBox(g: Phaser.GameObjects.Graphics, proj: Proj, cx: number, cy: number, cz: number, size: number, color: number, passes: GlowPasses = ACCENT_PASSES) {
  const s = size / 2;
  const verts = [
    [-s, -s, -s], [s, -s, -s], [s, s, -s], [-s, s, -s],
    [-s, -s, s], [s, -s, s], [s, s, s], [-s, s, s],
  ];
  const edges: [number, number][] = [
    [0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4],[0,4],[1,5],[2,6],[3,7],
  ];
  const projected = verts.map(([x, y, z]) => proj.projectPoint(cx + x, cy + y, cz + z));
  for (const [a, b] of edges) {
    drawGlowLine(g, projected[a].x, projected[a].y, projected[b].x, projected[b].y, color, false, passes);
  }
}

/** Draw a pyramid */
function drawPyramid(g: Phaser.GameObjects.Graphics, proj: Proj, cx: number, cy: number, cz: number, size: number, color: number, passes: GlowPasses = ACCENT_PASSES) {
  const s = size / 2;
  const base = [[-s, s, -s], [s, s, -s], [s, s, s], [-s, s, s]];
  const apex = proj.projectPoint(cx, cy - size, cz);
  const projected = base.map(([x, y, z]) => proj.projectPoint(cx + x, cy + y, cz + z));
  for (let i = 0; i < 4; i++) {
    drawGlowLine(g, projected[i].x, projected[i].y, projected[(i + 1) % 4].x, projected[(i + 1) % 4].y, color, false, passes);
    drawGlowLine(g, projected[i].x, projected[i].y, apex.x, apex.y, color, false, passes);
  }
}

// ── Level backgrounds ──

function bgGenesisBlock(g: Phaser.GameObjects.Graphics, proj: Proj) {
  // Floor grid
  drawFloorGrid(g, proj, COL_GREEN, CY + 180, 0, 400, 500, 60);
  // Blockchain: chain of cubes receding
  for (let i = 0; i < 6; i++) {
    const z = 20 + i * 50;
    const x = CX + Math.sin(i * 0.8) * 80;
    drawBox(g, proj, x, CY + 50, z, 28 - i * 2, COL_GREEN, ACCENT_PASSES);
    if (i > 0) {
      const prevX = CX + Math.sin((i - 1) * 0.8) * 80;
      const p1 = proj.projectPoint(prevX, CY + 50, 20 + (i - 1) * 50);
      const p2 = proj.projectPoint(x, CY + 50, z);
      drawGlowLine(g, p1.x, p1.y, p2.x, p2.y, COL_GREEN, false, DIM_PASSES);
    }
  }
  // Crystal centerpiece
  drawModel(g, proj, CRYSTAL, CX, CY + 20, 50, 8, 0.3, COL_GREEN);
}

function bgBullTrap(g: Phaser.GameObjects.Graphics, proj: Proj) {
  drawFloorGrid(g, proj, COL_GREEN, CY + 180, 0, 350, 500, 70);
  // Rising chart line
  for (let i = 1; i < 18; i++) {
    const t0 = (i - 1) / 17, t1 = i / 17;
    const x0 = 40 + t0 * (GAME_WIDTH - 80), x1 = 40 + t1 * (GAME_WIDTH - 80);
    const y0 = CY + 100 - t0 * 120 + Math.sin(t0 * 10) * 10;
    const y1 = CY + 100 - t1 * 120 + Math.sin(t1 * 10) * 10;
    const col = i < 13 ? COL_GREEN : COL_RED;
    drawGlowLine(g, x0, y0, x1, y1, col, false, ACCENT_PASSES);
  }
  // Warship
  drawModel(g, proj, WARSHIP, CX, CY + 30, 60, 9, -0.2, COL_GREEN);
  drawPyramid(g, proj, CX + 200, CY + 40, 80, 40, COL_RED, DIM_PASSES);
}

function bgLiquidationCascade(g: Phaser.GameObjects.Graphics, proj: Proj) {
  drawFloorGrid(g, proj, COL_RED, CY + 180, 0, 400, 500, 55);
  // Falling boxes cascade
  for (let i = 0; i < 8; i++) {
    const x = 100 + i * 85 + Math.sin(i * 1.8) * 30;
    const y = CY + 30 + i * 20;
    const z = 30 + i * 15;
    drawBox(g, proj, x, y, z, 20 - i, COL_RED, i < 4 ? ACCENT_PASSES : DIM_PASSES);
  }
  // Crown
  drawModel(g, proj, CROWN, CX, CY + 20, 55, 8, 1.2, COL_RED);
  drawModel(g, proj, SPIDER, 160, 430, 25, 5, 0.5, dimColor(COL_RED, 0.8), DIM_PASSES);
}

function bgPumpAndDump(g: Phaser.GameObjects.Graphics, proj: Proj) {
  drawFloorGrid(g, proj, COL_GOLD, CY + 180, 0, 350, 500, 65);
  // Pump and dump chart
  for (let i = 1; i < 22; i++) {
    const t0 = (i - 1) / 21, t1 = i / 21;
    const x0 = 30 + t0 * (GAME_WIDTH - 60), x1 = 30 + t1 * (GAME_WIDTH - 60);
    const pump0 = t0 < 0.5 ? Math.pow(t0 / 0.5, 2.5) * 250 : 250 - Math.pow((t0 - 0.5) / 0.5, 1.5) * 320;
    const pump1 = t1 < 0.5 ? Math.pow(t1 / 0.5, 2.5) * 250 : 250 - Math.pow((t1 - 0.5) / 0.5, 1.5) * 320;
    const y0 = CY + 120 - pump0, y1 = CY + 120 - pump1;
    const col = t1 < 0.5 ? COL_GOLD : COL_RED;
    drawGlowLine(g, x0, y0, x1, y1, col, false, ACCENT_PASSES);
  }
  // Rockets (fighters pointing up)
  drawModel(g, proj, FIGHTER, CX - 100, CY - 20, 40, 7, Math.PI, COL_GOLD);
  drawModel(g, proj, FIGHTER, CX + 120, CY + 40, 60, 5, Math.PI, COL_GOLD, DIM_PASSES);
}

function bgDiamondFormation(g: Phaser.GameObjects.Graphics, proj: Proj) {
  drawFloorGrid(g, proj, COL_CYAN, CY + 180, 0, 400, 500, 60);
  // Central crystal cluster
  drawModel(g, proj, CRYSTAL, CX, CY + 10, 35, 12, 0.5, COL_CYAN);
  // Orbiting crystals
  for (let i = 0; i < 4; i++) {
    const angle = (i / 4) * Math.PI * 2 + 0.3;
    const ox = CX + Math.cos(angle) * 180;
    const oy = CY + 40 + Math.sin(angle) * 60;
    drawModel(g, proj, CRYSTAL, ox, oy, 50 + Math.sin(angle) * 15, 4 + i, angle, COL_CYAN, DIM_PASSES);
  }
  drawPyramid(g, proj, CX - 160, CY + 50, 50, 40, COL_PURPLE, DIM_PASSES);
}

function bgBearMarket(g: Phaser.GameObjects.Graphics, proj: Proj) {
  drawFloorGrid(g, proj, COL_RED, CY + 180, 0, 400, 500, 55);
  // Beetle (bear)
  drawModel(g, proj, BEETLE, CX, CY + 20, 45, 12, 0.2, COL_RED);
  // Crashing line
  for (let i = 1; i < 18; i++) {
    const t0 = (i - 1) / 17, t1 = i / 17;
    const x0 = 30 + t0 * (GAME_WIDTH - 60), x1 = 30 + t1 * (GAME_WIDTH - 60);
    const y0 = CY - 60 + t0 * t0 * 260, y1 = CY - 60 + t1 * t1 * 260;
    drawGlowLine(g, x0, y0, x1, y1, COL_RED, false, ACCENT_PASSES);
  }
  drawModel(g, proj, HORNET, 150, 350, 35, 5, 0.6, COL_RED, DIM_PASSES);
  drawModel(g, proj, HORNET, 650, 370, 40, 5, -0.8, COL_RED, DIM_PASSES);
}

function bgTheHalving(g: Phaser.GameObjects.Graphics, proj: Proj) {
  // Split grids
  const projL = createProjection({ centerX: CX / 2, centerY: CY, perspective: 0.004 });
  const projR = createProjection({ centerX: CX + CX / 2, centerY: CY, perspective: 0.004 });
  drawFloorGrid(g, projL, COL_GREEN, CY + 180, 0, 300, 250, 50);
  drawFloorGrid(g, projR, COL_GOLD, CY + 180, 0, 300, 250, 50);
  // Center divider
  for (let i = 0; i < 12; i++) {
    const y = 50 + i * 45;
    drawGlowLine(g, CX, y, CX, y + 25, COL_GRAY, false, DIM_PASSES);
  }
  // Spinner center
  drawModel(g, proj, SPINNER, CX, CY + 25, 30, 8, 0.4, COL_GOLD);
  drawModel(g, proj, CRYSTAL, CX - 180, CY + 20, 45, 6, 0.6, COL_GREEN, DIM_PASSES);
  drawModel(g, proj, CRYSTAL, CX + 180, CY + 20, 45, 6, -0.6, COL_GOLD, DIM_PASSES);
}

function bgDeFiMaze(g: Phaser.GameObjects.Graphics, proj: Proj) {
  drawFloorGrid(g, proj, COL_CYAN, CY + 180, 0, 400, 500, 55);
  // Network nodes
  const nodes: [number, number][] = [[150, 350], [300, 420], [450, 370], [600, 430], [250, 500], [500, 490]];
  for (const [nx, ny] of nodes) {
    drawGlowCircle(g, nx, ny, 8, COL_CYAN, 8);
  }
  // Connections
  for (let i = 0; i < nodes.length - 1; i++) {
    const [x1, y1] = nodes[i];
    const [x2, y2] = nodes[i + 1];
    const mx = (x1 + x2) / 2;
    drawGlowLine(g, x1, y1, mx, y1, COL_CYAN, false, DIM_PASSES);
    drawGlowLine(g, mx, y1, mx, y2, COL_CYAN, false, DIM_PASSES);
    drawGlowLine(g, mx, y2, x2, y2, COL_CYAN, false, DIM_PASSES);
  }
  // Jellyfish
  drawModel(g, proj, JELLYFISH, CX, CY + 25, 50, 8, 0.3, COL_PURPLE);
}

function bgMarginCall(g: Phaser.GameObjects.Graphics, proj: Proj) {
  drawFloorGrid(g, proj, COL_RED, CY + 180, 0, 400, 500, 55);
  // Spider
  drawModel(g, proj, SPIDER, CX, CY + 10, 40, 10, 0.7, COL_RED);
  // Warning pyramids
  drawPyramid(g, proj, 180, CY + 30, 40, 45, COL_GOLD);
  drawPyramid(g, proj, 620, CY + 40, 50, 40, COL_GOLD, DIM_PASSES);
  // Danger lines
  for (let i = 0; i < 3; i++) {
    const y = CY + 60 + i * 40;
    drawGlowLine(g, 40, y, GAME_WIDTH - 40, y, i === 2 ? COL_RED : COL_GOLD, false, DIM_PASSES);
  }
  drawModel(g, proj, MOTH, 140, 410, 35, 5, 1.0, COL_RED, DIM_PASSES);
  drawModel(g, proj, MOTH, 660, 390, 38, 5, -1.2, COL_RED, DIM_PASSES);
}

function bgTheFlippening(g: Phaser.GameObjects.Graphics, proj: Proj) {
  drawFloorGrid(g, proj, COL_PURPLE, CY + 180, 0, 400, 500, 60);
  // Two warships facing off
  drawModel(g, proj, WARSHIP, CX - 170, CY + 10, 40, 9, 0.3, COL_GOLD);
  drawModel(g, proj, WARSHIP, CX + 170, CY + 20, 45, 9, -0.3, COL_PURPLE);
  // Prize crystal
  drawModel(g, proj, CRYSTAL, CX, CY + 5, 30, 8, 0.9, COL_CYAN);
  // Crown
  drawModel(g, proj, CROWN, CX, CY - 50, 55, 6, 0.0, COL_GOLD, DIM_PASSES);
  // Crossing diagonals
  drawGlowLine(g, 40, CY + 130, GAME_WIDTH - 40, CY - 50, COL_GOLD, false, DIM_PASSES);
  drawGlowLine(g, 40, CY - 50, GAME_WIDTH - 40, CY + 130, COL_PURPLE, false, DIM_PASSES);
}

function bgGeneric(g: Phaser.GameObjects.Graphics, proj: Proj) {
  drawFloorGrid(g, proj, COL_GREEN, CY + 180, 0, 350, 500, 60);
  drawModel(g, proj, CRYSTAL, CX, CY + 30, 50, 8, 0.5, COL_GREEN);
}
