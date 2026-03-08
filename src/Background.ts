import * as THREE from 'three';
import { SVGLoader } from 'three/examples/jsm/loaders/SVGLoader.js';
import { GAME_WIDTH, GAME_HEIGHT } from './constants';
import type { Renderer } from './Renderer';
import aaveSvg from '../logos/aave-aave-logo.svg?raw';
import avaxSvg from '../logos/avalanche-avax-logo.svg?raw';
import adaSvg from '../logos/cardano-ada-logo.svg?raw';
import atomSvg from '../logos/cosmos-atom-logo.svg?raw';
import bnbSvg from '../logos/bnb-bnb-logo.svg?raw';
import btcSvg from '../logos/bitcoin-btc-logo.svg?raw';
import daiSvg from '../logos/multi-collateral-dai-dai-logo.svg?raw';
import dogeSvg from '../logos/dogecoin-doge-logo.svg?raw';
import ethSvg from '../logos/ethereum-eth-logo.svg?raw';
import linkSvg from '../logos/chainlink-link-logo.svg?raw';
import ltcSvg from '../logos/litecoin-ltc-logo.svg?raw';
import solSvg from '../logos/solana-sol-logo.svg?raw';
import uniSvg from '../logos/uniswap-uni-logo.svg?raw';
import usdcSvg from '../logos/usd-coin-usdc-logo.svg?raw';
import xmrSvg from '../logos/monero-xmr-logo.svg?raw';
import xrpSvg from '../logos/xrp-xrp-logo.svg?raw';
import antennaMastSvg from '../logos/antenna-mast.svg?raw';
import bearClawSvg from '../logos/bear-claw.svg?raw';
import bullHornsSvg from '../logos/bull-horns.svg?raw';
import candlestickSvg from '../logos/candlestick.svg?raw';
import chainLinkSvg from '../logos/chain-link.svg?raw';
import circuitPanelSvg from '../logos/circuit-panel.svg?raw';
import diamondSvg from '../logos/diamond.svg?raw';
import gatewayFrameSvg from '../logos/gateway-frame.svg?raw';
import hexGridTileSvg from '../logos/hex-grid-tile.svg?raw';
import lightningBoltSvg from '../logos/lightning-bolt.svg?raw';
import pipeFlangeSvg from '../logos/pipe-flange.svg?raw';
import radialRingSvg from '../logos/radial-ring.svg?raw';
import rocketGlyphSvg from '../logos/rocket.svg?raw';
import serverRackSvg from '../logos/server-rack.svg?raw';
import skullGlyphSvg from '../logos/skull.svg?raw';
import trussSegmentSvg from '../logos/truss-segment.svg?raw';
import vaultDoorSvg from '../logos/vault-door.svg?raw';
import warningTriangleSvg from '../logos/warning-triangle.svg?raw';
import whaleTailSvg from '../logos/whale-tail.svg?raw';

const HW = GAME_WIDTH / 2;
const HH = GAME_HEIGHT / 2;
const SVG_LOADER = new SVGLoader();

const LOGO_SVGS = {
  aave: aaveSvg,
  avax: avaxSvg,
  ada: adaSvg,
  atom: atomSvg,
  bnb: bnbSvg,
  btc: btcSvg,
  dai: daiSvg,
  doge: dogeSvg,
  eth: ethSvg,
  link: linkSvg,
  ltc: ltcSvg,
  sol: solSvg,
  uni: uniSvg,
  usdc: usdcSvg,
  xmr: xmrSvg,
  xrp: xrpSvg,
  antenna: antennaMastSvg,
  bearClaw: bearClawSvg,
  bullHorns: bullHornsSvg,
  candlestick: candlestickSvg,
  chain: chainLinkSvg,
  circuit: circuitPanelSvg,
  diamondGlyph: diamondSvg,
  gateway: gatewayFrameSvg,
  hexGrid: hexGridTileSvg,
  lightning: lightningBoltSvg,
  pipe: pipeFlangeSvg,
  radialRing: radialRingSvg,
  rocketGlyph: rocketGlyphSvg,
  serverRack: serverRackSvg,
  skullGlyph: skullGlyphSvg,
  truss: trussSegmentSvg,
  vaultDoor: vaultDoorSvg,
  warning: warningTriangleSvg,
  whaleTail: whaleTailSvg,
} as const;

type LogoKey = keyof typeof LOGO_SVGS;

interface AtmospherePalette {
  nebulaA: number;
  nebulaB: number;
  nebulaC: number;
  starlight: number;
  accent: number;
}

type HeroMotif = 'halo' | 'gateway' | 'split' | 'spire' | 'prism';

interface BackgroundArtPreset {
  name: string;
  heroMotif: HeroMotif;
  heroScale: number;
  heroY: number;
  pulseBias: number;
  frameStrength: number;
  starDensity: number;
  streakAngle: number;
}

interface BackgroundArtDirection {
  name: string;
  palette: AtmospherePalette;
  heroMotif: HeroMotif;
  heroScale: number;
  heroY: number;
  pulseBias: number;
  frameStrength: number;
  starDensity: number;
  streakAngle: number;
}

interface LogoPlacement {
  key: LogoKey;
  x: number;
  y: number;
  z: number;
  size: number;
  rotation?: number;
  fillOpacity?: number;
  lineOpacity?: number;
  glowOpacity?: number;
  color?: number;
}

interface BackgroundPulse {
  material: THREE.Material & { opacity: number };
  baseOpacity: number;
  amplitude: number;
  speed: number;
  phase: number;
  moodInfluence: number;
  eventInfluence: number;
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
  parallaxFactor: number;
  moodInfluence: number;
  eventInfluence: number;
}

interface BackgroundAnimationState {
  pulses: BackgroundPulse[];
  movers: BackgroundMover[];
  baseGroupRotationZ: number;
  baseGroupX: number;
  baseGroupY: number;
  phase: number;
  artDirection: BackgroundArtDirection;
  smoothedMoodPulse: number;
  smoothedEventPulse: number;
  smoothedParallaxX: number;
  smoothedParallaxY: number;
}

export interface BackgroundRuntimeControls {
  moodPulse?: number;
  eventPulse?: number;
  parallaxX?: number;
  parallaxY?: number;
  ballEnergy?: number;
}

const ATMOSPHERE_PALETTES: AtmospherePalette[] = [
  { nebulaA: 0x0f3946, nebulaB: 0x1d8797, nebulaC: 0x56d9ff, starlight: 0x9dffff, accent: 0x45e6ff },
  { nebulaA: 0x0d311a, nebulaB: 0x1f8f3f, nebulaC: 0x67f39a, starlight: 0xa0ffd2, accent: 0x53ff93 },
  { nebulaA: 0x4a1217, nebulaB: 0xb13537, nebulaC: 0xff7a72, starlight: 0xffdfd8, accent: 0xff7662 },
  { nebulaA: 0x2e1a04, nebulaB: 0x956322, nebulaC: 0xffc462, starlight: 0xfff0bf, accent: 0xffc44d },
  { nebulaA: 0x071e35, nebulaB: 0x1f6fa3, nebulaC: 0x74d5ff, starlight: 0xd7f3ff, accent: 0x7ddaff },
  { nebulaA: 0x43111a, nebulaB: 0xa42d3f, nebulaC: 0xff7684, starlight: 0xffd7dd, accent: 0xff6c7c },
  { nebulaA: 0x261732, nebulaB: 0x6f4aab, nebulaC: 0xe5b75a, starlight: 0xffebbf, accent: 0xf4bf4d },
  { nebulaA: 0x081b3a, nebulaB: 0x1564b8, nebulaC: 0x5fe0ff, starlight: 0xd4f7ff, accent: 0x52d7ff },
  { nebulaA: 0x4a1610, nebulaB: 0xc04428, nebulaC: 0xff9d66, starlight: 0xffe8d5, accent: 0xff8c57 },
  { nebulaA: 0x240b3b, nebulaB: 0x7640d1, nebulaC: 0xd38fff, starlight: 0xf4d9ff, accent: 0xc27dff },
];

const BACKGROUND_ART_PRESETS: BackgroundArtPreset[] = [
  { name: 'Genesis Structure', heroMotif: 'halo', heroScale: 210, heroY: 20, pulseBias: 0.52, frameStrength: 0.66, starDensity: 0.72, streakAngle: -0.35 },
  { name: 'Bull Cathedral', heroMotif: 'gateway', heroScale: 220, heroY: 38, pulseBias: 0.64, frameStrength: 0.60, starDensity: 0.58, streakAngle: -0.58 },
  { name: 'Liquidation Fault', heroMotif: 'split', heroScale: 220, heroY: 16, pulseBias: 0.36, frameStrength: 0.76, starDensity: 0.46, streakAngle: -0.08 },
  { name: 'Pump Apex', heroMotif: 'spire', heroScale: 205, heroY: 22, pulseBias: 0.62, frameStrength: 0.62, starDensity: 0.56, streakAngle: -0.75 },
  { name: 'Diamond Vault', heroMotif: 'prism', heroScale: 215, heroY: 28, pulseBias: 0.58, frameStrength: 0.64, starDensity: 0.60, streakAngle: -0.42 },
  { name: 'Bear Pressure', heroMotif: 'split', heroScale: 225, heroY: 10, pulseBias: 0.34, frameStrength: 0.74, starDensity: 0.42, streakAngle: -0.12 },
  { name: 'Halving Axis', heroMotif: 'gateway', heroScale: 228, heroY: 24, pulseBias: 0.50, frameStrength: 0.62, starDensity: 0.52, streakAngle: -0.30 },
  { name: 'DeFi Network', heroMotif: 'prism', heroScale: 212, heroY: 18, pulseBias: 0.56, frameStrength: 0.68, starDensity: 0.58, streakAngle: -0.52 },
  { name: 'Margin Shock', heroMotif: 'spire', heroScale: 215, heroY: 12, pulseBias: 0.40, frameStrength: 0.78, starDensity: 0.44, streakAngle: -0.02 },
  { name: 'Flippening Gate', heroMotif: 'halo', heroScale: 240, heroY: 26, pulseBias: 0.70, frameStrength: 0.64, starDensity: 0.56, streakAngle: -0.60 },
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

const WALL_THICK_WIDTH = 0.09;
const WALL_THICK_STEPS = 2;

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

function pushPolyline(positions: number[], points: Array<[number, number]>, z: number, closed = true) {
  if (points.length < 2) return;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    line(positions, a[0], a[1], z, b[0], b[1], z);
  }
  if (closed) {
    const first = points[0];
    const last = points[points.length - 1];
    line(positions, last[0], last[1], z, first[0], first[1], z);
  }
}

