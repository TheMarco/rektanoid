import * as THREE from 'three';
import { GAME_WIDTH, GAME_HEIGHT } from './constants';
import type { Renderer } from './Renderer';

const HW = GAME_WIDTH / 2;
const HH = GAME_HEIGHT / 2;

interface BackgroundPulse {
  material: THREE.Material & { opacity: number };
  baseOpacity: number;
  amplitude: number;
  speed: number;
  phase: number;
}

interface BackgroundMover {
  object: THREE.Object3D;
  basePosition: THREE.Vector3;
  baseRotationZ: number;
  driftX: number;
  driftY: number;
  driftZ: number;
  sway: number;
  speed: number;
  phase: number;
}

interface BackgroundAnimationState {
  pulses: BackgroundPulse[];
  movers: BackgroundMover[];
  baseGroupRotationZ: number;
  baseGroupX: number;
  baseGroupY: number;
  phase: number;
}

interface AtmospherePalette {
  nebulaA: number;
  nebulaB: number;
  nebulaC: number;
  starlight: number;
  accent: number;
}

const ATMOSPHERE_PALETTES: AtmospherePalette[] = [
  { nebulaA: 0x0f3946, nebulaB: 0x1d8797, nebulaC: 0x56d9ff, starlight: 0x9dffff, accent: 0x45e6ff },
  { nebulaA: 0x0d311a, nebulaB: 0x1f8f3f, nebulaC: 0x67f39a, starlight: 0xa0ffd2, accent: 0x53ff93 },
  { nebulaA: 0x36080d, nebulaB: 0x8f1d21, nebulaC: 0xff6767, starlight: 0xffcdc7, accent: 0xff5f4a },
  { nebulaA: 0x2e1a04, nebulaB: 0x956322, nebulaC: 0xffc462, starlight: 0xfff0bf, accent: 0xffc44d },
  { nebulaA: 0x071e35, nebulaB: 0x1f6fa3, nebulaC: 0x74d5ff, starlight: 0xd7f3ff, accent: 0x7ddaff },
  { nebulaA: 0x2d080f, nebulaB: 0x7b1f2f, nebulaC: 0xff6577, starlight: 0xffc9d5, accent: 0xff5d73 },
  { nebulaA: 0x261732, nebulaB: 0x6f4aab, nebulaC: 0xe5b75a, starlight: 0xffebbf, accent: 0xf4bf4d },
  { nebulaA: 0x081b3a, nebulaB: 0x1564b8, nebulaC: 0x5fe0ff, starlight: 0xd4f7ff, accent: 0x52d7ff },
  { nebulaA: 0x300a09, nebulaB: 0xa3311c, nebulaC: 0xff8b52, starlight: 0xffe0c9, accent: 0xff7b42 },
  { nebulaA: 0x240b3b, nebulaB: 0x7640d1, nebulaC: 0xd38fff, starlight: 0xf4d9ff, accent: 0xc27dff },
];

// ── Noise ──

function seededRandom(seed: number) {
  let s = seed;
  return () => { s = (s * 16807 + 0) % 2147483647; return (s - 1) / 2147483646; };
}

function hasOpacity(material: THREE.Material): material is THREE.Material & { opacity: number } {
  return typeof (material as { opacity?: unknown }).opacity === 'number';
}

function toRgba(hex: number, alpha: number): string {
  const r = (hex >> 16) & 255;
  const g = (hex >> 8) & 255;
  const b = hex & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function noise1D(x: number, seed: number): number {
  const hash = (n: number) => Math.sin(n * 127.1 + seed * 311.7) * 43758.5453 % 1;
  const i = Math.floor(x);
  const f = x - i;
  const t = f * f * (3 - 2 * f);
  return hash(i) * (1 - t) + hash(i + 1) * t;
}

function fbm(x: number, seed: number, octaves = 4, lacunarity = 2.1, gain = 0.5): number {
  let val = 0, amp = 1, freq = 1, maxAmp = 0;
  for (let i = 0; i < octaves; i++) {
    val += noise1D(x * freq, seed + i * 100) * amp;
    maxAmp += amp; amp *= gain; freq *= lacunarity;
  }
  return val / maxAmp;
}

// ── Geometry helpers ──

function line(p: number[], x1: number, y1: number, z1: number, x2: number, y2: number, z2: number) {
  p.push(x1, y1, z1, x2, y2, z2);
}

function thickenLineSegmentPositions(input: number[], halfWidth: number, steps: number): Float32Array {
  if (input.length === 0 || halfWidth <= 0 || steps <= 0) return new Float32Array(input);
  const lineCount = Math.floor(input.length / 6);
  const copies = steps * 2 + 1;
  const out = new Float32Array(lineCount * copies * 6);
  let outIndex = 0;
  for (let i = 0; i < lineCount; i++) {
    const idx = i * 6;
    const ax = input[idx], ay = input[idx + 1], az = input[idx + 2];
    const bx = input[idx + 3], by = input[idx + 4], bz = input[idx + 5];
    const dx = bx - ax, dy = by - ay;
    const len = Math.hypot(dx, dy);
    const nx = len > 1e-5 ? -dy / len : 0;
    const ny = len > 1e-5 ? dx / len : 1;
    for (let s = -steps; s <= steps; s++) {
      const offset = (s / steps) * halfWidth;
      const ox = nx * offset, oy = ny * offset;
      out[outIndex++] = ax + ox; out[outIndex++] = ay + oy; out[outIndex++] = az;
      out[outIndex++] = bx + ox; out[outIndex++] = by + oy; out[outIndex++] = bz;
    }
  }
  return out;
}

const WALL_THICK_WIDTH = 0.05;
const WALL_THICK_STEPS = 1;

function buildMesh(positions: number[], color: number, coreOpacity = 0.5, glowOpacity = 0.18): THREE.Group {
  const group = new THREE.Group();
  const thickPos = thickenLineSegmentPositions(positions, WALL_THICK_WIDTH, WALL_THICK_STEPS);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(thickPos, 3));
  const core = new THREE.LineSegments(geo,
    new THREE.LineBasicMaterial({ color, transparent: true, opacity: coreOpacity, toneMapped: false }));
  core.renderOrder = 3;
  core.frustumCulled = false;
  group.add(core);
  const glow = new THREE.LineSegments(geo.clone(),
    new THREE.LineBasicMaterial({
      color, transparent: true, opacity: glowOpacity,
      blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false, toneMapped: false,
    }));
  glow.renderOrder = 2;
  glow.frustumCulled = false;
  group.add(glow);
  return group;
}

// ── Cave profile ──

interface CaveProfile { x: number; topY: number; botY: number; }

function generateCaveProfile(
  xMin: number, xMax: number, samples: number,
  centerY: number, baseRadius: number,
  seed: number, jaggedness = 1.0
): CaveProfile[] {
  const points: CaveProfile[] = [];
  const dx = (xMax - xMin) / (samples - 1);
  const rng = seededRandom(seed);
  for (let i = 0; i < samples; i++) {
    const x = xMin + i * dx;
    const t = i / (samples - 1);
    const centerOff = (fbm(t * 3, seed) - 0.5) * 60 + Math.sin(t * Math.PI * 2.5 + seed) * 25;
    const radiusVar = baseRadius + (fbm(t * 4, seed + 500) - 0.5) * baseRadius * 0.6
      + (fbm(t * 8, seed + 700) - 0.5) * baseRadius * 0.3;
    const topDetail = (fbm(t * 12, seed + 1000, 3) - 0.5) * 40 * jaggedness + (rng() - 0.5) * 12 * jaggedness;
    const botDetail = (fbm(t * 12, seed + 2000, 3) - 0.5) * 40 * jaggedness + (rng() - 0.5) * 12 * jaggedness;
    const cy = centerY + centerOff;
    points.push({ x, topY: cy + radiusVar + topDetail, botY: cy - radiusVar + botDetail });
  }
  return points;
}

// ── Cave mesh builders ──

function buildCaveLayer(positions: number[], profile: CaveProfile[], z: number) {
  for (let i = 0; i < profile.length - 1; i++) {
    const a = profile[i], b = profile[i + 1];
    line(positions, a.x, a.topY, z, b.x, b.topY, z);
  }
  for (let i = 0; i < profile.length - 1; i++) {
    const a = profile[i], b = profile[i + 1];
    line(positions, a.x, a.botY, z, b.x, b.botY, z);
  }
}

function buildStalactites(positions: number[], profile: CaveProfile[], z: number, seed: number,
  density = 0.3, lengthMin = 8, lengthMax = 30) {
  const rng = seededRandom(seed);
  for (const p of profile) {
    if (rng() < density) {
      const len = lengthMin + rng() * (lengthMax - lengthMin);
      line(positions, p.x, p.topY, z, p.x, p.topY - len, z);
    }
    if (rng() < density * 0.7) {
      const len = lengthMin + rng() * (lengthMax - lengthMin) * 0.8;
      line(positions, p.x, p.botY, z, p.x, p.botY + len, z);
    }
  }
}

function connectLayers(positions: number[], profileA: CaveProfile[], zA: number,
  profileB: CaveProfile[], zB: number, stride = 3) {
  const count = Math.min(profileA.length, profileB.length);
  for (let i = 0; i < count; i += stride) {
    const a = profileA[i], b = profileB[i];
    line(positions, a.x, a.topY, zA, b.x, b.topY, zB);
    line(positions, a.x, a.botY, zA, b.x, b.botY, zB);
  }
}

function buildRockDetail(positions: number[], profile: CaveProfile[], z: number,
  ceilingY: number, floorY: number, seed: number, density = 0.2) {
  const rng = seededRandom(seed);
  for (let i = 0; i < profile.length - 1; i++) {
    const a = profile[i], b = profile[i + 1];
    if (rng() < density) {
      const midX = (a.x + b.x) / 2;
      const rockTop = Math.min(ceilingY, Math.max(a.topY, b.topY) + 20 + rng() * 30);
      line(positions, a.x, a.topY, z, midX, rockTop, z);
      line(positions, midX, rockTop, z, b.x, b.topY, z);
    }
    if (rng() < density) {
      const midX = (a.x + b.x) / 2;
      const rockBot = Math.max(floorY, Math.min(a.botY, b.botY) - 20 - rng() * 30);
      line(positions, a.x, a.botY, z, midX, rockBot, z);
      line(positions, midX, rockBot, z, b.x, b.botY, z);
    }
  }
}

// ══════════════════════════════════════════════
// ── UNIQUE STRUCTURE GENERATORS ──
// ══════════════════════════════════════════════