function addFilledPolygon(group: THREE.Group, points: Array<[number, number]>, z: number, color: number,
  opacity: number, renderOrder: number, blend: THREE.Blending = THREE.NormalBlending) {
  if (points.length < 3) return null;
  const shape = new THREE.Shape();
  shape.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) {
    shape.lineTo(points[i][0], points[i][1]);
  }
  shape.closePath();
  const geometry = new THREE.ShapeGeometry(shape);
  const material = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthWrite: false,
    depthTest: false,
    toneMapped: false,
    blending: blend,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.z = z;
  mesh.renderOrder = renderOrder;
  mesh.frustumCulled = false;
  group.add(mesh);
  return mesh;
}

function addLayeredSilhouette(group: THREE.Group, points: Array<[number, number]>, z: number, fillColor: number,
  lineColor: number, fillOpacity: number, lineOpacity: number, glowOpacity: number, renderOrder: number) {
  const fill = addFilledPolygon(group, points, z, fillColor, fillOpacity, renderOrder);
  const outlinePos: number[] = [];
  pushPolyline(outlinePos, points, z + 0.5, true);
  const outline = buildMesh(outlinePos, lineColor, lineOpacity, glowOpacity);
  outline.renderOrder = renderOrder + 1;
  group.add(outline);
  return { fill, outline };
}

const logoTemplateCache = new Map<LogoKey, { template: THREE.Group; unitSize: number }>();

function getLogoTemplate(key: LogoKey) {
  const cached = logoTemplateCache.get(key);
  if (cached) return cached;

  const data = SVG_LOADER.parse(LOGO_SVGS[key]);
  const root = new THREE.Group();
  const outlinePos: number[] = [];

  for (const path of data.paths) {
    const shapes = SVGLoader.createShapes(path);
    for (const shape of shapes) {
      const geometry = new THREE.ShapeGeometry(shape);
      const fill = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.08,
        depthWrite: false,
        depthTest: false,
        toneMapped: false,
        side: THREE.DoubleSide,
      }));
      fill.userData.logoPart = 'fill';
      fill.frustumCulled = false;
      root.add(fill);

      const points = shape.getPoints(56);
      if (points.length < 2) continue;
      for (let i = 0; i < points.length - 1; i++) {
        const a = points[i];
        const b = points[i + 1];
        line(outlinePos, a.x, -a.y, 0, b.x, -b.y, 0);
      }
      const first = points[0];
      const last = points[points.length - 1];
      line(outlinePos, last.x, -last.y, 0, first.x, -first.y, 0);
    }
  }

  for (const child of root.children) {
    if (child instanceof THREE.Mesh) {
      child.scale.y = -1;
    }
  }

  const outline = buildMesh(outlinePos, 0xffffff, 0.28, 0.12);
  if (outline.children[0] instanceof THREE.LineSegments) outline.children[0].userData.logoPart = 'core';
  if (outline.children[1] instanceof THREE.LineSegments) outline.children[1].userData.logoPart = 'glow';
  root.add(outline);

  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const normalized = new THREE.Group();
  root.position.set(-center.x, -center.y, 0);
  normalized.add(root);

  const result = { template: normalized, unitSize: Math.max(size.x, size.y) || 1 };
  logoTemplateCache.set(key, result);
  return result;
}

function buildLogoInstance(placement: LogoPlacement): THREE.Group {
  const cached = getLogoTemplate(placement.key);
  const group = cached.template.clone(true);
  const color = placement.color ?? 0xffffff;

  group.traverse((obj) => {
    if (obj instanceof THREE.Mesh && obj.material instanceof THREE.MeshBasicMaterial) {
      obj.material = obj.material.clone();
      obj.material.color.setHex(color);
      obj.material.opacity = placement.fillOpacity ?? 0.07;
    }
    if (obj instanceof THREE.LineSegments) {
      const part = obj.userData.logoPart;
      if (obj.material instanceof THREE.LineBasicMaterial) {
        obj.material = obj.material.clone();
        obj.material.color.setHex(color);
        obj.material.opacity = part === 'glow'
          ? (placement.glowOpacity ?? 0.09)
          : (placement.lineOpacity ?? 0.22);
      }
    }
  });

  const scale = placement.size / cached.unitSize;
  group.scale.setScalar(scale);
  group.position.set(placement.x, placement.y, placement.z);
  group.rotation.z = placement.rotation ?? 0;
  return group;
}

function addLogoPlacements(group: THREE.Group, placements: LogoPlacement[]) {
  const placed: THREE.Group[] = [];
  for (const placement of placements) {
    const logo = buildLogoInstance(placement);
    group.add(logo);
    placed.push(logo);
  }
  return placed;
}

function registerLogoMover(state: BackgroundAnimationState, object: THREE.Object3D, rng: () => number,
  parallaxFactor: number, drift = 2.5, sway = 0.006, speed = 0.06) {
  state.movers.push({
    object,
    basePosition: object.position.clone(),
    baseRotationZ: object.rotation.z,
    driftX: drift,
    driftY: drift * 0.8,
    driftZ: drift,
    sway,
    speed,
    phase: rng() * Math.PI * 2,
    parallaxFactor,
    moodInfluence: 0.35,
    eventInfluence: 0.35,
  });
}

function addStageMotifComposition(group: THREE.Group, levelIndex: number, art: BackgroundArtDirection, rng: () => number,
  state: BackgroundAnimationState) {
  const accent = lerpHex(art.palette.accent, art.palette.starlight, 0.12);
  const muted = lerpHex(art.palette.starlight, art.palette.nebulaB, 0.34);
  const shadow = lerpHex(art.palette.nebulaA, 0x040608, 0.58);
  const placements: LogoPlacement[] = [];

  switch (levelIndex) {
    case 0:
      placements.push(
        { key: 'gateway', x: 0, y: 12, z: -520, size: 500, color: muted, fillOpacity: 0.018, lineOpacity: 0.08, glowOpacity: 0.03 },
        { key: 'radialRing', x: 0, y: 28, z: -340, size: 280, color: accent, fillOpacity: 0.012, lineOpacity: 0.10, glowOpacity: 0.04 },
        { key: 'serverRack', x: -184, y: -22, z: -310, size: 118, color: muted, fillOpacity: 0.02, lineOpacity: 0.09, glowOpacity: 0.04 },
        { key: 'serverRack', x: 184, y: -22, z: -310, size: 118, color: muted, fillOpacity: 0.02, lineOpacity: 0.09, glowOpacity: 0.04 },
        { key: 'chain', x: -106, y: 176, z: -260, size: 82, color: accent, rotation: -0.2 },
        { key: 'chain', x: 106, y: 176, z: -260, size: 82, color: accent, rotation: 0.2 },
      );
      break;
    case 1:
      placements.push(
        { key: 'bullHorns', x: 0, y: 50, z: -310, size: 340, color: accent, fillOpacity: 0.026, lineOpacity: 0.14, glowOpacity: 0.06 },
        { key: 'candlestick', x: -184, y: -18, z: -290, size: 120, color: muted },
        { key: 'candlestick', x: 184, y: -18, z: -290, size: 120, color: muted },
        { key: 'rocketGlyph', x: -126, y: 150, z: -245, size: 82, color: accent, rotation: -0.28 },
        { key: 'rocketGlyph', x: 126, y: 150, z: -245, size: 82, color: accent, rotation: 0.28 },
      );
      break;
    case 2:
      placements.push(
        { key: 'warning', x: 0, y: 26, z: -330, size: 250, color: accent, fillOpacity: 0.018, lineOpacity: 0.12, glowOpacity: 0.05 },
        { key: 'lightning', x: -132, y: 168, z: -250, size: 84, color: accent, rotation: -0.18 },
        { key: 'lightning', x: 132, y: 168, z: -250, size: 84, color: accent, rotation: 0.18 },
        { key: 'bearClaw', x: -190, y: -20, z: -285, size: 140, color: muted, rotation: -0.08 },
        { key: 'bearClaw', x: 190, y: -20, z: -285, size: 140, color: muted, rotation: 0.08 },
      );
      break;
    case 3:
      placements.push(
        { key: 'rocketGlyph', x: 0, y: 48, z: -340, size: 220, color: accent, fillOpacity: 0.02, lineOpacity: 0.11, glowOpacity: 0.05 },
        { key: 'candlestick', x: -185, y: -24, z: -300, size: 116, color: muted },
        { key: 'candlestick', x: 185, y: -24, z: -300, size: 116, color: muted },
        { key: 'warning', x: 0, y: -120, z: -250, size: 88, color: accent },
      );
      break;
    case 4:
      placements.push(
        { key: 'radialRing', x: 0, y: 24, z: -360, size: 336, color: muted, fillOpacity: 0.01, lineOpacity: 0.08, glowOpacity: 0.03 },
        { key: 'diamondGlyph', x: 0, y: 28, z: -250, size: 360, color: accent, fillOpacity: 0.03, lineOpacity: 0.18, glowOpacity: 0.08 },
        { key: 'hexGrid', x: -174, y: 48, z: -300, size: 104, color: muted },
        { key: 'hexGrid', x: 174, y: 48, z: -300, size: 104, color: muted },
      );
      break;
    case 5:
      placements.push(
        { key: 'skullGlyph', x: 0, y: 20, z: -280, size: 260, color: accent, fillOpacity: 0.024, lineOpacity: 0.13, glowOpacity: 0.06 },
        { key: 'bearClaw', x: -180, y: 110, z: -270, size: 138, color: muted, rotation: -0.16 },
        { key: 'bearClaw', x: 180, y: 110, z: -270, size: 138, color: muted, rotation: 0.16 },
        { key: 'warning', x: 0, y: -116, z: -250, size: 96, color: accent },
      );
      break;
    case 6:
      placements.push(
        { key: 'gateway', x: 0, y: 14, z: -430, size: 420, color: muted, fillOpacity: 0.018, lineOpacity: 0.08, glowOpacity: 0.03 },
        { key: 'chain', x: 0, y: -90, z: -280, size: 122, color: accent, rotation: Math.PI / 2 },
        { key: 'radialRing', x: -220, y: 34, z: -280, size: 126, color: 0xc4a5ff, fillOpacity: 0.01, lineOpacity: 0.08, glowOpacity: 0.03 },
        { key: 'radialRing', x: 220, y: 34, z: -280, size: 126, color: 0xe2b956, fillOpacity: 0.01, lineOpacity: 0.08, glowOpacity: 0.03 },
      );
      break;
    case 7:
      placements.push(
        { key: 'circuit', x: 0, y: 16, z: -300, size: 320, color: accent, fillOpacity: 0.018, lineOpacity: 0.12, glowOpacity: 0.05 },
        { key: 'serverRack', x: -190, y: 18, z: -300, size: 124, color: muted },
        { key: 'serverRack', x: 190, y: 18, z: -300, size: 124, color: muted },
        { key: 'hexGrid', x: -96, y: 170, z: -250, size: 92, color: accent },
        { key: 'hexGrid', x: 96, y: 170, z: -250, size: 92, color: accent },
      );
      break;
    case 8:
      placements.push(
        { key: 'vaultDoor', x: 0, y: 10, z: -390, size: 270, color: muted, fillOpacity: 0.02, lineOpacity: 0.10, glowOpacity: 0.04 },
        { key: 'warning', x: 0, y: 28, z: -300, size: 150, color: accent, fillOpacity: 0.012, lineOpacity: 0.10, glowOpacity: 0.04 },
        { key: 'lightning', x: -134, y: 160, z: -250, size: 82, color: accent, rotation: -0.1 },
        { key: 'lightning', x: 134, y: 160, z: -250, size: 82, color: accent, rotation: 0.1 },
      );
      break;
    case 9:
      placements.push(
        { key: 'gateway', x: 0, y: 18, z: -430, size: 430, color: muted, fillOpacity: 0.018, lineOpacity: 0.08, glowOpacity: 0.03 },
        { key: 'radialRing', x: 0, y: 26, z: -280, size: 290, color: accent, fillOpacity: 0.014, lineOpacity: 0.12, glowOpacity: 0.05 },
        { key: 'truss', x: -176, y: -28, z: -285, size: 132, color: muted, rotation: Math.PI / 2 },
        { key: 'truss', x: 176, y: -28, z: -285, size: 132, color: muted, rotation: Math.PI / 2 },
      );
      break;
    default:
      break;
  }

  const placed = addLogoPlacements(group, placements);
  for (const logo of placed) {
    const isHero = Math.abs(logo.position.x) < 30 && logo.scale.x > 0.3;
    registerLogoMover(state, logo, rng, isHero ? 0.58 : 0.42, isHero ? 2.2 : 1.6, isHero ? 0.008 : 0.005, isHero ? 0.05 : 0.06);
  }

  if (levelIndex === 0 || levelIndex === 6 || levelIndex === 9) {
    const chainRow = addLogoPlacements(group, [
      { key: 'chain', x: -64, y: -118, z: -240, size: 62, color: shadow, rotation: 0.22, fillOpacity: 0.015, lineOpacity: 0.08, glowOpacity: 0.02 },
      { key: 'chain', x: 0, y: -118, z: -240, size: 62, color: shadow, fillOpacity: 0.015, lineOpacity: 0.08, glowOpacity: 0.02 },
      { key: 'chain', x: 64, y: -118, z: -240, size: 62, color: shadow, rotation: -0.22, fillOpacity: 0.015, lineOpacity: 0.08, glowOpacity: 0.02 },
    ]);
    for (const logo of chainRow) registerLogoMover(state, logo, rng, 0.34, 1.2, 0.003, 0.05);
  }
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
  color: 0x00ff88, seed: 42, centerY: 40, baseRadius: 500,
  depthLayers: 8, depthSpacing: 70, samples: 60, jaggedness: 1.0,
  connectStride: 4, stalactiteDensity: 0.25, rockDetailDensity: 0.2,
  coreOpacity: 0.32, glowOpacity: 0.14, depthFade: 0.13,
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
  group.add(buildMesh(frontPos, c.color, c.coreOpacity * 0.72, c.glowOpacity * 0.62));

  for (let layer = 1; layer < c.depthLayers; layer++) {
    if (layer > 2 && layer % 2 !== 0) continue;
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
    color: 0x1199aa, accentColor: 0x22ccdd, seed: 100, baseRadius: 560,
    jaggedness: 0.4, depthLayers: 6, depthSpacing: 85, connectStride: 5,
    stalactiteDensity: 0.08, rockDetailDensity: 0.08, samples: 40,
    coreOpacity: 0.40, glowOpacity: 0.18, depthFade: 0.07,
  });

  // Massive Bitcoin symbol centerpiece
  const btcPos: number[] = [];
  buildGiantBitcoin(btcPos, 0, 20, -150, 180);
  group.add(buildMesh(btcPos, 0x44eeff, 0.50, 0.28));
  addLogoPlacements(group, [
    { key: 'btc', x: 0, y: 26, z: -190, size: 210, color: 0x66f4ff, fillOpacity: 0.045, lineOpacity: 0.18, glowOpacity: 0.10 },
  ]);

  // Floating blockchain blocks at various depths
  const blockPos: number[] = [];
  buildBlockchainBlocks(blockPos, 100, 16, 800, 600, -60, -350, 35);
  group.add(buildMesh(blockPos, 0x22ccdd, 0.43, 0.24));

  addLogoPlacements(group, [
    { key: 'btc', x: -166, y: 176, z: -300, size: 70, color: 0x4ceaff },
    { key: 'usdc', x: 166, y: 160, z: -300, size: 64, color: 0x58efff },
  ]);
}

/** Level 1: Bull Trap — giant bull horns, pump chart with volume, rocket trails */
function buildLevel1(group: THREE.Group) {
  buildCave(group, {
    color: 0x11aa44, accentColor: 0x44ff88, seed: 200, centerY: 60,
    baseRadius: 520, jaggedness: 0.45, depthLayers: 5, depthSpacing: 90,
    stalactiteDensity: 0.08, rockDetailDensity: 0.05, connectStride: 6,
    samples: 54, coreOpacity: 0.28, glowOpacity: 0.12, depthFade: 0.11,
  });

  // Keep one bold centerpiece and one market signal. Avoid stacked line systems.
  const hornPos: number[] = [];
  buildBullHorns(hornPos, 0, 10, -140, 200);
  group.add(buildMesh(hornPos, 0x44ff88, 0.58, 0.30));

  const chartPos: number[] = [];
  buildGiantChart(chartPos, 201, -320, 320, -10, 210, -210, 12);
  group.add(buildMesh(chartPos, 0x27ff6d, 0.24, 0.10));

  addLogoPlacements(group, [
    { key: 'doge', x: -150, y: 170, z: -260, size: 74, color: 0x8bffad },
    { key: 'sol', x: 158, y: 138, z: -290, size: 76, color: 0x65ff9f, rotation: -0.04 },
  ]);
}

/** Level 2: Liquidation Cascade — lightning, crashing chart, order book collapse, hash chaos */
function buildLevel2(group: THREE.Group) {
  buildCave(group, {
    color: 0x882233, accentColor: 0xcc3344, seed: 300, centerY: 30,
    baseRadius: 440, jaggedness: 1.4, depthLayers: 8, depthSpacing: 56,
    connectStride: 3, stalactiteDensity: 0.24, rockDetailDensity: 0.16,
    samples: 64, coreOpacity: 0.30, glowOpacity: 0.12, depthFade: 0.12,
  });

  const boltPos: number[] = [];
  buildLightningBolts(boltPos, 300, 5, 620, 310, -310, -90);
  group.add(buildMesh(boltPos, 0xff5a58, 0.42, 0.20));

  const bolt2Pos: number[] = [];
  buildLightningBolts(bolt2Pos, 301, 2, 420, 240, -240, -220);
  group.add(buildMesh(bolt2Pos, 0xd13b43, 0.20, 0.08));

  const stairPos: number[] = [];
  buildStaircaseChart(stairPos, 302, -300, 300, 220, -120, 7);
  group.add(buildMesh(stairPos, 0xff7a5a, 0.28, 0.12));

}