/** Floating 3D blockchain cubes connected by chain links */
function buildBlockchainBlocks(positions: number[], seed: number, count: number,
  xRange: number, yRange: number, zMin: number, zMax: number, blockSize: number) {
  const rng = seededRandom(seed);
  const blocks: { x: number; y: number; z: number }[] = [];

  for (let i = 0; i < count; i++) {
    const bx = (rng() - 0.5) * xRange;
    const by = (rng() - 0.5) * yRange;
    const bz = zMin + rng() * (zMax - zMin);
    const s = blockSize * (0.5 + rng() * 0.8);
    blocks.push({ x: bx, y: by, z: bz });

    const hs = s / 2;
    // Front face
    line(positions, bx - hs, by - hs, bz + hs, bx + hs, by - hs, bz + hs);
    line(positions, bx + hs, by - hs, bz + hs, bx + hs, by + hs, bz + hs);
    line(positions, bx + hs, by + hs, bz + hs, bx - hs, by + hs, bz + hs);
    line(positions, bx - hs, by + hs, bz + hs, bx - hs, by - hs, bz + hs);
    // Back face
    line(positions, bx - hs, by - hs, bz - hs, bx + hs, by - hs, bz - hs);
    line(positions, bx + hs, by - hs, bz - hs, bx + hs, by + hs, bz - hs);
    line(positions, bx + hs, by + hs, bz - hs, bx - hs, by + hs, bz - hs);
    line(positions, bx - hs, by + hs, bz - hs, bx - hs, by - hs, bz - hs);
    // Connecting edges
    line(positions, bx - hs, by - hs, bz + hs, bx - hs, by - hs, bz - hs);
    line(positions, bx + hs, by - hs, bz + hs, bx + hs, by - hs, bz - hs);
    line(positions, bx + hs, by + hs, bz + hs, bx + hs, by + hs, bz - hs);
    line(positions, bx - hs, by + hs, bz + hs, bx - hs, by + hs, bz - hs);
    // Hash pattern inside front face
    line(positions, bx - hs * 0.6, by, bz + hs, bx + hs * 0.6, by, bz + hs);
    line(positions, bx, by - hs * 0.6, bz + hs, bx, by + hs * 0.6, bz + hs);
    // Nonce detail
    line(positions, bx - hs * 0.4, by - hs * 0.3, bz + hs, bx + hs * 0.4, by - hs * 0.3, bz + hs);
  }

  // Chain links between blocks
  for (let i = 1; i < blocks.length; i++) {
    const a = blocks[i - 1], b = blocks[i];
    const steps = 5;
    for (let s = 0; s < steps; s++) {
      const t1 = s / steps;
      const t2 = (s + 0.5) / steps;
      line(positions,
        a.x + (b.x - a.x) * t1, a.y + (b.y - a.y) * t1, a.z + (b.z - a.z) * t1,
        a.x + (b.x - a.x) * t2, a.y + (b.y - a.y) * t2, a.z + (b.z - a.z) * t2
      );
    }
  }
}

/** Giant price chart with candlesticks and moving averages */
function buildGiantChart(positions: number[], seed: number, xMin: number, xMax: number,
  yCenter: number, yAmplitude: number, z: number, candles: number) {
  const rng = seededRandom(seed);
  const dx = (xMax - xMin) / candles;
  let price = yCenter;

  for (let i = 0; i < candles; i++) {
    const x = xMin + i * dx;
    const change = (rng() - 0.45) * yAmplitude * 0.15;
    const open = price;
    price += change;
    const close = price;
    const high = Math.max(open, close) + rng() * yAmplitude * 0.08;
    const low = Math.min(open, close) - rng() * yAmplitude * 0.08;

    const bodyW = dx * 0.55;
    const cx = x + dx * 0.5;
    line(positions, cx, high, z, cx, low, z);
    line(positions, cx - bodyW / 2, open, z, cx + bodyW / 2, open, z);
    line(positions, cx + bodyW / 2, open, z, cx + bodyW / 2, close, z);
    line(positions, cx + bodyW / 2, close, z, cx - bodyW / 2, close, z);
    line(positions, cx - bodyW / 2, close, z, cx - bodyW / 2, open, z);
  }

  // Moving average overlay
  let ma = yCenter;
  for (let i = 0; i < candles - 1; i++) {
    const x1 = xMin + (i + 0.5) * dx;
    const x2 = xMin + (i + 1.5) * dx;
    const next = ma + (rng() - 0.48) * yAmplitude * 0.06;
    line(positions, x1, ma, z, x2, next, z);
    ma = next;
  }
}

/** Lightning bolt zigzag patterns */
function buildLightningBolts(positions: number[], seed: number, count: number,
  xRange: number, yTop: number, yBot: number, z: number) {
  const rng = seededRandom(seed);
  for (let b = 0; b < count; b++) {
    let x = (rng() - 0.5) * xRange;
    let y = yTop;
    const segments = 6 + Math.floor(rng() * 8);
    const segH = (yTop - yBot) / segments;

    for (let s = 0; s < segments; s++) {
      const nx = x + (rng() - 0.5) * 80;
      const ny = y - segH;
      line(positions, x, y, z, nx, ny, z);
      if (rng() < 0.3) {
        const bx2 = x + (rng() - 0.5) * 60;
        const by2 = y - segH * 0.6;
        line(positions, x, y, z, bx2, by2, z);
      }
      x = nx;
      y = ny;
    }
  }
}

/** Crystal / diamond geometric formations */
function buildCrystals(positions: number[], seed: number, count: number,
  xRange: number, yRange: number, zMin: number, zMax: number, sizeRange: [number, number]) {
  const rng = seededRandom(seed);
  for (let i = 0; i < count; i++) {
    const cx = (rng() - 0.5) * xRange;
    const cy = (rng() - 0.5) * yRange;
    const cz = zMin + rng() * (zMax - zMin);
    const h = sizeRange[0] + rng() * (sizeRange[1] - sizeRange[0]);
    const w = h * (0.25 + rng() * 0.35);
    const sides = 4 + Math.floor(rng() * 3);

    const topY = cy + h;
    const botY = cy - h * 0.7;
    const midY = cy;

    for (let s = 0; s < sides; s++) {
      const a = (s / sides) * Math.PI * 2;
      const na = ((s + 1) / sides) * Math.PI * 2;
      const mx = cx + Math.cos(a) * w;
      const mz = cz + Math.sin(a) * w * 0.5;
      const nmx = cx + Math.cos(na) * w;
      const nmz = cz + Math.sin(na) * w * 0.5;

      line(positions, cx, topY, cz, mx, midY, mz);
      line(positions, mx, midY, mz, nmx, midY, nmz);
      line(positions, mx, midY, mz, cx, botY, cz);
    }
    // Inner facet lines
    line(positions, cx, topY, cz, cx, botY, cz);
    if (rng() > 0.5) {
      const innerW = w * 0.5;
      for (let s = 0; s < sides; s++) {
        const a = (s / sides) * Math.PI * 2 + Math.PI / sides;
        const mx = cx + Math.cos(a) * innerW;
        const mz2 = cz + Math.sin(a) * innerW * 0.5;
        line(positions, cx, topY * 0.7 + midY * 0.3, cz, mx, midY, mz2);
      }
    }
  }
}

/** Circuit board / PCB trace pattern */
function buildCircuitTraces(positions: number[], seed: number, traces: number,
  xRange: number, yRange: number, z: number) {
  const rng = seededRandom(seed);

  for (let t = 0; t < traces; t++) {
    let x = (rng() - 0.5) * xRange;
    let y = (rng() - 0.5) * yRange;
    const segments = 4 + Math.floor(rng() * 6);

    for (let s = 0; s < segments; s++) {
      const horizontal = rng() > 0.5;
      const dist = 30 + rng() * 80;
      const dir = rng() > 0.5 ? 1 : -1;
      const nx = horizontal ? x + dist * dir : x;
      const ny = horizontal ? y : y + dist * dir;
      line(positions, x, y, z, nx, ny, z);
      // Node pad at each turn
      const ns = 4;
      line(positions, nx - ns, ny - ns, z, nx + ns, ny - ns, z);
      line(positions, nx + ns, ny - ns, z, nx + ns, ny + ns, z);
      line(positions, nx + ns, ny + ns, z, nx - ns, ny + ns, z);
      line(positions, nx - ns, ny + ns, z, nx - ns, ny - ns, z);
      x = nx;
      y = ny;
    }
  }

  // IC chips
  for (let c = 0; c < 4; c++) {
    const cx = (rng() - 0.5) * xRange * 0.6;
    const cy = (rng() - 0.5) * yRange * 0.6;
    const cw = 25 + rng() * 35;
    const ch = 15 + rng() * 25;
    line(positions, cx - cw, cy - ch, z, cx + cw, cy - ch, z);
    line(positions, cx + cw, cy - ch, z, cx + cw, cy + ch, z);
    line(positions, cx + cw, cy + ch, z, cx - cw, cy + ch, z);
    line(positions, cx - cw, cy + ch, z, cx - cw, cy - ch, z);
    // Pins
    const pins = 4 + Math.floor(rng() * 4);
    for (let p = 0; p < pins; p++) {
      const pt = (p + 0.5) / pins;
      const px = cx - cw + pt * cw * 2;
      line(positions, px, cy - ch, z, px, cy - ch - 10, z);
      line(positions, px, cy + ch, z, px, cy + ch + 10, z);
    }
    // Inner detail
    line(positions, cx - cw * 0.6, cy, z, cx + cw * 0.6, cy, z);
    line(positions, cx, cy - ch * 0.6, z, cx, cy + ch * 0.6, z);
  }
}

/** Concentric polygon rings (radar/target) */
function buildConcentricRings(positions: number[], cx: number, cy: number, z: number,
  rings: number, maxRadius: number, sides: number) {
  for (let r = 1; r <= rings; r++) {
    const radius = (r / rings) * maxRadius;
    for (let s = 0; s < sides; s++) {
      const a = (s / sides) * Math.PI * 2;
      const na = ((s + 1) / sides) * Math.PI * 2;
      line(positions, cx + Math.cos(a) * radius, cy + Math.sin(a) * radius, z,
        cx + Math.cos(na) * radius, cy + Math.sin(na) * radius, z);
    }
  }
  line(positions, cx - maxRadius, cy, z, cx + maxRadius, cy, z);
  line(positions, cx, cy - maxRadius, z, cx, cy + maxRadius, z);
  const d = maxRadius * 0.707;
  line(positions, cx - d, cy - d, z, cx + d, cy + d, z);
  line(positions, cx + d, cy - d, z, cx - d, cy + d, z);
}

/** Parabolic rocket trails with exhaust */
function buildRocketTrails(positions: number[], seed: number, count: number,
  xRange: number, yBase: number, z: number) {
  const rng = seededRandom(seed);
  for (let r = 0; r < count; r++) {
    const startX = (rng() - 0.5) * xRange;
    const peakH = 200 + rng() * 300;
    const width = 80 + rng() * 180;
    const segments = 20;

    for (let s = 0; s < segments; s++) {
      const t1 = s / segments;
      const t2 = (s + 1) / segments;
      const x1 = startX + (t1 - 0.5) * width;
      const y1 = yBase + 4 * peakH * t1 * (1 - t1);
      const x2 = startX + (t2 - 0.5) * width;
      const y2 = yBase + 4 * peakH * t2 * (1 - t2);
      line(positions, x1, y1, z, x2, y2, z);
    }

    // Exhaust sparks at base
    for (let e = 0; e < 6; e++) {
      const ex = startX + (rng() - 0.5) * 25;
      const ey = yBase - rng() * 50;
      line(positions, startX, yBase, z, ex, ey, z);
    }

    // Rocket tip triangle
    const tipX = startX;
    const tipY = yBase + peakH;
    line(positions, tipX, tipY + 10, z, tipX - 6, tipY - 5, z);
    line(positions, tipX, tipY + 10, z, tipX + 6, tipY - 5, z);
    line(positions, tipX - 6, tipY - 5, z, tipX + 6, tipY - 5, z);
  }
}

/** Bear claw scratch marks */
function buildClawMarks(positions: number[], seed: number, count: number,
  xRange: number, yRange: number, z: number) {
  const rng = seededRandom(seed);
  for (let c = 0; c < count; c++) {
    const cx = (rng() - 0.5) * xRange;
    const cy = (rng() - 0.5) * yRange;
    const angle = -0.6 + rng() * 0.3;
    const length = 100 + rng() * 200;
    const claws = 3 + Math.floor(rng() * 2);
    const spacing = 14 + rng() * 8;

    for (let cl = 0; cl < claws; cl++) {
      const offset = (cl - (claws - 1) / 2) * spacing;
      const sx = cx + Math.cos(angle + Math.PI / 2) * offset;
      const sy = cy + Math.sin(angle + Math.PI / 2) * offset;
      const ex = sx + Math.cos(angle) * length;
      const ey = sy + Math.sin(angle) * length;
      const segs = 4;
      let px = sx, py = sy;
      for (let s = 0; s < segs; s++) {
        const t = (s + 1) / segs;
        const nx = sx + (ex - sx) * t + (rng() - 0.5) * 8;
        const ny = sy + (ey - sy) * t + (rng() - 0.5) * 8;
        line(positions, px, py, z, nx, ny, z);
        px = nx; py = ny;
      }
    }
  }
}

/** Descending staircase chart with support/resistance lines */
function buildStaircaseChart(positions: number[], seed: number,
  xMin: number, xMax: number, yStart: number, z: number, steps: number) {
  const rng = seededRandom(seed);
  const dx = (xMax - xMin) / steps;
  let y = yStart;

  for (let s = 0; s < steps; s++) {
    const x1 = xMin + s * dx;
    const x2 = x1 + dx;
    const drop = 20 + rng() * 45;

    line(positions, x1, y, z, x2, y, z);
    line(positions, x2, y, z, x2, y - drop, z);
    // Support markers
    line(positions, x1 - 5, y, z, x1 - 5, y - 4, z);
    line(positions, x2 + 5, y, z, x2 + 5, y - 4, z);
    y -= drop;
  }

  // Dashed horizontal support/resistance levels
  const startY = yStart;
  for (let i = 0; i < 4; i++) {
    const ly = startY - i * 70;
    for (let d = 0; d < 12; d++) {
      const ddx = (xMax - xMin) / 12;
      line(positions, xMin + d * ddx, ly, z, xMin + (d + 0.5) * ddx, ly, z);
    }
  }
}

/** Warning triangles and X marks */
function buildWarningPatterns(positions: number[], seed: number, count: number,
  xRange: number, yRange: number, z: number) {
  const rng = seededRandom(seed);
  for (let i = 0; i < count; i++) {
    const cx = (rng() - 0.5) * xRange;
    const cy = (rng() - 0.5) * yRange;
    const s = 18 + rng() * 30;

    if (rng() > 0.4) {
      // Warning triangle
      line(positions, cx, cy + s, z, cx + s * 0.866, cy - s * 0.5, z);
      line(positions, cx + s * 0.866, cy - s * 0.5, z, cx - s * 0.866, cy - s * 0.5, z);
      line(positions, cx - s * 0.866, cy - s * 0.5, z, cx, cy + s, z);
      // Exclamation mark
      line(positions, cx, cy + s * 0.5, z, cx, cy - s * 0.05, z);
      line(positions, cx - 2, cy - s * 0.2, z, cx + 2, cy - s * 0.2, z);
    } else {
      // X mark with circle
      line(positions, cx - s, cy - s, z, cx + s, cy + s, z);
      line(positions, cx + s, cy - s, z, cx - s, cy + s, z);
      const segs = 10;
      for (let seg = 0; seg < segs; seg++) {
        const a = (seg / segs) * Math.PI * 2;
        const na = ((seg + 1) / segs) * Math.PI * 2;
        line(positions, cx + Math.cos(a) * s * 1.2, cy + Math.sin(a) * s * 1.2, z,
          cx + Math.cos(na) * s * 1.2, cy + Math.sin(na) * s * 1.2, z);
      }
    }
  }
}

/** Network nodes connected by lines (DeFi protocols) */
function buildNetworkGraph(positions: number[], seed: number, nodes: number,
  xRange: number, yRange: number, z: number, connectionDist: number) {
  const rng = seededRandom(seed);
  const nodeList: { x: number; y: number }[] = [];

  for (let i = 0; i < nodes; i++) {
    const nx = (rng() - 0.5) * xRange;
    const ny = (rng() - 0.5) * yRange;
    nodeList.push({ x: nx, y: ny });

    // Hexagon node
    const r = 6 + rng() * 12;
    for (let s = 0; s < 6; s++) {
      const a = (s / 6) * Math.PI * 2;
      const na = ((s + 1) / 6) * Math.PI * 2;
      line(positions, nx + Math.cos(a) * r, ny + Math.sin(a) * r, z,
        nx + Math.cos(na) * r, ny + Math.sin(na) * r, z);
    }
    // Inner dot
    line(positions, nx - 2, ny, z, nx + 2, ny, z);
    line(positions, nx, ny - 2, z, nx, ny + 2, z);
  }

  for (let i = 0; i < nodeList.length; i++) {
    for (let j = i + 1; j < nodeList.length; j++) {
      const dist = Math.hypot(nodeList[i].x - nodeList[j].x, nodeList[i].y - nodeList[j].y);
      if (dist < connectionDist) {
        line(positions, nodeList[i].x, nodeList[i].y, z, nodeList[j].x, nodeList[j].y, z);
      }
    }
  }
}

/** Two competing price lines that cross */
function buildCrossoverChart(positions: number[], seed: number,
  xMin: number, xMax: number, yCenter: number, z: number) {
  const rng = seededRandom(seed);
  const segments = 40;
  const dx = (xMax - xMin) / segments;

  let priceA = yCenter + 80;
  let priceB = yCenter - 80;

  for (let i = 0; i < segments; i++) {
    const x1 = xMin + i * dx;
    const x2 = x1 + dx;
    const t = i / segments;

    const targetA = yCenter - 80 + Math.sin(t * Math.PI * 1.5) * 50;
    const targetB = yCenter + 80 - Math.sin(t * Math.PI * 1.5) * 50;

    const nextA = priceA + (targetA - priceA) * 0.12 + (rng() - 0.5) * 20;
    const nextB = priceB + (targetB - priceB) * 0.12 + (rng() - 0.5) * 20;

    line(positions, x1, priceA, z, x2, nextA, z);
    line(positions, x1, priceB, z, x2, nextB, z);

    priceA = nextA;
    priceB = nextB;
  }
}

/** Halving visualization — blocks with diminishing rewards */
function buildHalvingBlocks(positions: number[], seed: number,
  xMin: number, xMax: number, yCenter: number, z: number) {
  const rng = seededRandom(seed);
  const epochs = 5;
  const dx = (xMax - xMin) / epochs;

  for (let e = 0; e < epochs; e++) {
    const cx = xMin + (e + 0.5) * dx;
    const reward = 80 / Math.pow(2, e);
    const bw = dx * 0.3;

    line(positions, cx - bw, yCenter - reward, z, cx + bw, yCenter - reward, z);
    line(positions, cx + bw, yCenter - reward, z, cx + bw, yCenter + reward, z);
    line(positions, cx + bw, yCenter + reward, z, cx - bw, yCenter + reward, z);
    line(positions, cx - bw, yCenter + reward, z, cx - bw, yCenter - reward, z);

    if (e < epochs - 1) {
      const divX = xMin + (e + 1) * dx;
      line(positions, divX, yCenter - 100, z, divX, yCenter + 100, z);
      line(positions, divX - 8, yCenter - 88, z, divX, yCenter - 100, z);
      line(positions, divX + 8, yCenter - 88, z, divX, yCenter - 100, z);
    }

    const rewardLines = Math.max(1, Math.floor(reward / 12));
    for (let r = 0; r < rewardLines; r++) {
      const ry = yCenter - reward + (r + 0.5) * (reward * 2 / rewardLines);
      line(positions, cx - bw * 0.7, ry, z, cx + bw * 0.7, ry, z);
    }
  }
}

/** Wireframe skull */
function buildSkull(positions: number[], cx: number, cy: number, z: number, size: number) {
  const s = size;
  // Cranium
  const crSegs = 12;
  for (let i = 0; i < crSegs; i++) {
    const a = Math.PI + (i / crSegs) * Math.PI;
    const na = Math.PI + ((i + 1) / crSegs) * Math.PI;
    line(positions,
      cx + Math.cos(a) * s, cy + Math.sin(a) * s * 0.8 + s * 0.3, z,
      cx + Math.cos(na) * s, cy + Math.sin(na) * s * 0.8 + s * 0.3, z);
  }
  // Jaw
  line(positions, cx - s, cy + s * 0.3, z, cx - s * 0.8, cy - s * 0.3, z);
  line(positions, cx - s * 0.8, cy - s * 0.3, z, cx - s * 0.3, cy - s * 0.6, z);
  line(positions, cx + s, cy + s * 0.3, z, cx + s * 0.8, cy - s * 0.3, z);
  line(positions, cx + s * 0.8, cy - s * 0.3, z, cx + s * 0.3, cy - s * 0.6, z);
  // Teeth
  for (let t = 0; t < 5; t++) {
    const tx = cx + (t - 2) * s * 0.25;
    line(positions, tx, cy - s * 0.45, z, tx, cy - s * 0.6, z);
  }
  line(positions, cx - s * 0.55, cy - s * 0.45, z, cx + s * 0.55, cy - s * 0.45, z);
  // Eye sockets
  for (const side of [-1, 1]) {
    const ex = cx + side * s * 0.35;
    const ey = cy + s * 0.15;
    const er = s * 0.2;
    for (let seg = 0; seg < 6; seg++) {
      const a = (seg / 6) * Math.PI * 2;
      const na = ((seg + 1) / 6) * Math.PI * 2;
      line(positions, ex + Math.cos(a) * er, ey + Math.sin(a) * er * 0.8, z,
        ex + Math.cos(na) * er, ey + Math.sin(na) * er * 0.8, z);
    }
  }
  // Nose
  line(positions, cx, cy, z, cx - s * 0.08, cy - s * 0.15, z);
  line(positions, cx, cy, z, cx + s * 0.08, cy - s * 0.15, z);
}