/** Level 3: Pump & Dump — rockets, giant chart with volume, dollar signs, order book */
function buildLevel3(group: THREE.Group) {
  buildCave(group, {
    color: 0xaa7722, accentColor: 0xddaa33, seed: 400, centerY: 50,
    baseRadius: 505, jaggedness: 0.9, depthLayers: 8, depthSpacing: 65,
    stalactiteDensity: 0.25, connectStride: 3,
    coreOpacity: 0.40, glowOpacity: 0.18, depthFade: 0.07,
  });

  // Giant candlestick chart
  const chartPos: number[] = [];
  buildGiantChart(chartPos, 401, -420, 420, 20, 280, -200, 22);
  group.add(buildMesh(chartPos, 0xddaa33, 0.40, 0.20));

  // Volume bars
  const volPos: number[] = [];
  buildVolumeBars(volPos, 405, -420, 420, -200, -200, 22, 90);
  group.add(buildMesh(volPos, 0xcc8822, 0.29, 0.14));

  addLogoPlacements(group, [
    { key: 'doge', x: -160, y: 176, z: -260, size: 70, color: 0xffcb62 },
    { key: 'sol', x: 164, y: 158, z: -280, size: 68, color: 0xffdd6a },
    { key: 'avax', x: 0, y: -124, z: -300, size: 76, color: 0xffce5a },
  ]);
}

/** Level 4: Diamond Formation — massive ETH diamond, crystals, liquidity pools */
function buildLevel4(group: THREE.Group) {
  buildCave(group, {
    color: 0x2288cc, accentColor: 0x66bbff, seed: 500, centerY: 40,
    baseRadius: 490, jaggedness: 1.5, depthLayers: 9, depthSpacing: 55,
    stalactiteDensity: 0.45, rockDetailDensity: 0.35, connectStride: 2,
    samples: 85, coreOpacity: 0.40, glowOpacity: 0.18, depthFade: 0.07,
  });

  addLogoPlacements(group, [
    { key: 'diamondGlyph', x: 0, y: 18, z: -170, size: 252, color: 0x8ce0ff, fillOpacity: 0.06, lineOpacity: 0.22, glowOpacity: 0.12 },
    { key: 'eth', x: -164, y: 166, z: -260, size: 68, color: 0x79ccff },
    { key: 'link', x: 172, y: 152, z: -285, size: 62, color: 0x57c7ff },
  ]);
}

/** Level 5: Bear Market — massive claw marks, crashing chart, skulls, collapsed order book */
function buildLevel5(group: THREE.Group) {
  buildCave(group, {
    color: 0x661122, accentColor: 0x992233, seed: 600, centerY: 10,
    baseRadius: 425, jaggedness: 1.5, depthLayers: 13, depthSpacing: 40,
    stalactiteDensity: 0.55, rockDetailDensity: 0.45, connectStride: 2,
    samples: 70, coreOpacity: 0.42, glowOpacity: 0.18, depthFade: 0.07,
  });

  // Bear claw marks slashing across the scene — bigger, closer
  const clawPos: number[] = [];
  buildClawMarks(clawPos, 600, 14, 800, 550, -100);
  group.add(buildMesh(clawPos, 0xff3344, 0.58, 0.30));

  // Giant skull centerpiece
  const skullPos: number[] = [];
  buildSkull(skullPos, 0, 30, -160, 90);
  group.add(buildMesh(skullPos, 0xff3344, 0.40, 0.20));
}

/** Level 6: The Halving — giant BTC symbol split, halving blocks, hash streams */
function buildLevel6(group: THREE.Group) {
  buildCave(group, {
    color: 0x6644aa, accentColor: 0xddaa44, seed: 700, centerY: 45,
    baseRadius: 530, jaggedness: 0.5, depthLayers: 7, depthSpacing: 80,
    connectStride: 4, stalactiteDensity: 0.12, rockDetailDensity: 0.08,
    coreOpacity: 0.40, glowOpacity: 0.18, depthFade: 0.07,
  });

  // Halving blocks visualization (bigger)
  const halvPos: number[] = [];
  buildHalvingBlocks(halvPos, 700, -400, 400, 30, -160);
  group.add(buildMesh(halvPos, 0xddaa44, 0.47, 0.24));

  // Central vertical dividing line (the halving split) — more dramatic
  const divPos: number[] = [];
  for (let offset = -4; offset <= 4; offset += 2) {
    line(divPos, offset, 420, -80, offset, -420, -80);
  }
  for (let d = 0; d < 25; d++) {
    const y = -380 + d * 32;
    line(divPos, -12, y, -80, 12, y, -80);
  }
  group.add(buildMesh(divPos, 0xffcc44, 0.43, 0.22));

  // Giant BTC symbol on left
  const btcPos: number[] = [];
  buildGiantBitcoin(btcPos, -220, 30, -220, 120);
  group.add(buildMesh(btcPos, 0xaa88ff, 0.40, 0.20));
  addLogoPlacements(group, [
    { key: 'btc', x: -220, y: 30, z: -246, size: 122, color: 0xc4a5ff, fillOpacity: 0.04, lineOpacity: 0.16, glowOpacity: 0.09 },
  ]);

  // Giant ETH on right
  const ethPos: number[] = [];
  buildGiantEth(ethPos, 220, 30, -220, 110);
  group.add(buildMesh(ethPos, 0xddaa44, 0.40, 0.20));
  addLogoPlacements(group, [
    { key: 'eth', x: 220, y: 28, z: -246, size: 118, color: 0xe2b956, fillOpacity: 0.04, lineOpacity: 0.16, glowOpacity: 0.09 },
  ]);

  addLogoPlacements(group, [
    { key: 'btc', x: -166, y: 188, z: -300, size: 64, color: 0xd5b4ff },
    { key: 'eth', x: 158, y: 182, z: -300, size: 62, color: 0xf0c36a },
  ]);
}

/** Level 7: DeFi Maze — circuit boards, network nodes, liquidity pools, hash streams */
function buildLevel7(group: THREE.Group) {
  buildCave(group, {
    color: 0x1155ee, accentColor: 0x33aaff, seed: 800, centerY: 35,
    baseRadius: 465, jaggedness: 1.8, depthLayers: 11, depthSpacing: 45,
    stalactiteDensity: 0.40, rockDetailDensity: 0.45, connectStride: 2,
    samples: 90, coreOpacity: 0.40, glowOpacity: 0.18, depthFade: 0.07,
  });

  // Network graph (DeFi protocol connections) — more nodes
  const netPos: number[] = [];
  buildNetworkGraph(netPos, 802, 35, 800, 550, -180, 160);
  group.add(buildMesh(netPos, 0x44ccff, 0.40, 0.20));
  addLogoPlacements(group, [
    { key: 'uni', x: -160, y: 170, z: -260, size: 78, color: 0x63c6ff },
    { key: 'aave', x: 166, y: 166, z: -280, size: 76, color: 0x6cd8ff },
    { key: 'link', x: 0, y: -126, z: -300, size: 64, color: 0x74d8ff },
  ]);
}

/** Level 8: Margin Call — massive skull, warnings, lightning, order book collapse, hash chaos */
function buildLevel8(group: THREE.Group) {
  buildCave(group, {
    color: 0xaa2211, accentColor: 0xff6622, seed: 900, centerY: 20,
    baseRadius: 410, jaggedness: 1.8, depthLayers: 14, depthSpacing: 36,
    stalactiteDensity: 0.60, rockDetailDensity: 0.50, connectStride: 2,
    samples: 85, coreOpacity: 0.45, glowOpacity: 0.21, depthFade: 0.06,
  });

  // Massive skull centerpiece (even bigger)
  const skullPos: number[] = [];
  buildSkull(skullPos, 0, 30, -120, 140);
  group.add(buildMesh(skullPos, 0xff4422, 0.58, 0.30));

  // Lightning (margin liquidation) — intense
  const boltPos: number[] = [];
  buildLightningBolts(boltPos, 902, 10, 700, 350, -350, -180);
  group.add(buildMesh(boltPos, 0xff8844, 0.43, 0.22));
}

/** Level 9: The Flippening — massive dollar, BTC vs ETH, crossover, everything converges */
function buildLevel9(group: THREE.Group) {
  buildCave(group, {
    color: 0x7733cc, accentColor: 0xaa55ff, seed: 1000, centerY: 55,
    baseRadius: 570, jaggedness: 1.0, depthLayers: 10, depthSpacing: 65,
    connectStride: 3, stalactiteDensity: 0.25, rockDetailDensity: 0.20,
    coreOpacity: 0.40, glowOpacity: 0.18, depthFade: 0.07,
  });

  // Giant dollar sign centerpiece (final boss — huge)
  const dollarPos: number[] = [];
  buildGiantDollar(dollarPos, 0, 20, -120, 220);
  group.add(buildMesh(dollarPos, 0xcc88ff, 0.58, 0.30));

  // Crossover chart (BTC/ETH lines crossing) — prominent
  const crossPos: number[] = [];
  buildCrossoverChart(crossPos, 1000, -420, 420, 20, -180);
  group.add(buildMesh(crossPos, 0xaa66ff, 0.47, 0.24));

  // Giant ETH diamond on right
  const ethPos: number[] = [];
  buildGiantEth(ethPos, 240, 40, -240, 120);
  group.add(buildMesh(ethPos, 0x66bbff, 0.40, 0.20));
  addLogoPlacements(group, [
    { key: 'eth', x: 240, y: 38, z: -268, size: 128, color: 0x95ccff, fillOpacity: 0.04, lineOpacity: 0.16, glowOpacity: 0.09 },
  ]);

  // Giant BTC symbol on left
  const btcPos: number[] = [];
  buildGiantBitcoin(btcPos, -240, 40, -240, 110);
  group.add(buildMesh(btcPos, 0xffaa44, 0.40, 0.20));
  addLogoPlacements(group, [
    { key: 'btc', x: -240, y: 38, z: -268, size: 118, color: 0xffbf66, fillOpacity: 0.04, lineOpacity: 0.16, glowOpacity: 0.09 },
  ]);

  addLogoPlacements(group, [
    { key: 'sol', x: 0, y: 176, z: -260, size: 82, color: 0xc28fff },
    { key: 'uni', x: -164, y: -92, z: -250, size: 70, color: 0xd396ff },
    { key: 'aave', x: 168, y: -92, z: -250, size: 70, color: 0xba85ff },
  ]);
}