/** Wireframe bull horns */
function buildBullHorns(positions: number[], cx: number, cy: number, z: number, size: number) {
  const s = size;
  const segments = 14;
  for (let i = 0; i < segments; i++) {
    const t1 = i / segments;
    const t2 = (i + 1) / segments;
    const curve1 = Math.sin(t1 * Math.PI * 0.7);
    const curve2 = Math.sin(t2 * Math.PI * 0.7);
    // Left horn
    line(positions,
      cx - s * 0.15 - t1 * s * 0.85, cy + curve1 * s * 0.9 + t1 * s * 0.4, z,
      cx - s * 0.15 - t2 * s * 0.85, cy + curve2 * s * 0.9 + t2 * s * 0.4, z);
    // Right horn
    line(positions,
      cx + s * 0.15 + t1 * s * 0.85, cy + curve1 * s * 0.9 + t1 * s * 0.4, z,
      cx + s * 0.15 + t2 * s * 0.85, cy + curve2 * s * 0.9 + t2 * s * 0.4, z);
  }
  // Head base
  line(positions, cx - s * 0.15, cy, z, cx + s * 0.15, cy, z);
  line(positions, cx - s * 0.35, cy - s * 0.25, z, cx - s * 0.15, cy, z);
  line(positions, cx + s * 0.35, cy - s * 0.25, z, cx + s * 0.15, cy, z);
  line(positions, cx - s * 0.35, cy - s * 0.25, z, cx + s * 0.35, cy - s * 0.25, z);
  // Snout
  line(positions, cx - s * 0.2, cy - s * 0.25, z, cx - s * 0.15, cy - s * 0.4, z);
  line(positions, cx + s * 0.2, cy - s * 0.25, z, cx + s * 0.15, cy - s * 0.4, z);
  line(positions, cx - s * 0.15, cy - s * 0.4, z, cx + s * 0.15, cy - s * 0.4, z);
}

/** Massive wireframe dollar sign */
function buildGiantDollar(positions: number[], cx: number, cy: number, z: number, size: number) {
  const s = size;
  const segs = 16;
  // S-curve as smooth arc
  for (let i = 0; i < segs; i++) {
    const t1 = i / segs;
    const t2 = (i + 1) / segs;
    const a1 = Math.PI * 0.3 + t1 * Math.PI * 1.4;
    const a2 = Math.PI * 0.3 + t2 * Math.PI * 1.4;
    const r1 = s * 0.4;
    const off1 = t1 < 0.5 ? s * 0.2 : -s * 0.2;
    const off2 = t2 < 0.5 ? s * 0.2 : -s * 0.2;
    line(positions,
      cx + Math.cos(a1) * r1, cy + off1 + Math.sin(a1) * s * 0.25, z,
      cx + Math.cos(a2) * r1, cy + off2 + Math.sin(a2) * s * 0.25, z);
  }
  // Vertical bars
  line(positions, cx, cy + s * 0.7, z, cx, cy - s * 0.7, z);
  line(positions, cx - s * 0.05, cy + s * 0.7, z, cx - s * 0.05, cy - s * 0.7, z);
}

/** Wireframe Ethereum diamond (large) */
function buildGiantEth(positions: number[], cx: number, cy: number, z: number, size: number) {
  const s = size;
  // Outer diamond
  line(positions, cx, cy + s, z, cx + s * 0.6, cy, z);
  line(positions, cx, cy + s, z, cx - s * 0.6, cy, z);
  line(positions, cx, cy - s * 0.7, z, cx + s * 0.6, cy, z);
  line(positions, cx, cy - s * 0.7, z, cx - s * 0.6, cy, z);
  line(positions, cx - s * 0.6, cy, z, cx + s * 0.6, cy, z);
  line(positions, cx, cy + s, z, cx, cy - s * 0.7, z);
  // Inner diamond (smaller)
  const is = s * 0.5;
  line(positions, cx, cy + is, z, cx + is * 0.6, cy, z);
  line(positions, cx, cy + is, z, cx - is * 0.6, cy, z);
  line(positions, cx, cy - is * 0.7, z, cx + is * 0.6, cy, z);
  line(positions, cx, cy - is * 0.7, z, cx - is * 0.6, cy, z);
  // Radiating lines from tips
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const r = s * 0.15;
    line(positions, cx + Math.cos(a) * s * 0.7, cy + Math.sin(a) * s * 0.5, z,
      cx + Math.cos(a) * (s * 0.7 + r), cy + Math.sin(a) * (s * 0.5 + r), z);
  }
}

/** Data rain — vertical streaming dashed lines */
function buildDataRain(positions: number[], seed: number, columns: number,
  xRange: number, yTop: number, yBot: number, z: number) {
  const rng = seededRandom(seed);
  const dx = xRange / columns;
  for (let c = 0; c < columns; c++) {
    const x = -xRange / 2 + (c + 0.5) * dx + (rng() - 0.5) * dx * 0.4;
    const dashes = 3 + Math.floor(rng() * 8);
    const totalH = yTop - yBot;
    const startOffset = rng() * totalH * 0.3;
    for (let d = 0; d < dashes; d++) {
      const dy = startOffset + (d / dashes) * (totalH * 0.7);
      const dashLen = 8 + rng() * 25;
      const y1 = yTop - dy;
      const y2 = y1 - dashLen;
      if (y2 > yBot) {
        line(positions, x, y1, z, x, y2, z);
      }
    }
  }
}

/** Order book visualization — bid/ask horizontal bars */
function buildOrderBook(positions: number[], seed: number, cx: number, yCenter: number, z: number,
  width: number, rows: number) {
  const rng = seededRandom(seed);
  const rowH = 8;
  const midGap = 4;

  for (let i = 0; i < rows; i++) {
    // Bid side (left, green-ish)
    const bidY = yCenter + midGap + i * rowH;
    const bidW = width * (0.3 + rng() * 0.7);
    line(positions, cx - bidW, bidY, z, cx, bidY, z);
    line(positions, cx - bidW, bidY, z, cx - bidW, bidY + rowH * 0.7, z);
    line(positions, cx, bidY, z, cx, bidY + rowH * 0.7, z);
    // Depth fill lines
    const fills = Math.floor(bidW / 15);
    for (let f = 1; f < fills; f++) {
      const fx = cx - (f / fills) * bidW;
      line(positions, fx, bidY, z, fx, bidY + rowH * 0.5, z);
    }

    // Ask side (right, red-ish)
    const askY = yCenter - midGap - i * rowH;
    const askW = width * (0.3 + rng() * 0.7);
    line(positions, cx, askY, z, cx + askW, askY, z);
    line(positions, cx + askW, askY, z, cx + askW, askY - rowH * 0.7, z);
    line(positions, cx, askY, z, cx, askY - rowH * 0.7, z);
    const fills2 = Math.floor(askW / 15);
    for (let f = 1; f < fills2; f++) {
      const fx = cx + (f / fills2) * askW;
      line(positions, fx, askY, z, fx, askY - rowH * 0.5, z);
    }
  }

  // Central price line
  line(positions, cx - width * 0.1, yCenter, z, cx + width * 0.1, yCenter, z);
  // Price marker
  line(positions, cx - 3, yCenter - 3, z, cx + 3, yCenter - 3, z);
  line(positions, cx + 3, yCenter - 3, z, cx + 3, yCenter + 3, z);
  line(positions, cx + 3, yCenter + 3, z, cx - 3, yCenter + 3, z);
  line(positions, cx - 3, yCenter + 3, z, cx - 3, yCenter - 3, z);
}

/** Hash/binary data stream — hex-like rectangular character blocks */
function buildHashStream(positions: number[], seed: number, xMin: number, xMax: number,
  yCenter: number, z: number, rows: number) {
  const rng = seededRandom(seed);
  const charW = 10;
  const charH = 14;
  const cols = Math.floor((xMax - xMin) / (charW + 3));

  for (let row = 0; row < rows; row++) {
    const y = yCenter + (row - rows / 2) * (charH + 4);
    for (let col = 0; col < cols; col++) {
      if (rng() < 0.3) continue; // gaps
      const x = xMin + col * (charW + 3);
      const pattern = Math.floor(rng() * 5);

      if (pattern === 0) {
        // "0" shape
        line(positions, x + 1, y, z, x + charW - 1, y, z);
        line(positions, x + charW - 1, y, z, x + charW - 1, y + charH, z);
        line(positions, x + charW - 1, y + charH, z, x + 1, y + charH, z);
        line(positions, x + 1, y + charH, z, x + 1, y, z);
      } else if (pattern === 1) {
        // "1" shape
        line(positions, x + charW / 2, y, z, x + charW / 2, y + charH, z);
        line(positions, x + 2, y + charH, z, x + charW - 2, y + charH, z);
      } else if (pattern === 2) {
        // Hex "A" shape
        line(positions, x + 1, y + charH, z, x + charW / 2, y, z);
        line(positions, x + charW / 2, y, z, x + charW - 1, y + charH, z);
        line(positions, x + 3, y + charH * 0.55, z, x + charW - 3, y + charH * 0.55, z);
      } else if (pattern === 3) {
        // Hex "F" shape
        line(positions, x + 1, y, z, x + 1, y + charH, z);
        line(positions, x + 1, y, z, x + charW - 1, y, z);
        line(positions, x + 1, y + charH * 0.45, z, x + charW * 0.7, y + charH * 0.45, z);
      } else {
        // Block/filled rectangle
        line(positions, x, y, z, x + charW, y, z);
        line(positions, x + charW, y, z, x + charW, y + charH, z);
        line(positions, x + charW, y + charH, z, x, y + charH, z);
        line(positions, x, y + charH, z, x, y, z);
        line(positions, x, y + charH / 2, z, x + charW, y + charH / 2, z);
      }
    }
  }
}

/** Liquidity pool — concentric circles with flow arrows */
function buildLiquidityPool(positions: number[], cx: number, cy: number, z: number,
  maxRadius: number, rings: number) {
  const segs = 24;
  for (let r = 1; r <= rings; r++) {
    const radius = (r / rings) * maxRadius;
    for (let s = 0; s < segs; s++) {
      const a = (s / segs) * Math.PI * 2;
      const na = ((s + 1) / segs) * Math.PI * 2;
      line(positions, cx + Math.cos(a) * radius, cy + Math.sin(a) * radius, z,
        cx + Math.cos(na) * radius, cy + Math.sin(na) * radius, z);
    }
  }

  // Flow arrows (4 directional)
  const arrowR = maxRadius * 0.6;
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const ax = cx + Math.cos(a) * arrowR;
    const ay = cy + Math.sin(a) * arrowR;
    const tipLen = maxRadius * 0.15;
    const tipA = a + Math.PI;
    line(positions, ax, ay, z, ax + Math.cos(tipA + 0.4) * tipLen, ay + Math.sin(tipA + 0.4) * tipLen, z);
    line(positions, ax, ay, z, ax + Math.cos(tipA - 0.4) * tipLen, ay + Math.sin(tipA - 0.4) * tipLen, z);
  }

  // Token pair symbols (two small circles inside)
  for (const side of [-1, 1]) {
    const tx = cx + side * maxRadius * 0.25;
    const tr = maxRadius * 0.12;
    for (let s = 0; s < 8; s++) {
      const a = (s / 8) * Math.PI * 2;
      const na = ((s + 1) / 8) * Math.PI * 2;
      line(positions, tx + Math.cos(a) * tr, cy + Math.sin(a) * tr, z,
        tx + Math.cos(na) * tr, cy + Math.sin(na) * tr, z);
    }
  }
}