function buildTowerPoints(cx: number, baseY: number, topY: number, baseWidth: number, topWidth: number,
  lean = 0, crown = 0): Array<[number, number]> {
  const halfBase = baseWidth / 2;
  const halfTop = topWidth / 2;
  const topCx = cx + lean;
  return [
    [cx - halfBase, baseY],
    [cx - halfBase * 0.86, baseY + crown],
    [topCx - halfTop, topY],
    [topCx + halfTop, topY],
    [cx + halfBase * 0.86, baseY + crown],
    [cx + halfBase, baseY],
  ];
}

function addLightCone(group: THREE.Group, x: number, topY: number, bottomY: number, topWidth: number,
  bottomWidth: number, z: number, color: number, opacity: number, renderOrder: number,
  state: BackgroundAnimationState, rng: () => number, parallaxFactor: number) {
  const points: Array<[number, number]> = [
    [x - topWidth / 2, topY],
    [x + topWidth / 2, topY],
    [x + bottomWidth / 2, bottomY],
    [x - bottomWidth / 2, bottomY],
  ];
  const mesh = addFilledPolygon(group, points, z, color, opacity, renderOrder, THREE.AdditiveBlending);
  if (!mesh) return;
  state.movers.push({
    object: mesh,
    basePosition: mesh.position.clone(),
    baseRotationZ: mesh.rotation.z,
    driftX: 2,
    driftY: 5,
    driftZ: 4,
    sway: 0.004,
    speed: 0.06,
    phase: rng() * Math.PI * 2,
    parallaxFactor,
    moodInfluence: 0.45,
    eventInfluence: 0.8,
  });
  const mat = mesh.material;
  if (hasOpacity(mat)) {
    state.pulses.push({
      material: mat,
      baseOpacity: mat.opacity,
      amplitude: 0.08,
      speed: 0.18,
      phase: rng() * Math.PI * 2,
      moodInfluence: 0.8,
      eventInfluence: 1.0,
    });
  }
}

function addArchitecturalMasses(group: THREE.Group, art: BackgroundArtDirection, rng: () => number, state: BackgroundAnimationState) {
  const shadowColor = lerpHex(art.palette.nebulaA, 0x020305, 0.82);
  const rimColor = lerpHex(art.palette.accent, art.palette.starlight, 0.18);
  const deckColor = lerpHex(art.palette.nebulaB, 0x030507, 0.76);
  const horizonY = -140 + art.heroY * 0.18;
  const floorY = -HH - 34;

  const farDeck = addFilledPolygon(group, [
    [-HW - 120, floorY],
    [HW + 120, floorY],
    [HW + 90, horizonY - 30],
    [-HW - 90, horizonY - 30],
  ], -900, deckColor, 0.26, -20);
  if (farDeck) {
    state.movers.push({
      object: farDeck,
      basePosition: farDeck.position.clone(),
      baseRotationZ: farDeck.rotation.z,
      driftX: 2,
      driftY: 2,
      driftZ: 4,
      sway: 0.002,
      speed: 0.04,
      phase: rng() * Math.PI * 2,
      parallaxFactor: 0.14,
      moodInfluence: 0.2,
      eventInfluence: 0.2,
    });
  }

  const towerConfigs: Array<{ x: number; topY: number; baseWidth: number; topWidth: number; z: number; lean?: number; crown?: number; fillOpacity: number; lineOpacity: number; glowOpacity: number; parallax: number }> = [];
  const deckLines: Array<{ x1: number; x2: number; y: number; z: number }> = [];

  switch (art.heroMotif) {
    case 'halo':
      towerConfigs.push(
        { x: -170, topY: 250, baseWidth: 130, topWidth: 90, z: -610, lean: -14, crown: 14, fillOpacity: 0.24, lineOpacity: 0.12, glowOpacity: 0.05, parallax: 0.2 },
        { x: 170, topY: 250, baseWidth: 130, topWidth: 90, z: -610, lean: 14, crown: 14, fillOpacity: 0.24, lineOpacity: 0.12, glowOpacity: 0.05, parallax: 0.2 },
        { x: -220, topY: 110, baseWidth: 92, topWidth: 54, z: -420, lean: -8, crown: 8, fillOpacity: 0.32, lineOpacity: 0.16, glowOpacity: 0.06, parallax: 0.34 },
        { x: 220, topY: 110, baseWidth: 92, topWidth: 54, z: -420, lean: 8, crown: 8, fillOpacity: 0.32, lineOpacity: 0.16, glowOpacity: 0.06, parallax: 0.34 },
      );
      deckLines.push(
        { x1: -190, x2: 190, y: 18, z: -520 },
        { x1: -240, x2: -110, y: -46, z: -340 },
        { x1: 110, x2: 240, y: -46, z: -340 },
      );
      break;
    case 'gateway':
      towerConfigs.push(
        { x: -180, topY: 300, baseWidth: 140, topWidth: 78, z: -560, lean: -24, crown: 16, fillOpacity: 0.26, lineOpacity: 0.13, glowOpacity: 0.05, parallax: 0.22 },
        { x: 180, topY: 300, baseWidth: 140, topWidth: 78, z: -560, lean: 24, crown: 16, fillOpacity: 0.26, lineOpacity: 0.13, glowOpacity: 0.05, parallax: 0.22 },
        { x: -245, topY: 120, baseWidth: 100, topWidth: 62, z: -370, lean: -12, crown: 10, fillOpacity: 0.34, lineOpacity: 0.16, glowOpacity: 0.06, parallax: 0.36 },
        { x: 245, topY: 120, baseWidth: 100, topWidth: 62, z: -370, lean: 12, crown: 10, fillOpacity: 0.34, lineOpacity: 0.16, glowOpacity: 0.06, parallax: 0.36 },
      );
      deckLines.push(
        { x1: -165, x2: 165, y: 30, z: -430 },
        { x1: -250, x2: -80, y: -62, z: -300 },
        { x1: 80, x2: 250, y: -62, z: -300 },
      );
      break;
    case 'split':
      towerConfigs.push(
        { x: -195, topY: 300, baseWidth: 170, topWidth: 76, z: -540, lean: -32, crown: 18, fillOpacity: 0.28, lineOpacity: 0.13, glowOpacity: 0.05, parallax: 0.22 },
        { x: 195, topY: 300, baseWidth: 170, topWidth: 76, z: -540, lean: 32, crown: 18, fillOpacity: 0.28, lineOpacity: 0.13, glowOpacity: 0.05, parallax: 0.22 },
        { x: -248, topY: 120, baseWidth: 118, topWidth: 54, z: -340, lean: -18, crown: 12, fillOpacity: 0.38, lineOpacity: 0.16, glowOpacity: 0.06, parallax: 0.38 },
        { x: 248, topY: 120, baseWidth: 118, topWidth: 54, z: -340, lean: 18, crown: 12, fillOpacity: 0.38, lineOpacity: 0.16, glowOpacity: 0.06, parallax: 0.38 },
      );
      deckLines.push(
        { x1: -260, x2: -80, y: -40, z: -310 },
        { x1: 80, x2: 260, y: -40, z: -310 },
      );
      break;
    case 'spire':
      towerConfigs.push(
        { x: 0, topY: 310, baseWidth: 138, topWidth: 24, z: -540, crown: 24, fillOpacity: 0.30, lineOpacity: 0.13, glowOpacity: 0.05, parallax: 0.24 },
        { x: -210, topY: 160, baseWidth: 110, topWidth: 52, z: -360, lean: -10, crown: 10, fillOpacity: 0.36, lineOpacity: 0.16, glowOpacity: 0.06, parallax: 0.38 },
        { x: 210, topY: 160, baseWidth: 110, topWidth: 52, z: -360, lean: 10, crown: 10, fillOpacity: 0.36, lineOpacity: 0.16, glowOpacity: 0.06, parallax: 0.38 },
      );
      deckLines.push(
        { x1: -220, x2: 220, y: -25, z: -340 },
        { x1: -150, x2: 150, y: 55, z: -440 },
      );
      break;
    case 'prism':
      towerConfigs.push(
        { x: -175, topY: 250, baseWidth: 132, topWidth: 40, z: -560, lean: -6, crown: 8, fillOpacity: 0.26, lineOpacity: 0.12, glowOpacity: 0.05, parallax: 0.24 },
        { x: 175, topY: 250, baseWidth: 132, topWidth: 40, z: -560, lean: 6, crown: 8, fillOpacity: 0.26, lineOpacity: 0.12, glowOpacity: 0.05, parallax: 0.24 },
        { x: 0, topY: 180, baseWidth: 116, topWidth: 28, z: -410, crown: 16, fillOpacity: 0.34, lineOpacity: 0.15, glowOpacity: 0.06, parallax: 0.34 },
        { x: -248, topY: 90, baseWidth: 94, topWidth: 36, z: -300, lean: -8, crown: 8, fillOpacity: 0.34, lineOpacity: 0.16, glowOpacity: 0.06, parallax: 0.42 },
        { x: 248, topY: 90, baseWidth: 94, topWidth: 36, z: -300, lean: 8, crown: 8, fillOpacity: 0.34, lineOpacity: 0.16, glowOpacity: 0.06, parallax: 0.42 },
      );
      deckLines.push(
        { x1: -190, x2: 190, y: 6, z: -360 },
        { x1: -255, x2: -70, y: -64, z: -270 },
        { x1: 70, x2: 255, y: -64, z: -270 },
      );
      break;
  }

  for (const cfg of towerConfigs) {
    const points = buildTowerPoints(cfg.x, floorY, cfg.topY, cfg.baseWidth, cfg.topWidth, cfg.lean ?? 0, cfg.crown ?? 0);
    const structure = addLayeredSilhouette(group, points, cfg.z, shadowColor, rimColor,
      cfg.fillOpacity, cfg.lineOpacity, cfg.glowOpacity, -18);
    if (structure.fill) {
      state.movers.push({
        object: structure.fill,
        basePosition: structure.fill.position.clone(),
        baseRotationZ: structure.fill.rotation.z,
        driftX: 2,
        driftY: 2,
        driftZ: 4,
        sway: 0.003,
        speed: 0.05,
        phase: rng() * Math.PI * 2,
        parallaxFactor: cfg.parallax,
        moodInfluence: 0.24,
        eventInfluence: 0.22,
      });
    }
    if (structure.outline) {
      state.movers.push({
        object: structure.outline,
        basePosition: structure.outline.position.clone(),
        baseRotationZ: structure.outline.rotation.z,
        driftX: 2,
        driftY: 2,
        driftZ: 4,
        sway: 0.003,
        speed: 0.05,
        phase: rng() * Math.PI * 2,
        parallaxFactor: cfg.parallax,
        moodInfluence: 0.3,
        eventInfluence: 0.28,
      });
    }
  }

  const deckPos: number[] = [];
  for (const deck of deckLines) {
    const thickness = 18;
    const points: Array<[number, number]> = [
      [deck.x1, deck.y],
      [deck.x2, deck.y],
      [deck.x2 - 12, deck.y - thickness],
      [deck.x1 + 12, deck.y - thickness],
    ];
    addLayeredSilhouette(group, points, deck.z, deckColor, rimColor, 0.26, 0.11, 0.04, -12);
    line(deckPos, deck.x1, deck.y, deck.z + 1, deck.x2, deck.y, deck.z + 1);
    const supportStep = 54;
    for (let x = deck.x1 + 18; x < deck.x2 - 18; x += supportStep) {
      line(deckPos, x, deck.y - thickness, deck.z + 1, x + 12, floorY + 8, deck.z + 1);
    }
  }
  if (deckPos.length > 0) {
    const deckMesh = buildMesh(deckPos, rimColor, 0.10, 0.04);
    deckMesh.renderOrder = -10;
    group.add(deckMesh);
    state.movers.push({
      object: deckMesh,
      basePosition: deckMesh.position.clone(),
      baseRotationZ: deckMesh.rotation.z,
      driftX: 3,
      driftY: 2,
      driftZ: 4,
      sway: 0.003,
      speed: 0.055,
      phase: rng() * Math.PI * 2,
      parallaxFactor: 0.46,
      moodInfluence: 0.3,
      eventInfluence: 0.25,
    });
  }

  addLightCone(group, 0, 300, floorY, 40, 280, -780, art.palette.accent, 0.06, -24, state, rng, 0.18);
  addLightCone(group, -140, 240, floorY, 28, 150, -520, art.palette.starlight, 0.045, -16, state, rng, 0.28);
  addLightCone(group, 140, 240, floorY, 28, 150, -520, art.palette.starlight, 0.045, -16, state, rng, 0.28);
}