/** Massive wallet/key wireframe */
function buildWalletKey(positions: number[], cx: number, cy: number, z: number, size: number) {
  const s = size;
  // Key head (circle with inner cross)
  const headR = s * 0.3;
  const headSegs = 16;
  for (let i = 0; i < headSegs; i++) {
    const a = (i / headSegs) * Math.PI * 2;
    const na = ((i + 1) / headSegs) * Math.PI * 2;
    line(positions, cx + Math.cos(a) * headR, cy + Math.sin(a) * headR, z,
      cx + Math.cos(na) * headR, cy + Math.sin(na) * headR, z);
  }
  // Inner cross
  line(positions, cx - headR * 0.5, cy, z, cx + headR * 0.5, cy, z);
  line(positions, cx, cy - headR * 0.5, z, cx, cy + headR * 0.5, z);

  // Key shaft
  const shaftLen = s * 0.7;
  const shaftW = s * 0.06;
  line(positions, cx + headR, cy - shaftW, z, cx + headR + shaftLen, cy - shaftW, z);
  line(positions, cx + headR, cy + shaftW, z, cx + headR + shaftLen, cy + shaftW, z);

  // Key teeth
  const teeth = 3;
  const toothW = shaftLen / (teeth * 2);
  for (let t = 0; t < teeth; t++) {
    const tx = cx + headR + shaftLen - (t * 2 + 1) * toothW;
    const toothH = s * 0.08 + t * s * 0.03;
    line(positions, tx, cy - shaftW, z, tx, cy - shaftW - toothH, z);
    line(positions, tx, cy - shaftW - toothH, z, tx + toothW, cy - shaftW - toothH, z);
    line(positions, tx + toothW, cy - shaftW - toothH, z, tx + toothW, cy - shaftW, z);
  }
}

/** Volume bars along the bottom of a chart */
function buildVolumeBars(positions: number[], seed: number, xMin: number, xMax: number,
  yBase: number, z: number, bars: number, maxH: number) {
  const rng = seededRandom(seed);
  const barW = (xMax - xMin) / bars;

  for (let i = 0; i < bars; i++) {
    const x = xMin + i * barW;
    const h = maxH * (0.1 + rng() * 0.9);
    const gap = barW * 0.1;
    line(positions, x + gap, yBase, z, x + barW - gap, yBase, z);
    line(positions, x + barW - gap, yBase, z, x + barW - gap, yBase + h, z);
    line(positions, x + barW - gap, yBase + h, z, x + gap, yBase + h, z);
    line(positions, x + gap, yBase + h, z, x + gap, yBase, z);
  }
}

/** Massive Bitcoin "B" wireframe */
function buildGiantBitcoin(positions: number[], cx: number, cy: number, z: number, size: number) {
  const s = size;
  // Main vertical bar
  line(positions, cx - s * 0.25, cy + s * 0.85, z, cx - s * 0.25, cy - s * 0.85, z);
  // Top bump
  line(positions, cx - s * 0.25, cy + s * 0.85, z, cx + s * 0.15, cy + s * 0.85, z);
  line(positions, cx + s * 0.15, cy + s * 0.85, z, cx + s * 0.4, cy + s * 0.55, z);
  line(positions, cx + s * 0.4, cy + s * 0.55, z, cx + s * 0.15, cy + s * 0.2, z);
  // Bottom bump (wider)
  line(positions, cx + s * 0.15, cy + s * 0.2, z, cx + s * 0.5, cy - s * 0.1, z);
  line(positions, cx + s * 0.5, cy - s * 0.1, z, cx + s * 0.5, cy - s * 0.45, z);
  line(positions, cx + s * 0.5, cy - s * 0.45, z, cx + s * 0.15, cy - s * 0.75, z);
  // Bottom
  line(positions, cx + s * 0.15, cy - s * 0.75, z, cx - s * 0.25, cy - s * 0.75, z);
  // Middle bar
  line(positions, cx - s * 0.25, cy + s * 0.2, z, cx + s * 0.15, cy + s * 0.2, z);
  // Top/bottom serifs
  line(positions, cx - s * 0.2, cy + s, z, cx - s * 0.2, cy + s * 0.85, z);
  line(positions, cx - s * 0.2, cy - s * 0.85, z, cx - s * 0.2, cy - s, z);
  line(positions, cx - s * 0.35, cy + s, z, cx - s * 0.05, cy + s, z);
  line(positions, cx - s * 0.35, cy - s, z, cx - s * 0.05, cy - s, z);
  // Inner detail lines
  line(positions, cx - s * 0.15, cy + s * 0.6, z, cx + s * 0.2, cy + s * 0.6, z);
  line(positions, cx - s * 0.15, cy - s * 0.3, z, cx + s * 0.3, cy - s * 0.3, z);
}

// ── Crypto symbol helpers (small, for scattering) ──

function bitcoinSymbol(positions: number[], cx: number, cy: number, z: number, size: number) {
  const s = size;
  line(positions, cx - s * 0.3, cy + s, z, cx - s * 0.3, cy - s, z);
  line(positions, cx - s * 0.3, cy + s, z, cx + s * 0.2, cy + s, z);
  line(positions, cx + s * 0.2, cy + s, z, cx + s * 0.4, cy + s * 0.7, z);
  line(positions, cx + s * 0.4, cy + s * 0.7, z, cx + s * 0.2, cy + s * 0.4, z);
  line(positions, cx + s * 0.2, cy + s * 0.4, z, cx + s * 0.5, cy + s * 0.1, z);
  line(positions, cx + s * 0.5, cy + s * 0.1, z, cx + s * 0.5, cy - s * 0.2, z);
  line(positions, cx + s * 0.5, cy - s * 0.2, z, cx + s * 0.2, cy - s * 0.5, z);
  line(positions, cx + s * 0.2, cy - s * 0.5, z, cx - s * 0.3, cy - s * 0.5, z);
  line(positions, cx - s * 0.3, cy + s * 0.4, z, cx + s * 0.2, cy + s * 0.4, z);
}

function ethSymbol(positions: number[], cx: number, cy: number, z: number, size: number) {
  const s = size;
  line(positions, cx, cy + s, z, cx + s * 0.6, cy, z);
  line(positions, cx, cy + s, z, cx - s * 0.6, cy, z);
  line(positions, cx, cy - s * 0.7, z, cx + s * 0.6, cy, z);
  line(positions, cx, cy - s * 0.7, z, cx - s * 0.6, cy, z);
  line(positions, cx - s * 0.6, cy, z, cx + s * 0.6, cy, z);
  line(positions, cx, cy + s, z, cx, cy - s * 0.7, z);
}

function dollarSymbol(positions: number[], cx: number, cy: number, z: number, size: number) {
  const s = size;
  line(positions, cx + s * 0.35, cy + s * 0.7, z, cx - s * 0.1, cy + s * 0.9, z);
  line(positions, cx - s * 0.1, cy + s * 0.9, z, cx - s * 0.35, cy + s * 0.5, z);
  line(positions, cx - s * 0.35, cy + s * 0.5, z, cx + s * 0.35, cy - s * 0.1, z);
  line(positions, cx + s * 0.35, cy - s * 0.1, z, cx + s * 0.1, cy - s * 0.5, z);
  line(positions, cx + s * 0.1, cy - s * 0.5, z, cx - s * 0.35, cy - s * 0.7, z);
  line(positions, cx, cy + s * 1.1, z, cx, cy - s * 0.9, z);
}

// ── Cave config ──

interface CaveConfig {
  color: number;
  accentColor?: number;
  seed: number;
  centerY: number;
  baseRadius: number;
  depthLayers: number;
  depthSpacing: number;
  samples: number;
  jaggedness: number;
  connectStride: number;
  stalactiteDensity: number;
  rockDetailDensity: number;
  coreOpacity: number;
  glowOpacity: number;
  depthFade: number;
}

const DEFAULTS: CaveConfig = {
  color: 0x00ff88, seed: 42, centerY: 40, baseRadius: 380,
  depthLayers: 8, depthSpacing: 70, samples: 60, jaggedness: 1.0,
  connectStride: 4, stalactiteDensity: 0.25, rockDetailDensity: 0.2,
  coreOpacity: 0.25, glowOpacity: 0.10, depthFade: 0.12,
};

const CAVE_X_MIN = -HW - 120;
const CAVE_X_MAX = HW + 120;
const CAVE_CEIL = HH + 80;
const CAVE_FLOOR = -(HH + 20);

function buildCave(group: THREE.Group, cfg: Partial<CaveConfig>) {
  const c: CaveConfig = { ...DEFAULTS, ...cfg };
  const profiles: CaveProfile[][] = [];
  for (let layer = 0; layer < c.depthLayers; layer++) {
    profiles.push(generateCaveProfile(
      CAVE_X_MIN, CAVE_X_MAX, c.samples, c.centerY, c.baseRadius,
      c.seed + layer * 1000, c.jaggedness * (1 + layer * 0.15)
    ));
  }

  const frontPos: number[] = [];
  buildCaveLayer(frontPos, profiles[0], 0);
  buildStalactites(frontPos, profiles[0], 0, c.seed + 5000, c.stalactiteDensity, 10, 35);
  buildRockDetail(frontPos, profiles[0], 0, CAVE_CEIL, CAVE_FLOOR, c.seed + 6000, c.rockDetailDensity);
  group.add(buildMesh(frontPos, c.color, c.coreOpacity, c.glowOpacity));

  for (let layer = 1; layer < c.depthLayers; layer++) {
    const z = -layer * c.depthSpacing;
    const fade = 1 - layer * c.depthFade;
    const layerOpacity = Math.max(0.08, c.coreOpacity * fade);
    const layerGlow = Math.max(0.03, c.glowOpacity * fade);

    const pos: number[] = [];
    buildCaveLayer(pos, profiles[layer], z);
    if (layer < c.depthLayers / 2) {
      buildStalactites(pos, profiles[layer], z, c.seed + 5000 + layer * 100,
        c.stalactiteDensity * fade * 0.6, 6, 20);
    }
    group.add(buildMesh(pos, c.color, layerOpacity, layerGlow));

    const connPos: number[] = [];
    connectLayers(connPos, profiles[layer - 1], -(layer - 1) * c.depthSpacing,
      profiles[layer], z, c.connectStride);
    group.add(buildMesh(connPos, c.color, layerOpacity * 0.7, layerGlow * 0.6));
  }

  if (c.accentColor) {
    const accentLayer = Math.floor(c.depthLayers * 0.4);
    const accentZ = -accentLayer * c.depthSpacing - c.depthSpacing * 0.5;
    const accentProfile = generateCaveProfile(
      CAVE_X_MIN, CAVE_X_MAX, Math.floor(c.samples * 0.7),
      c.centerY, c.baseRadius * 1.15, c.seed + 9000, c.jaggedness * 0.8
    );
    const accentPos: number[] = [];
    buildCaveLayer(accentPos, accentProfile, accentZ);
    group.add(buildMesh(accentPos, c.accentColor, 0.12, 0.05));
  }
}

// ══════════════════════════════════════════════
// ── LEVEL BUILDERS — each completely unique ──
// ══════════════════════════════════════════════

/** Level 0: Genesis Block — blockchain cubes, giant BTC symbol, hash streams, data rain */
function buildLevel0(group: THREE.Group) {
  buildCave(group, {
    color: 0x1199aa, accentColor: 0x22ccdd, seed: 100, baseRadius: 420,
    jaggedness: 0.4, depthLayers: 6, depthSpacing: 85, connectStride: 5,
    stalactiteDensity: 0.08, rockDetailDensity: 0.08, samples: 40,
  });

  // Massive Bitcoin symbol centerpiece
  const btcPos: number[] = [];
  buildGiantBitcoin(btcPos, 0, 20, -150, 180);
  group.add(buildMesh(btcPos, 0x44eeff, 0.28, 0.14));

  // Floating blockchain blocks at various depths
  const blockPos: number[] = [];
  buildBlockchainBlocks(blockPos, 100, 16, 800, 600, -60, -350, 35);
  group.add(buildMesh(blockPos, 0x22ccdd, 0.24, 0.12));

  // Hash stream (genesis block data)
  const hashPos: number[] = [];
  buildHashStream(hashPos, 103, -350, 350, -100, -250, 4);
  group.add(buildMesh(hashPos, 0x1199aa, 0.16, 0.07));

  // Data rain in the background
  const rainPos: number[] = [];
  buildDataRain(rainPos, 101, 35, 900, 380, -380, -200);
  group.add(buildMesh(rainPos, 0x22bbcc, 0.14, 0.06));

  // Scatter bitcoin symbols (larger)
  const symPos: number[] = [];
  const rng = seededRandom(102);
  for (let i = 0; i < 6; i++) {
    bitcoinSymbol(symPos, (rng() - 0.5) * 700, (rng() - 0.5) * 450, -80 - rng() * 200, 22 + rng() * 20);
  }
  group.add(buildMesh(symPos, 0x55eeff, 0.20, 0.09));
}

/** Level 1: Bull Trap — giant bull horns, pump chart with volume, rocket trails */
function buildLevel1(group: THREE.Group) {
  buildCave(group, {
    color: 0x11aa44, accentColor: 0x44ff88, seed: 200, centerY: 60,
    baseRadius: 400, jaggedness: 0.6, depthLayers: 7, depthSpacing: 75,
    stalactiteDensity: 0.15, rockDetailDensity: 0.12, connectStride: 4,
  });

  // Giant bull horns centerpiece (bigger)
  const hornPos: number[] = [];
  buildBullHorns(hornPos, 0, 10, -140, 200);
  group.add(buildMesh(hornPos, 0x44ff88, 0.30, 0.14));

  // Smaller bull horns scattered
  const horn2Pos: number[] = [];
  buildBullHorns(horn2Pos, -280, 80, -280, 85);
  buildBullHorns(horn2Pos, 300, -30, -250, 70);
  group.add(buildMesh(horn2Pos, 0x22cc66, 0.18, 0.08));

  // Massive rising chart with volume bars
  const chartPos: number[] = [];
  buildGiantChart(chartPos, 201, -400, 400, -30, 250, -200, 30);
  group.add(buildMesh(chartPos, 0x00ff44, 0.20, 0.09));

  // Volume bars underneath chart
  const volPos: number[] = [];
  buildVolumeBars(volPos, 204, -400, 400, -250, -200, 30, 80);
  group.add(buildMesh(volPos, 0x22cc66, 0.14, 0.06));

  // Rocket trails (things going up!)
  const rocketPos: number[] = [];
  buildRocketTrails(rocketPos, 202, 4, 700, -220, -300);
  group.add(buildMesh(rocketPos, 0x88ffaa, 0.16, 0.07));

  // Order book in corner
  const obPos: number[] = [];
  buildOrderBook(obPos, 203, -250, 60, -320, 120, 8);
  group.add(buildMesh(obPos, 0x33dd77, 0.12, 0.05));
}

/** Level 2: Liquidation Cascade — lightning, crashing chart, order book collapse, hash chaos */
function buildLevel2(group: THREE.Group) {
  buildCave(group, {
    color: 0x882233, accentColor: 0xcc3344, seed: 300, centerY: 30,
    baseRadius: 340, jaggedness: 1.8, depthLayers: 12, depthSpacing: 42,
    connectStride: 2, stalactiteDensity: 0.55, rockDetailDensity: 0.45,
    samples: 80, coreOpacity: 0.28, glowOpacity: 0.12,
  });

  // Lightning bolts (liquidation strikes!) — more and closer
  const boltPos: number[] = [];
  buildLightningBolts(boltPos, 300, 12, 800, 380, -380, -80);
  group.add(buildMesh(boltPos, 0xff4444, 0.30, 0.14));

  // More lightning deeper
  const bolt2Pos: number[] = [];
  buildLightningBolts(bolt2Pos, 301, 6, 600, 300, -300, -220);
  group.add(buildMesh(bolt2Pos, 0xcc2233, 0.18, 0.08));

  // Massive waterfall staircase chart
  const stairPos: number[] = [];
  buildStaircaseChart(stairPos, 302, -380, 380, 260, -150, 10);
  group.add(buildMesh(stairPos, 0xff6644, 0.22, 0.10));

  // Order book (collapsing)
  const obPos: number[] = [];
  buildOrderBook(obPos, 305, 200, 30, -280, 140, 10);
  group.add(buildMesh(obPos, 0xff4433, 0.16, 0.07));

  // Warning patterns scattered — more prominent
  const warnPos: number[] = [];
  buildWarningPatterns(warnPos, 303, 12, 700, 500, -180);
  group.add(buildMesh(warnPos, 0xff3333, 0.22, 0.10));

  // Data rain (falling prices) — denser
  const rainPos: number[] = [];
  buildDataRain(rainPos, 304, 50, 800, 350, -350, -120);
  group.add(buildMesh(rainPos, 0xcc3344, 0.14, 0.06));
}

/** Level 3: Pump & Dump — rockets, giant chart with volume, dollar signs, order book */
function buildLevel3(group: THREE.Group) {
  buildCave(group, {
    color: 0xaa7722, accentColor: 0xddaa33, seed: 400, centerY: 50,
    baseRadius: 380, jaggedness: 0.9, depthLayers: 8, depthSpacing: 65,
    stalactiteDensity: 0.25, connectStride: 3,
  });

  // Massive rocket trails (pump phase) — bigger
  const rocketPos: number[] = [];
  buildRocketTrails(rocketPos, 400, 6, 800, -220, -140);
  group.add(buildMesh(rocketPos, 0xffcc44, 0.26, 0.12));

  // Giant candlestick chart
  const chartPos: number[] = [];
  buildGiantChart(chartPos, 401, -420, 420, 20, 280, -200, 22);
  group.add(buildMesh(chartPos, 0xddaa33, 0.22, 0.10));

  // Volume bars
  const volPos: number[] = [];
  buildVolumeBars(volPos, 405, -420, 420, -200, -200, 22, 90);
  group.add(buildMesh(volPos, 0xcc8822, 0.16, 0.07));

  // Giant dollar sign
  const dollarPos: number[] = [];
  buildGiantDollar(dollarPos, -200, 40, -280, 120);
  group.add(buildMesh(dollarPos, 0xffcc44, 0.20, 0.09));

  // Dollar signs scattered (larger)
  const symPos: number[] = [];
  const rng = seededRandom(402);
  for (let i = 0; i < 8; i++) {
    dollarSymbol(symPos, (rng() - 0.5) * 700, (rng() - 0.5) * 500, -60 - rng() * 250, 24 + rng() * 22);
  }
  group.add(buildMesh(symPos, 0xffaa00, 0.18, 0.08));

  // Order book
  const obPos: number[] = [];
  buildOrderBook(obPos, 403, 220, -40, -320, 130, 9);
  group.add(buildMesh(obPos, 0xddaa33, 0.12, 0.05));
}

/** Level 4: Diamond Formation — massive ETH diamond, crystals, liquidity pools */
function buildLevel4(group: THREE.Group) {
  buildCave(group, {
    color: 0x2288cc, accentColor: 0x66bbff, seed: 500, centerY: 40,
    baseRadius: 370, jaggedness: 1.5, depthLayers: 9, depthSpacing: 55,
    stalactiteDensity: 0.45, rockDetailDensity: 0.35, connectStride: 2,
    samples: 85, coreOpacity: 0.22, glowOpacity: 0.09,
  });

  // Massive Ethereum diamond centerpiece
  const ethPos: number[] = [];
  buildGiantEth(ethPos, 0, 20, -130, 190);
  group.add(buildMesh(ethPos, 0x66ccff, 0.30, 0.14));

  // Crystal formations throughout (more, bigger)
  const crystalPos: number[] = [];
  buildCrystals(crystalPos, 500, 25, 900, 650, -40, -350, [30, 80]);
  group.add(buildMesh(crystalPos, 0x44bbff, 0.22, 0.10));

  // Liquidity pools
  const poolPos: number[] = [];
  buildLiquidityPool(poolPos, -250, 50, -220, 80, 5);
  buildLiquidityPool(poolPos, 280, -40, -260, 65, 4);
  group.add(buildMesh(poolPos, 0x55ddff, 0.20, 0.09));

  // Wallet/key shape
  const keyPos: number[] = [];
  buildWalletKey(keyPos, 200, 100, -350, 100);
  group.add(buildMesh(keyPos, 0x3399dd, 0.14, 0.06));

  // Scatter eth symbols (larger)
  const symPos: number[] = [];
  const rng = seededRandom(502);
  for (let i = 0; i < 8; i++) {
    ethSymbol(symPos, (rng() - 0.5) * 700, (rng() - 0.5) * 500, -80 - rng() * 200, 20 + rng() * 18);
  }
  group.add(buildMesh(symPos, 0x55ccff, 0.18, 0.08));

  // Hash stream (smart contracts)
  const hashPos: number[] = [];
  buildHashStream(hashPos, 503, -300, 300, -120, -300, 3);
  group.add(buildMesh(hashPos, 0x2288cc, 0.12, 0.05));
}