function lerpHex(a: number, b: number, t: number): number {
  const color = new THREE.Color(a);
  color.lerp(new THREE.Color(b), THREE.MathUtils.clamp(t, 0, 1));
  return color.getHex();
}

function resolveBackgroundArtDirection(levelIndex: number): BackgroundArtDirection {
  const palette = ATMOSPHERE_PALETTES[levelIndex] ?? ATMOSPHERE_PALETTES[levelIndex % ATMOSPHERE_PALETTES.length];
  const preset = BACKGROUND_ART_PRESETS[levelIndex] ?? BACKGROUND_ART_PRESETS[levelIndex % BACKGROUND_ART_PRESETS.length];
  return {
    ...preset,
    palette,
  };
}

function makeBackdropTexture(seed: number, art: BackgroundArtDirection): THREE.Texture {
  const size = 1024;
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
  const top = lerpHex(art.palette.nebulaA, 0x020306, 0.55);
  const mid = lerpHex(art.palette.nebulaB, art.palette.nebulaA, 0.35);
  const bot = lerpHex(art.palette.nebulaC, 0x020306, 0.75);
  const grad = ctx.createLinearGradient(0, 0, 0, size);
  grad.addColorStop(0, toRgba(top, 1));
  grad.addColorStop(0.52, toRgba(mid, 1));
  grad.addColorStop(1, toRgba(bot, 1));
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  ctx.globalCompositeOperation = 'lighter';
  const bloomCount = Math.floor(16 + art.starDensity * 10);
  for (let i = 0; i < bloomCount; i++) {
    const cx = rng() * size;
    const cy = size * (0.08 + rng() * 0.84);
    const radius = size * (0.08 + rng() * 0.24);
    const c = i % 2 === 0 ? art.palette.nebulaB : art.palette.nebulaC;
    const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
    glow.addColorStop(0, toRgba(c, 0.12 + rng() * 0.08));
    glow.addColorStop(0.55, toRgba(c, 0.03 + rng() * 0.04));
    glow.addColorStop(1, toRgba(c, 0));
    ctx.fillStyle = glow;
    ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);
  }

  ctx.globalCompositeOperation = 'source-over';
  const horizonY = size * 0.57;
  const lineColor = lerpHex(art.palette.starlight, art.palette.accent, 0.35);
  ctx.strokeStyle = toRgba(lineColor, 0.12 * art.frameStrength);
  ctx.lineWidth = 2;
  for (let i = 0; i < 3; i++) {
    const wobble = 2 + i * 2;
    ctx.beginPath();
    ctx.moveTo(0, horizonY + (i - 1) * 20);
    for (let x = 0; x <= size; x += 18) {
      const y = horizonY + (i - 1) * 20 + Math.sin(x * 0.018 + i * 1.6) * wobble;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  const vignette = ctx.createRadialGradient(size * 0.5, size * 0.5, size * 0.2, size * 0.5, size * 0.5, size * 0.75);
  vignette.addColorStop(0, toRgba(0x000000, 0));
  vignette.addColorStop(1, toRgba(0x000000, 0.48 * art.frameStrength));
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, size, size);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  return tex;
}

function makeNebulaTexture(seed: number, art: BackgroundArtDirection): THREE.Texture {
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
  ctx.fillStyle = toRgba(0x020306, 1);
  ctx.fillRect(0, 0, size, size);

  ctx.globalCompositeOperation = 'lighter';
  const colors = [art.palette.nebulaA, art.palette.nebulaB, art.palette.nebulaC];
  const blotCount = Math.floor(22 + art.starDensity * 10);
  for (let i = 0; i < blotCount; i++) {
    const cx = rng() * size;
    const cy = rng() * size;
    const radius = size * (0.1 + rng() * 0.25);
    const color = colors[i % colors.length];
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
    grad.addColorStop(0, toRgba(color, 0.18 + rng() * 0.12));
    grad.addColorStop(0.55, toRgba(color, 0.05 + rng() * 0.06));
    grad.addColorStop(1, toRgba(color, 0));
    ctx.fillStyle = grad;
    ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);
  }

  ctx.globalCompositeOperation = 'source-over';
  ctx.strokeStyle = toRgba(art.palette.starlight, 0.1);
  ctx.lineWidth = 1.4;
  for (let i = 0; i < 110; i++) {
    const x = rng() * size;
    const y = rng() * size;
    const len = 8 + rng() * 18;
    const angle = art.streakAngle + (rng() - 0.5) * 0.45;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(angle) * len, y + Math.sin(angle) * len);
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
  grad.addColorStop(0.22, toRgba(starlight, 0.95));
  grad.addColorStop(0.55, toRgba(starlight, 0.32));
  grad.addColorStop(1, toRgba(starlight, 0));
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function addBackdropPlane(group: THREE.Group, art: BackgroundArtDirection, rng: () => number, state: BackgroundAnimationState) {
  const texture = makeBackdropTexture(15000 + Math.floor(rng() * 3000), art);
  const plate = new THREE.Mesh(
    new THREE.PlaneGeometry(2600, 1800),
    new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      opacity: 0.94,
      depthWrite: false,
      toneMapped: false,
    }),
  );
  plate.position.set(0, 0, -1180);
  plate.renderOrder = -45;
  plate.frustumCulled = false;
  group.add(plate);

  state.movers.push({
    object: plate,
    basePosition: plate.position.clone(),
    baseRotationZ: plate.rotation.z,
    driftX: 8,
    driftY: 5,
    driftZ: 5,
    sway: 0.004,
    speed: 0.05,
    phase: rng() * Math.PI * 2,
    parallaxFactor: 0.08,
    moodInfluence: 0.2,
    eventInfluence: 0.3,
  });

  const mat = plate.material;
  if (hasOpacity(mat)) {
    state.pulses.push({
      material: mat,
      baseOpacity: mat.opacity,
      amplitude: 0.03,
      speed: 0.12,
      phase: rng() * Math.PI * 2,
      moodInfluence: 0.4,
      eventInfluence: 0.4,
    });
  }
}