/** Level 5: Bear Market — massive claw marks, crashing chart, skulls, collapsed order book */
function buildLevel5(group: THREE.Group) {
  buildCave(group, {
    color: 0x661122, accentColor: 0x992233, seed: 600, centerY: 10,
    baseRadius: 320, jaggedness: 1.5, depthLayers: 13, depthSpacing: 40,
    stalactiteDensity: 0.55, rockDetailDensity: 0.45, connectStride: 2,
    samples: 70, coreOpacity: 0.28, glowOpacity: 0.12,
  });

  // Bear claw marks slashing across the scene — bigger, closer
  const clawPos: number[] = [];
  buildClawMarks(clawPos, 600, 14, 800, 550, -100);
  group.add(buildMesh(clawPos, 0xff3344, 0.32, 0.15));

  // More claws deeper
  const claw2Pos: number[] = [];
  buildClawMarks(claw2Pos, 601, 8, 700, 450, -250);
  group.add(buildMesh(claw2Pos, 0xcc2233, 0.18, 0.08));

  // Massive descending staircase chart
  const stairPos: number[] = [];
  buildStaircaseChart(stairPos, 602, -400, 400, 280, -140, 12);
  group.add(buildMesh(stairPos, 0xff4455, 0.24, 0.11));

  // Collapsed order book
  const obPos: number[] = [];
  buildOrderBook(obPos, 604, -200, -20, -250, 130, 10);
  group.add(buildMesh(obPos, 0xcc3344, 0.16, 0.07));

  // Warning symbols — more
  const warnPos: number[] = [];
  buildWarningPatterns(warnPos, 603, 10, 600, 450, -200);
  group.add(buildMesh(warnPos, 0xff4455, 0.18, 0.08));

  // Giant skull centerpiece
  const skullPos: number[] = [];
  buildSkull(skullPos, 0, 30, -160, 90);
  group.add(buildMesh(skullPos, 0xff3344, 0.22, 0.10));

  // Smaller skulls scattered
  const skull2Pos: number[] = [];
  buildSkull(skull2Pos, -250, 60, -300, 50);
  buildSkull(skull2Pos, 270, -30, -320, 45);
  group.add(buildMesh(skull2Pos, 0x993344, 0.14, 0.06));
}

/** Level 6: The Halving — giant BTC symbol split, halving blocks, hash streams */
function buildLevel6(group: THREE.Group) {
  buildCave(group, {
    color: 0x6644aa, accentColor: 0xddaa44, seed: 700, centerY: 45,
    baseRadius: 400, jaggedness: 0.5, depthLayers: 7, depthSpacing: 80,
    connectStride: 4, stalactiteDensity: 0.12, rockDetailDensity: 0.08,
  });

  // Halving blocks visualization (bigger)
  const halvPos: number[] = [];
  buildHalvingBlocks(halvPos, 700, -400, 400, 30, -160);
  group.add(buildMesh(halvPos, 0xddaa44, 0.26, 0.12));

  // Central vertical dividing line (the halving split) — more dramatic
  const divPos: number[] = [];
  for (let offset = -4; offset <= 4; offset += 2) {
    line(divPos, offset, 420, -80, offset, -420, -80);
  }
  for (let d = 0; d < 25; d++) {
    const y = -380 + d * 32;
    line(divPos, -12, y, -80, 12, y, -80);
  }
  group.add(buildMesh(divPos, 0xffcc44, 0.24, 0.11));

  // Giant BTC symbol on left
  const btcPos: number[] = [];
  buildGiantBitcoin(btcPos, -220, 30, -220, 120);
  group.add(buildMesh(btcPos, 0xaa88ff, 0.22, 0.10));

  // Giant ETH on right
  const ethPos: number[] = [];
  buildGiantEth(ethPos, 220, 30, -220, 110);
  group.add(buildMesh(ethPos, 0xddaa44, 0.22, 0.10));

  // Hash streams (mining computation)
  const hashPos: number[] = [];
  buildHashStream(hashPos, 702, -350, -50, 100, -300, 3);
  buildHashStream(hashPos, 703, 50, 350, 100, -300, 3);
  group.add(buildMesh(hashPos, 0x8866cc, 0.14, 0.06));

  // Scattered symbols
  const symPos: number[] = [];
  const rng = seededRandom(701);
  for (let i = 0; i < 5; i++) {
    bitcoinSymbol(symPos, -150 - rng() * 200, (rng() - 0.5) * 400, -100 - rng() * 180, 24 + rng() * 16);
    ethSymbol(symPos, 150 + rng() * 200, (rng() - 0.5) * 400, -100 - rng() * 180, 22 + rng() * 16);
  }
  group.add(buildMesh(symPos, 0xbb99dd, 0.16, 0.07));
}

/** Level 7: DeFi Maze — circuit boards, network nodes, liquidity pools, hash streams */
function buildLevel7(group: THREE.Group) {
  buildCave(group, {
    color: 0x1155ee, accentColor: 0x33aaff, seed: 800, centerY: 35,
    baseRadius: 350, jaggedness: 1.8, depthLayers: 11, depthSpacing: 45,
    stalactiteDensity: 0.40, rockDetailDensity: 0.45, connectStride: 2,
    samples: 90, coreOpacity: 0.22, glowOpacity: 0.09,
  });

  // Circuit board traces — denser, closer
  const circPos: number[] = [];
  buildCircuitTraces(circPos, 800, 25, 800, 550, -100);
  group.add(buildMesh(circPos, 0x33aaff, 0.26, 0.12));

  const circ2Pos: number[] = [];
  buildCircuitTraces(circ2Pos, 801, 15, 650, 450, -250);
  group.add(buildMesh(circ2Pos, 0x2266cc, 0.16, 0.07));

  // Network graph (DeFi protocol connections) — more nodes
  const netPos: number[] = [];
  buildNetworkGraph(netPos, 802, 35, 800, 550, -180, 160);
  group.add(buildMesh(netPos, 0x44ccff, 0.22, 0.10));

  // Liquidity pools
  const poolPos: number[] = [];
  buildLiquidityPool(poolPos, -200, 60, -160, 90, 6);
  buildLiquidityPool(poolPos, 230, -40, -200, 75, 5);
  buildLiquidityPool(poolPos, 0, -80, -300, 60, 4);
  group.add(buildMesh(poolPos, 0x55ddff, 0.20, 0.09));

  // Hash streams (smart contracts executing)
  const hashPos: number[] = [];
  buildHashStream(hashPos, 804, -380, 380, -60, -280, 4);
  group.add(buildMesh(hashPos, 0x2288dd, 0.14, 0.06));

  // Data streams
  const dataPos: number[] = [];
  buildDataRain(dataPos, 803, 45, 800, 350, -350, -140);
  group.add(buildMesh(dataPos, 0x1155ee, 0.14, 0.06));

  // Wallet keys (access to protocols)
  const keyPos: number[] = [];
  buildWalletKey(keyPos, -280, -60, -350, 80);
  buildWalletKey(keyPos, 300, 100, -380, 70);
  group.add(buildMesh(keyPos, 0x3388cc, 0.12, 0.05));
}

/** Level 8: Margin Call — massive skull, warnings, lightning, order book collapse, hash chaos */
function buildLevel8(group: THREE.Group) {
  buildCave(group, {
    color: 0xaa2211, accentColor: 0xff6622, seed: 900, centerY: 20,
    baseRadius: 310, jaggedness: 1.8, depthLayers: 14, depthSpacing: 36,
    stalactiteDensity: 0.60, rockDetailDensity: 0.50, connectStride: 2,
    samples: 85, coreOpacity: 0.30, glowOpacity: 0.14, depthFade: 0.08,
  });

  // Massive skull centerpiece (even bigger)
  const skullPos: number[] = [];
  buildSkull(skullPos, 0, 30, -120, 140);
  group.add(buildMesh(skullPos, 0xff4422, 0.32, 0.15));

  // Smaller skulls scattered
  const skull2Pos: number[] = [];
  buildSkull(skull2Pos, -280, 60, -240, 55);
  buildSkull(skull2Pos, 300, -20, -280, 50);
  buildSkull(skull2Pos, -120, -90, -340, 35);
  buildSkull(skull2Pos, 150, 100, -360, 30);
  group.add(buildMesh(skull2Pos, 0xcc3311, 0.18, 0.08));

  // Warning patterns everywhere — max chaos
  const warnPos: number[] = [];
  buildWarningPatterns(warnPos, 901, 20, 800, 550, -150);
  group.add(buildMesh(warnPos, 0xff6633, 0.24, 0.11));

  // Lightning (margin liquidation) — intense
  const boltPos: number[] = [];
  buildLightningBolts(boltPos, 902, 10, 700, 350, -350, -180);
  group.add(buildMesh(boltPos, 0xff8844, 0.24, 0.11));

  // Crashed order book
  const obPos: number[] = [];
  buildOrderBook(obPos, 905, -250, -40, -260, 120, 8);
  group.add(buildMesh(obPos, 0xdd4422, 0.16, 0.07));

  // Staircase chart (cascading liquidations)
  const stairPos: number[] = [];
  buildStaircaseChart(stairPos, 903, -350, 350, 240, -200, 9);
  group.add(buildMesh(stairPos, 0xdd4422, 0.18, 0.08));

  // Hash stream (transaction chaos)
  const hashPos: number[] = [];
  buildHashStream(hashPos, 906, -350, 350, 80, -300, 3);
  group.add(buildMesh(hashPos, 0xaa3311, 0.12, 0.05));

  // Claw marks
  const clawPos: number[] = [];
  buildClawMarks(clawPos, 904, 8, 600, 450, -280);
  group.add(buildMesh(clawPos, 0xff3322, 0.14, 0.06));
}

/** Level 9: The Flippening — massive dollar, BTC vs ETH, crossover, everything converges */
function buildLevel9(group: THREE.Group) {
  buildCave(group, {
    color: 0x7733cc, accentColor: 0xaa55ff, seed: 1000, centerY: 55,
    baseRadius: 430, jaggedness: 1.0, depthLayers: 10, depthSpacing: 65,
    connectStride: 3, stalactiteDensity: 0.25, rockDetailDensity: 0.20,
    coreOpacity: 0.26, glowOpacity: 0.11,
  });

  // Giant dollar sign centerpiece (final boss — huge)
  const dollarPos: number[] = [];
  buildGiantDollar(dollarPos, 0, 20, -120, 220);
  group.add(buildMesh(dollarPos, 0xcc88ff, 0.32, 0.15));

  // Crossover chart (BTC/ETH lines crossing) — prominent
  const crossPos: number[] = [];
  buildCrossoverChart(crossPos, 1000, -420, 420, 20, -180);
  group.add(buildMesh(crossPos, 0xaa66ff, 0.26, 0.12));

  // Giant ETH diamond on right
  const ethPos: number[] = [];
  buildGiantEth(ethPos, 240, 40, -240, 120);
  group.add(buildMesh(ethPos, 0x66bbff, 0.22, 0.10));

  // Giant BTC symbol on left
  const btcPos: number[] = [];
  buildGiantBitcoin(btcPos, -240, 40, -240, 110);
  group.add(buildMesh(btcPos, 0xffaa44, 0.22, 0.10));

  // Blockchain blocks (bigger, more)
  const blockPos: number[] = [];
  buildBlockchainBlocks(blockPos, 1001, 14, 700, 500, -80, -350, 30);
  group.add(buildMesh(blockPos, 0x8855cc, 0.18, 0.08));

  // Liquidity pools (DeFi finale)
  const poolPos: number[] = [];
  buildLiquidityPool(poolPos, -150, -60, -280, 70, 5);
  buildLiquidityPool(poolPos, 180, -80, -310, 60, 4);
  group.add(buildMesh(poolPos, 0xaa77ee, 0.16, 0.07));

  // Hash streams (all chains computing)
  const hashPos: number[] = [];
  buildHashStream(hashPos, 1004, -380, 380, -80, -300, 4);
  group.add(buildMesh(hashPos, 0x7744cc, 0.14, 0.06));

  // Volume bars (final volume explosion)
  const volPos: number[] = [];
  buildVolumeBars(volPos, 1005, -400, 400, -220, -200, 25, 100);
  group.add(buildMesh(volPos, 0x9955dd, 0.14, 0.06));

  // Crystal formations (new era crystallizing)
  const crystPos: number[] = [];
  buildCrystals(crystPos, 1003, 12, 800, 550, -100, -320, [25, 60]);
  group.add(buildMesh(crystPos, 0xbb88ff, 0.14, 0.06));

  // Concentric rings (power emanating)
  const ringPos: number[] = [];
  buildConcentricRings(ringPos, 0, 20, -350, 8, 200, 10);
  group.add(buildMesh(ringPos, 0x7744bb, 0.10, 0.04));
}