function addNebulaPlanes(group: THREE.Group, art: BackgroundArtDirection, rng: () => number, state: BackgroundAnimationState) {
  const nebulaTexture = makeNebulaTexture(20000 + Math.floor(rng() * 5000), art);
  const nebulaRoot = new THREE.Group();
  nebulaRoot.renderOrder = -32;
  group.add(nebulaRoot);

  const layers = [
    { width: 1940, height: 1380, z: -510, opacity: 0.26, tint: art.palette.nebulaA, driftX: 12, driftY: 7, driftZ: 7, speed: 0.085, sway: 0.018, parallax: 0.16 },
    { width: 1720, height: 1210, z: -690, opacity: 0.21, tint: art.palette.nebulaB, driftX: 17, driftY: 11, driftZ: 10, speed: 0.098, sway: 0.022, parallax: 0.13 },
    { width: 1480, height: 1020, z: -870, opacity: 0.16, tint: art.palette.nebulaC, driftX: 21, driftY: 15, driftZ: 13, speed: 0.112, sway: 0.026, parallax: 0.10 },
  ];

  for (let i = 0; i < layers.length; i++) {
    const l = layers[i];
    const plane = new THREE.Mesh(
      new THREE.PlaneGeometry(l.width, l.height),
      new THREE.MeshBasicMaterial({
        map: nebulaTexture,
        color: l.tint,
        transparent: true,
        opacity: l.opacity,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    plane.position.set((rng() - 0.5) * 100, (rng() - 0.5) * 70, l.z);
    plane.rotation.z = rng() * Math.PI * 2;
    plane.renderOrder = -32 + i;
    plane.frustumCulled = false;
    nebulaRoot.add(plane);

    state.movers.push({
      object: plane,
      basePosition: plane.position.clone(),
      baseRotationZ: plane.rotation.z,
      driftX: l.driftX,
      driftY: l.driftY,
      driftZ: l.driftZ,
      sway: l.sway,
      speed: l.speed,
      phase: rng() * Math.PI * 2,
      parallaxFactor: l.parallax,
      moodInfluence: 0.5,
      eventInfluence: 0.65,
    });
    const mat = plane.material;
    if (hasOpacity(mat)) {
      state.pulses.push({
        material: mat,
        baseOpacity: mat.opacity,
        amplitude: 0.14 + i * 0.03,
        speed: 0.2 + i * 0.06,
        phase: rng() * Math.PI * 2,
        moodInfluence: 0.7,
        eventInfluence: 0.5,
      });
    }
  }
}

function addStarfield(group: THREE.Group, art: BackgroundArtDirection, rng: () => number, state: BackgroundAnimationState) {
  const starTexture = makeStarTexture(art.palette.starlight);
  const starRoot = new THREE.Group();
  starRoot.renderOrder = -16;
  group.add(starRoot);

  const starScale = art.starDensity;
  const layers = [
    { count: Math.floor(210 * starScale), size: 2.2, opacity: 0.58, zMin: -250, zMax: -650, accentChance: 0.15, driftX: 13, driftY: 7, driftZ: 9, speed: 0.085, sway: 0.012, parallax: 0.38 },
    { count: Math.floor(120 * starScale), size: 1.6, opacity: 0.42, zMin: -420, zMax: -940, accentChance: 0.10, driftX: 18, driftY: 10, driftZ: 12, speed: 0.067, sway: 0.018, parallax: 0.26 },
  ];

  for (let li = 0; li < layers.length; li++) {
    const layer = layers[li];
    const positions = new Float32Array(layer.count * 3);
    const colors = new Float32Array(layer.count * 3);
    const c = new THREE.Color();
    for (let i = 0; i < layer.count; i++) {
      const idx = i * 3;
      positions[idx] = (rng() - 0.5) * 2300;
      positions[idx + 1] = (rng() - 0.5) * 1450;
      positions[idx + 2] = layer.zMin - rng() * (layer.zMax - layer.zMin);
      c.setHex(rng() < layer.accentChance ? art.palette.accent : art.palette.starlight);
      const tint = 0.68 + rng() * 0.32;
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
    points.renderOrder = -15 + li;
    starRoot.add(points);

    state.movers.push({
      object: points,
      basePosition: points.position.clone(),
      baseRotationZ: points.rotation.z,
      driftX: layer.driftX,
      driftY: layer.driftY,
      driftZ: layer.driftZ,
      sway: layer.sway,
      speed: layer.speed,
      phase: rng() * Math.PI * 2,
      parallaxFactor: layer.parallax,
      moodInfluence: 0.45,
      eventInfluence: 0.35,
    });
    state.pulses.push({
      material,
      baseOpacity: material.opacity,
      amplitude: 0.13 + li * 0.04,
      speed: 0.34 + li * 0.15,
      phase: rng() * Math.PI * 2,
      moodInfluence: 0.6,
      eventInfluence: 0.25,
    });
  }
}

function addEnergyStreaks(group: THREE.Group, art: BackgroundArtDirection, rng: () => number, state: BackgroundAnimationState) {
  const streakPos: number[] = [];
  const count = Math.floor(24 + art.frameStrength * 18);
  for (let i = 0; i < count; i++) {
    const x = (rng() - 0.5) * 1500;
    const y = (rng() - 0.5) * 920;
    const z = -220 - rng() * 760;
    const len = 40 + rng() * 120;
    const angle = art.streakAngle + (rng() - 0.5) * 0.55;
    line(streakPos, x, y, z, x + Math.cos(angle) * len, y + Math.sin(angle) * len, z - rng() * 75);
  }
  const streakColor = lerpHex(art.palette.accent, art.palette.nebulaC, 0.28);
  const streaks = buildMesh(streakPos, streakColor, 0.13 + art.pulseBias * 0.03, 0.07);
  streaks.renderOrder = -7;
  group.add(streaks);
  state.movers.push({
    object: streaks,
    basePosition: streaks.position.clone(),
    baseRotationZ: streaks.rotation.z,
    driftX: 8,
    driftY: 13,
    driftZ: 10,
    sway: 0.015,
    speed: 0.115,
    phase: rng() * Math.PI * 2,
    parallaxFactor: 0.55,
    moodInfluence: 0.55,
    eventInfluence: 0.8,
  });
}

function buildHeroMotif(positions: number[], motif: HeroMotif, cx: number, cy: number, z: number, scale: number) {
  if (motif === 'halo') {
    buildConcentricRings(positions, cx, cy, z, 7, scale, 18);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const inner = scale * 0.45;
      const outer = scale * 1.08;
      line(positions, cx + Math.cos(a) * inner, cy + Math.sin(a) * inner, z, cx + Math.cos(a) * outer, cy + Math.sin(a) * outer, z);
    }
    return;
  }

  if (motif === 'gateway') {
    const w = scale * 0.7;
    const h = scale * 1.0;
    const inset = scale * 0.22;
    line(positions, cx - w, cy - h, z, cx - w * 0.72, cy + h, z);
    line(positions, cx - w * 0.72, cy + h, z, cx + w * 0.72, cy + h, z);
    line(positions, cx + w * 0.72, cy + h, z, cx + w, cy - h, z);
    line(positions, cx + w, cy - h, z, cx - w, cy - h, z);
    line(positions, cx - w + inset, cy - h + inset, z, cx - w * 0.54, cy + h - inset, z);
    line(positions, cx - w * 0.54, cy + h - inset, z, cx + w * 0.54, cy + h - inset, z);
    line(positions, cx + w * 0.54, cy + h - inset, z, cx + w - inset, cy - h + inset, z);
    line(positions, cx + w - inset, cy - h + inset, z, cx - w + inset, cy - h + inset, z);
    line(positions, cx, cy + h * 0.92, z, cx, cy - h * 0.94, z);
    return;
  }

  if (motif === 'split') {
    const w = scale * 0.85;
    const h = scale * 1.0;
    line(positions, cx - w, cy + h, z, cx + w, cy + h, z);
    line(positions, cx - w, cy - h, z, cx + w, cy - h, z);
    line(positions, cx - w * 0.95, cy + h * 0.75, z, cx - w * 0.12, cy - h, z);
    line(positions, cx + w * 0.95, cy + h * 0.75, z, cx + w * 0.12, cy - h, z);
    line(positions, cx - w * 0.08, cy + h, z, cx - w * 0.08, cy -h, z);
    line(positions, cx + w * 0.08, cy + h, z, cx + w * 0.08, cy -h, z);
    line(positions, cx - w * 0.62, cy + h * 0.32, z, cx + w * 0.62, cy + h * 0.32, z);
    line(positions, cx - w * 0.62, cy -h * 0.28, z, cx + w * 0.62, cy -h * 0.28, z);
    return;
  }

  if (motif === 'spire') {
    const w = scale * 0.84;
    const h = scale * 1.08;
    line(positions, cx - w, cy -h, z, cx, cy + h, z);
    line(positions, cx, cy + h, z, cx + w, cy -h, z);
    line(positions, cx - w, cy -h, z, cx + w, cy -h, z);
    line(positions, cx - w * 0.55, cy -h, z, cx, cy + h * 0.55, z);
    line(positions, cx, cy + h * 0.55, z, cx + w * 0.55, cy -h, z);
    line(positions, cx - w * 0.24, cy -h, z, cx, cy + h * 0.18, z);
    line(positions, cx, cy + h * 0.18, z, cx + w * 0.24, cy -h, z);
    line(positions, cx, cy + h * 1.14, z, cx, cy -h, z);
    return;
  }

  const w = scale * 0.75;
  const h = scale * 1.0;
  line(positions, cx, cy + h, z, cx + w, cy, z);
  line(positions, cx + w, cy, z, cx, cy -h, z);
  line(positions, cx, cy -h, z, cx - w, cy, z);
  line(positions, cx - w, cy, z, cx, cy + h, z);
  line(positions, cx, cy + h * 0.55, z, cx + w * 0.55, cy, z);
  line(positions, cx + w * 0.55, cy, z, cx, cy -h * 0.55, z);
  line(positions, cx, cy -h * 0.55, z, cx - w * 0.55, cy, z);
  line(positions, cx - w * 0.55, cy, z, cx, cy + h * 0.55, z);
  line(positions, cx - w * 0.9, cy -h * 0.2, z, cx + w * 0.9, cy -h * 0.2, z);
}

function addHeroMotif(group: THREE.Group, art: BackgroundArtDirection, rng: () => number, state: BackgroundAnimationState) {
  const heroPos: number[] = [];
  buildHeroMotif(heroPos, art.heroMotif, 0, art.heroY, -180, art.heroScale);
  const heroColor = lerpHex(art.palette.accent, art.palette.starlight, 0.38);
  const hero = buildMesh(heroPos, heroColor, 0.25 + art.pulseBias * 0.08, 0.13 + art.frameStrength * 0.04);
  hero.renderOrder = -5;
  group.add(hero);

  state.movers.push({
    object: hero,
    basePosition: hero.position.clone(),
    baseRotationZ: hero.rotation.z,
    driftX: 4,
    driftY: 6,
    driftZ: 4,
    sway: 0.012,
    speed: 0.09,
    phase: rng() * Math.PI * 2,
    parallaxFactor: 0.75,
    moodInfluence: 0.9,
    eventInfluence: 0.8,
  });
}

function addFramingContours(group: THREE.Group, art: BackgroundArtDirection, rng: () => number, state: BackgroundAnimationState) {
  const framePos: number[] = [];
  const frame = art.frameStrength;
  const sideBase = HW + 70;
  const top = HH + 150;
  const bottom = -HH - 100;
  for (let i = 0; i < 3; i++) {
    const x = sideBase + i * 56;
    const z = -120 - i * 65;
    line(framePos, -x, top - i * 14, z, -x, bottom + i * 14, z);
    line(framePos, x, top - i * 14, z, x, bottom + i * 14, z);
    line(framePos, -x, top - i * 14, z, -x + 72, top - 58 - i * 12, z);
    line(framePos, x, top - i * 14, z, x - 72, top - 58 - i * 12, z);
  }

  for (let i = 0; i < 2; i++) {
    const y = -40 + i * 26;
    const z = -160 - i * 48;
    line(framePos, -HW - 30, y, z, HW + 30, y, z);
  }

  const color = lerpHex(art.palette.starlight, art.palette.nebulaC, 0.2);
  const frameMesh = buildMesh(framePos, color, 0.07 * frame, 0.03 * frame);
  frameMesh.renderOrder = -8;
  group.add(frameMesh);

  state.movers.push({
    object: frameMesh,
    basePosition: frameMesh.position.clone(),
    baseRotationZ: frameMesh.rotation.z,
    driftX: 2,
    driftY: 3,
    driftZ: 3,
    sway: 0.006,
    speed: 0.058,
    phase: rng() * Math.PI * 2,
    parallaxFactor: 0.52,
    moodInfluence: 0.35,
    eventInfluence: 0.35,
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
        amplitude: mat.blending === THREE.AdditiveBlending ? 0.12 : 0.06,
        speed: 0.16 + rng() * 0.7,
        phase: rng() * Math.PI * 2,
        moodInfluence: mat.blending === THREE.AdditiveBlending ? 0.8 : 0.45,
        eventInfluence: mat.blending === THREE.AdditiveBlending ? 0.7 : 0.32,
      });
    }
  });
}