function makeNebulaTexture(seed: number, palette: AtmospherePalette): THREE.Texture {
  const size = 768;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    const fallback = new Uint8Array([0, 0, 0, 255]);
    const tex = new THREE.DataTexture(fallback, 1, 1);
    tex.needsUpdate = true;
    return tex;
  }

  const rng = seededRandom(seed);
  ctx.fillStyle = toRgba(0x030507, 1);
  ctx.fillRect(0, 0, size, size);

  ctx.globalCompositeOperation = 'lighter';
  const colors = [palette.nebulaA, palette.nebulaB, palette.nebulaC];
  for (let i = 0; i < 26; i++) {
    const cx = rng() * size;
    const cy = rng() * size;
    const radius = size * (0.12 + rng() * 0.3);
    const color = colors[i % colors.length];
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
    grad.addColorStop(0, toRgba(color, 0.16 + rng() * 0.18));
    grad.addColorStop(0.5, toRgba(color, 0.05 + rng() * 0.08));
    grad.addColorStop(1, toRgba(color, 0));
    ctx.fillStyle = grad;
    ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);
  }

  ctx.globalCompositeOperation = 'source-over';
  ctx.strokeStyle = toRgba(palette.starlight, 0.1);
  for (let i = 0; i < 120; i++) {
    const x = rng() * size;
    const y = rng() * size;
    const len = 2 + rng() * 12;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + len, y + len * 0.15);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1.2, 1.2);
  tex.needsUpdate = true;
  return tex;
}

function makeStarTexture(starlight: number): THREE.Texture {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    const fallback = new Uint8Array([255, 255, 255, 255]);
    const tex = new THREE.DataTexture(fallback, 1, 1);
    tex.needsUpdate = true;
    return tex;
  }

  const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, toRgba(starlight, 1));
  grad.addColorStop(0.25, toRgba(starlight, 0.9));
  grad.addColorStop(0.55, toRgba(starlight, 0.25));
  grad.addColorStop(1, toRgba(starlight, 0));
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function addNebulaPlanes(group: THREE.Group, palette: AtmospherePalette, rng: () => number, state: BackgroundAnimationState) {
  const nebulaTexture = makeNebulaTexture(20000 + Math.floor(rng() * 5000), palette);
  const nebulaRoot = new THREE.Group();
  nebulaRoot.renderOrder = -30;
  group.add(nebulaRoot);

  for (let i = 0; i < 3; i++) {
    const plane = new THREE.Mesh(
      new THREE.PlaneGeometry(1900 - i * 220, 1350 - i * 150),
      new THREE.MeshBasicMaterial({
        map: nebulaTexture,
        color: i === 2 ? palette.nebulaC : i === 1 ? palette.nebulaB : palette.nebulaA,
        transparent: true,
        opacity: 0.12 + (2 - i) * 0.05,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    plane.position.set((rng() - 0.5) * 140, (rng() - 0.5) * 90, -520 - i * 220);
    plane.rotation.z = rng() * Math.PI * 2;
    plane.renderOrder = -30 + i;
    plane.frustumCulled = false;
    nebulaRoot.add(plane);

    state.movers.push({
      object: plane,
      basePosition: plane.position.clone(),
      baseRotationZ: plane.rotation.z,
      driftX: 10 + i * 5,
      driftY: 7 + i * 4,
      driftZ: 5 + i * 3,
      sway: 0.025 + i * 0.01,
      speed: 0.08 + i * 0.03,
      phase: rng() * Math.PI * 2,
    });
    const mat = plane.material;
    if (hasOpacity(mat)) {
      state.pulses.push({
        material: mat,
        baseOpacity: mat.opacity,
        amplitude: 0.18 + i * 0.05,
        speed: 0.2 + i * 0.08,
        phase: rng() * Math.PI * 2,
      });
    }
  }
}

function addStarfield(group: THREE.Group, palette: AtmospherePalette, rng: () => number, state: BackgroundAnimationState) {
  const starTexture = makeStarTexture(palette.starlight);
  const starRoot = new THREE.Group();
  starRoot.renderOrder = -15;
  group.add(starRoot);

  const layers = [
    { count: 450, size: 2.6, opacity: 0.82, zMin: -260, zMax: -700 },
    { count: 300, size: 1.8, opacity: 0.62, zMin: -430, zMax: -980 },
  ];
  for (let li = 0; li < layers.length; li++) {
    const layer = layers[li];
    const positions = new Float32Array(layer.count * 3);
    const colors = new Float32Array(layer.count * 3);
    const c = new THREE.Color();
    for (let i = 0; i < layer.count; i++) {
      const idx = i * 3;
      positions[idx] = (rng() - 0.5) * 2200;
      positions[idx + 1] = (rng() - 0.5) * 1400;
      positions[idx + 2] = layer.zMin - rng() * (layer.zMax - layer.zMin);
      c.setHex(rng() > 0.84 ? palette.accent : palette.starlight);
      const tint = 0.7 + rng() * 0.3;
      colors[idx] = c.r * tint;
      colors[idx + 1] = c.g * tint;
      colors[idx + 2] = c.b * tint;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

    const material = new THREE.PointsMaterial({
      map: starTexture,
      size: layer.size,
      sizeAttenuation: true,
      color: 0xffffff,
      vertexColors: true,
      transparent: true,
      opacity: layer.opacity,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    });
    const points = new THREE.Points(geometry, material);
    points.frustumCulled = false;
    points.renderOrder = -14 + li;
    starRoot.add(points);

    state.movers.push({
      object: points,
      basePosition: points.position.clone(),
      baseRotationZ: points.rotation.z,
      driftX: li === 0 ? 12 : 20,
      driftY: li === 0 ? 6 : 10,
      driftZ: li === 0 ? 8 : 14,
      sway: li === 0 ? 0.014 : 0.022,
      speed: li === 0 ? 0.09 : 0.06,
      phase: rng() * Math.PI * 2,
    });
    state.pulses.push({
      material,
      baseOpacity: material.opacity,
      amplitude: 0.18,
      speed: 0.4 + li * 0.18,
      phase: rng() * Math.PI * 2,
    });
  }
}

function addEnergyStreaks(group: THREE.Group, palette: AtmospherePalette, rng: () => number, state: BackgroundAnimationState) {
  const streakPos: number[] = [];
  for (let i = 0; i < 110; i++) {
    const x = (rng() - 0.5) * 1400;
    const y = (rng() - 0.5) * 900;
    const z = -220 - rng() * 740;
    const len = 35 + rng() * 160;
    const angle = -0.5 + rng() * 1.0;
    line(streakPos, x, y, z, x + Math.cos(angle) * len, y + Math.sin(angle) * len, z - rng() * 80);
  }
  const streaks = buildMesh(streakPos, palette.accent, 0.07, 0.035);
  streaks.renderOrder = -5;
  group.add(streaks);
  state.movers.push({
    object: streaks,
    basePosition: streaks.position.clone(),
    baseRotationZ: streaks.rotation.z,
    driftX: 8,
    driftY: 14,
    driftZ: 10,
    sway: 0.02,
    speed: 0.11,
    phase: rng() * Math.PI * 2,
  });
}

function registerLinePulses(group: THREE.Group, rng: () => number, state: BackgroundAnimationState) {
  group.traverse((obj) => {
    if (!(obj instanceof THREE.LineSegments)) return;
    const material = obj.material;
    const materials = Array.isArray(material) ? material : [material];
    for (const mat of materials) {
      if (!hasOpacity(mat) || !mat.transparent || mat.opacity <= 0) continue;
      state.pulses.push({
        material: mat,
        baseOpacity: mat.opacity,
        amplitude: mat.blending === THREE.AdditiveBlending ? 0.16 : 0.08,
        speed: 0.18 + rng() * 1.1,
        phase: rng() * Math.PI * 2,
      });
    }
  });
}

function buildAtmosphere(group: THREE.Group, levelIndex: number): BackgroundAnimationState {
  const palette = ATMOSPHERE_PALETTES[levelIndex] ?? ATMOSPHERE_PALETTES[0];
  const rng = seededRandom(12000 + levelIndex * 977);
  const state: BackgroundAnimationState = {
    pulses: [],
    movers: [],
    baseGroupRotationZ: group.rotation.z,
    baseGroupX: group.position.x,
    baseGroupY: group.position.y,
    phase: rng() * Math.PI * 2,
  };
  addNebulaPlanes(group, palette, rng, state);
  addStarfield(group, palette, rng, state);
  addEnergyStreaks(group, palette, rng, state);
  registerLinePulses(group, rng, state);
  return state;
}

// ══════════════════════════════════════════════
// ── EXPORT ──
// ══════════════════════════════════════════════

export function buildBackground(_renderer: Renderer, levelIndex: number): THREE.Group {
  const group = new THREE.Group();
  const builders = [
    buildLevel0, buildLevel1, buildLevel2, buildLevel3, buildLevel4,
    buildLevel5, buildLevel6, buildLevel7, buildLevel8, buildLevel9,
  ];
  (builders[levelIndex] ?? builders[0])(group);
  group.userData.backgroundAnimation = buildAtmosphere(group, levelIndex);
  return group;
}

export function animateBackground(group: THREE.Group, now: number) {
  const state = group.userData.backgroundAnimation as BackgroundAnimationState | undefined;
  if (!state) return;

  const t = now * 0.001;
  group.rotation.z = state.baseGroupRotationZ + Math.sin(t * 0.08 + state.phase) * 0.01;
  group.position.x = state.baseGroupX + Math.sin(t * 0.13 + state.phase * 0.7) * 5;
  group.position.y = state.baseGroupY + Math.sin(t * 0.11 + state.phase * 0.5) * 4;

  for (const mover of state.movers) {
    mover.object.position.x = mover.basePosition.x + Math.sin(t * mover.speed + mover.phase) * mover.driftX;
    mover.object.position.y = mover.basePosition.y + Math.cos(t * (mover.speed * 0.8) + mover.phase) * mover.driftY;
    mover.object.position.z = mover.basePosition.z + Math.sin(t * (mover.speed * 0.55) + mover.phase) * mover.driftZ;
    mover.object.rotation.z = mover.baseRotationZ + Math.sin(t * 0.16 + mover.phase) * mover.sway;
  }

  for (const pulse of state.pulses) {
    const wave = 1 + Math.sin(t * pulse.speed + pulse.phase) * pulse.amplitude;
    pulse.material.opacity = Math.max(0.01, Math.min(1, pulse.baseOpacity * wave));
  }
}