function buildAtmosphere(group: THREE.Group, levelIndex: number): BackgroundAnimationState {
  const artDirection = resolveBackgroundArtDirection(levelIndex);
  const rng = seededRandom(12000 + levelIndex * 977);
  const state: BackgroundAnimationState = {
    pulses: [],
    movers: [],
    baseGroupRotationZ: group.rotation.z,
    baseGroupX: group.position.x,
    baseGroupY: group.position.y,
    phase: rng() * Math.PI * 2,
    artDirection,
    smoothedMoodPulse: artDirection.pulseBias,
    smoothedEventPulse: 0,
    smoothedParallaxX: 0,
    smoothedParallaxY: 0,
  };
  addBackdropPlane(group, artDirection, rng, state);
  addNebulaPlanes(group, artDirection, rng, state);
  addArchitecturalMasses(group, artDirection, rng, state);
  addStageMotifComposition(group, levelIndex, artDirection, rng, state);
  addStarfield(group, artDirection, rng, state);
  addEnergyStreaks(group, artDirection, rng, state);
  addFramingContours(group, artDirection, rng, state);
  addHeroMotif(group, artDirection, rng, state);
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
  const animationState = buildAtmosphere(group, levelIndex);
  group.userData.backgroundAnimation = animationState;
  group.userData.backgroundArtName = animationState.artDirection.name;
  return group;
}

export function animateBackground(group: THREE.Group, now: number, controls: BackgroundRuntimeControls = {}) {
  const state = group.userData.backgroundAnimation as BackgroundAnimationState | undefined;
  if (!state) return;

  const t = now * 0.001;
  const art = state.artDirection;
  const targetMood = THREE.MathUtils.clamp(controls.moodPulse ?? art.pulseBias, 0.2, 1.2);
  const targetEvent = THREE.MathUtils.clamp(controls.eventPulse ?? 0, 0, 1);
  const targetParallaxX = THREE.MathUtils.clamp(controls.parallaxX ?? 0, -1, 1);
  const targetParallaxY = THREE.MathUtils.clamp(controls.parallaxY ?? 0, -1, 1);
  const ballEnergy = THREE.MathUtils.clamp(controls.ballEnergy ?? 1, 0.45, 1.8);

  state.smoothedMoodPulse += (targetMood - state.smoothedMoodPulse) * 0.08;
  state.smoothedEventPulse += (targetEvent - state.smoothedEventPulse) * 0.1;
  state.smoothedParallaxX += (targetParallaxX - state.smoothedParallaxX) * 0.09;
  state.smoothedParallaxY += (targetParallaxY - state.smoothedParallaxY) * 0.09;

  const moodShift = state.smoothedMoodPulse - art.pulseBias;
  const groupDrift = 0.8 + state.smoothedMoodPulse * 0.65 + state.smoothedEventPulse * 0.45;
  const groupParallax = 11 + art.frameStrength * 8;
  group.rotation.z = state.baseGroupRotationZ
    + Math.sin(t * 0.08 + state.phase) * (0.008 + art.frameStrength * 0.004)
    + state.smoothedParallaxX * 0.005;
  group.position.x = state.baseGroupX
    + Math.sin(t * 0.13 + state.phase * 0.7) * (4.6 * groupDrift)
    + state.smoothedParallaxX * groupParallax;
  group.position.y = state.baseGroupY
    + Math.sin(t * 0.11 + state.phase * 0.5) * (3.8 * groupDrift)
    + state.smoothedParallaxY * (groupParallax * 0.45);

  for (const mover of state.movers) {
    const moodMul = 1 + mover.moodInfluence * moodShift * 1.35;
    const eventMul = 1 + mover.eventInfluence * state.smoothedEventPulse;
    const driftMul = moodMul * eventMul * (0.82 + ballEnergy * 0.4);
    mover.object.position.x = mover.basePosition.x
      + Math.sin(t * mover.speed + mover.phase) * mover.driftX * driftMul
      + state.smoothedParallaxX * mover.parallaxFactor * 22;
    mover.object.position.y = mover.basePosition.y
      + Math.cos(t * (mover.speed * 0.8) + mover.phase) * mover.driftY * driftMul
      + state.smoothedParallaxY * mover.parallaxFactor * 14;
    mover.object.position.z = mover.basePosition.z
      + Math.sin(t * (mover.speed * 0.55) + mover.phase) * mover.driftZ * driftMul;
    mover.object.rotation.z = mover.baseRotationZ
      + Math.sin(t * 0.16 + mover.phase) * mover.sway * (0.9 + driftMul * 0.35);
  }

  for (const pulse of state.pulses) {
    const ampScale = 1
      + pulse.moodInfluence * moodShift * 1.7
      + pulse.eventInfluence * state.smoothedEventPulse * 1.15;
    const amplitude = Math.max(0.01, pulse.amplitude * ampScale);
    const speed = pulse.speed * (0.9 + state.smoothedMoodPulse * 0.45 + state.smoothedEventPulse * 0.25);
    const wave = 1 + Math.sin(t * speed + pulse.phase) * amplitude;
    pulse.material.opacity = Math.max(0.01, Math.min(1, pulse.baseOpacity * wave));
  }
}
