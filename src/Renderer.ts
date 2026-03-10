import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { GAME_WIDTH, GAME_HEIGHT } from './constants';
import { createCRTPass } from './CRTPass';
import type { BrickDefinition } from './types/BrickDefinition';
import type { BossDefinition } from './types/BossTypes';

const HW = GAME_WIDTH / 2;
const HH = GAME_HEIGHT / 2;

// Canvas overlay screen types (rendered through CRT + bloom)
type OverlayScreen =
  | { type: 'menu'; riskProfiles: { id: string; label: string; name: string; description: string; color: string }[] }
  | { type: 'stage-intro'; name: string; flavorText: string; bossInfo?: string }
  | { type: 'paused' }
  | { type: 'game-over'; bagValue: string; stageText: string }
  | { type: 'victory'; moonValue: string; returnPct: string; riskLabel: string; riskColor: string; riskName: string };

// ── Line thickening (ported from scramble) ──
// Creates multiple parallel copies of each line segment offset perpendicular,
// giving wireframes a beefier, more defined look under bloom.
function thickenLineSegmentPositions(input: ArrayLike<number>, halfWidth: number = 0.05, steps: number = 2): Float32Array {
  const source = input instanceof Float32Array ? input : new Float32Array(input);
  if (source.length === 0 || halfWidth <= 0 || steps <= 0) return source;

  const lineCount = Math.floor(source.length / 6);
  const copies = steps * 2 + 1;
  const out = new Float32Array(lineCount * copies * 6);
  let outIndex = 0;

  for (let i = 0; i < lineCount; i++) {
    const idx = i * 6;
    const ax = source[idx], ay = source[idx + 1], az = source[idx + 2];
    const bx = source[idx + 3], by = source[idx + 4], bz = source[idx + 5];

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

/** Thicken an existing BufferGeometry's positions, returning a new geometry */
function thickenGeo(geo: THREE.BufferGeometry, halfWidth: number, steps: number): THREE.BufferGeometry {
  const pos = geo.getAttribute('position').array;
  const thickPos = thickenLineSegmentPositions(pos, halfWidth, steps);
  const newGeo = new THREE.BufferGeometry();
  newGeo.setAttribute('position', new THREE.Float32BufferAttribute(thickPos, 3));
  return newGeo;
}

/** Thicken an EdgesGeometry, returning a new BufferGeometry */
function thickenEdgesGeo(edges: THREE.EdgesGeometry, halfWidth: number, steps: number): THREE.BufferGeometry {
  return thickenGeo(edges, halfWidth, steps);
}

// ── Level color themes ──
const LEVEL_THEMES: {
  bg: number;
  fog: number;
  accent: number;
  fogDensity: number;
  bloomStrength: number;
  bloomRadius: number;
  exposure: number;
}[] = [
  { bg: 0x010a06, fog: 0x021a0c, accent: 0x00ff88, fogDensity: 0.0013, bloomStrength: 0.45, bloomRadius: 0.40, exposure: 1.15 }, // Genesis Block
  { bg: 0x010a06, fog: 0x021a0c, accent: 0x00ff88, fogDensity: 0.0012, bloomStrength: 0.45, bloomRadius: 0.40, exposure: 1.15 }, // Bull Trap
  { bg: 0x180709, fog: 0x3a1115, accent: 0xff4b44, fogDensity: 0.0010, bloomStrength: 0.45, bloomRadius: 0.40, exposure: 1.22 }, // Liquidation
  { bg: 0x0a0800, fog: 0x1a1000, accent: 0xffaa00, fogDensity: 0.0013, bloomStrength: 0.45, bloomRadius: 0.40, exposure: 1.15 }, // Pump & Dump
  { bg: 0x020810, fog: 0x041420, accent: 0x44ddff, fogDensity: 0.0014, bloomStrength: 0.45, bloomRadius: 0.40, exposure: 1.15 }, // Diamond Hands
  { bg: 0x180709, fog: 0x381117, accent: 0xff5160, fogDensity: 0.0010, bloomStrength: 0.45, bloomRadius: 0.40, exposure: 1.22 }, // Bear Market
  { bg: 0x060804, fog: 0x0c1008, accent: 0xffaa00, fogDensity: 0.0013, bloomStrength: 0.45, bloomRadius: 0.40, exposure: 1.15 }, // Halving
  { bg: 0x020810, fog: 0x041420, accent: 0x44ddff, fogDensity: 0.0014, bloomStrength: 0.45, bloomRadius: 0.40, exposure: 1.12 }, // DeFi Maze
  { bg: 0x190809, fog: 0x3d1512, accent: 0xff5c47, fogDensity: 0.0010, bloomStrength: 0.45, bloomRadius: 0.40, exposure: 1.24 }, // Margin Call
  { bg: 0x060210, fog: 0x0c0420, accent: 0x8844ff, fogDensity: 0.0014, bloomStrength: 0.45, bloomRadius: 0.40, exposure: 1.15 }, // Flippening
];

export class Renderer {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  webgl: THREE.WebGLRenderer;
  composer: EffectComposer;
  bloom: UnrealBloomPass;
  crt: ShaderPass;
  bgGroup: THREE.Group;
  fxGroup: THREE.Group;
  private container: HTMLElement;
  private hudEl: HTMLElement;
  private overlayEl: HTMLElement;
  private calloutsEl: HTMLElement;
  private tickerEl: HTMLElement;
  private particles: Particle[] = [];
  private tempEffects: { group: THREE.Group; expiresAt: number }[] = [];

  // Pre-allocated particle pool (avoids per-frame allocations)
  private static readonly MAX_PARTICLES = 256;
  private particlePositions = new Float32Array(256 * 3);
  private particleColors = new Float32Array(256 * 3);
  private particleSizes = new Float32Array(256);
  private particleHots = new Float32Array(256);
  private particleGeo: THREE.BufferGeometry | null = null;
  private particlePosAttr: THREE.BufferAttribute | null = null;
  private particleColAttr: THREE.BufferAttribute | null = null;
  private particleSizeAttr: THREE.BufferAttribute | null = null;
  private particleHotAttr: THREE.BufferAttribute | null = null;

  // 2D canvas HUD rendered via separate scene (goes through CRT)
  private hudCanvas: HTMLCanvasElement;
  private hudCtx: CanvasRenderingContext2D;
  private hudTexture: THREE.CanvasTexture;
  private hudScene: THREE.Scene;
  private hudCamera: THREE.OrthographicCamera;
  private hudData: {
    score: number; lives: number; combo: number;
    sentiment: string; sentimentColor: string;
    stage: string; effects: string;
    eventLabel?: string;
    bossName?: string | null;
    bossHp?: number | null;
    riskLabel?: string;
    riskColor?: string;
  } | null = null;
  private tickerData: { sym: string; price: number; pct: number }[] = [];
  private tickerOffset = 0;
  private lastTickerTime = 0;
  private activeCallouts: { text: string; color: string; size: number; gx: number; gy: number; startTime: number; quick: boolean }[] = [];
  private overlayHtml: string | null = null;

  // Canvas-based overlay screens (rendered through CRT)
  private overlayScreen: OverlayScreen | null = null;
  private hudDirty = true;
  private riskButtonRects: { id: string; gx: number; gy: number; gw: number; gh: number }[] = [];
  private selectedRiskId: string = 'margin';
  private logoImg: HTMLImageElement | null = null;
  private logoLoaded = false;

  constructor(container: HTMLElement) {
    this.container = container;

    // Preload logo
    this.logoImg = new Image();
    this.logoImg.onload = () => { this.logoLoaded = true; };
    this.logoImg.src = 'adstudios.png';

    // Scene
    const initialTheme = LEVEL_THEMES[0];
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(initialTheme.bg);
    this.scene.fog = new THREE.FogExp2(initialTheme.fog, initialTheme.fogDensity);

    // Camera: see 450x800 area at z=0
    const fov = 60;
    const aspect = GAME_WIDTH / GAME_HEIGHT;
    this.camera = new THREE.PerspectiveCamera(fov, aspect, 1, 2000);
    const camZ = HH / Math.tan((fov / 2) * Math.PI / 180);
    this.camera.position.set(0, 0, camZ);
    this.camera.lookAt(0, 0, 0);

    // WebGL renderer — size is set in resize()
    this.webgl = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.webgl.setPixelRatio(1); // we manage resolution ourselves
    this.webgl.toneMapping = THREE.ACESFilmicToneMapping;
    this.webgl.toneMappingExposure = initialTheme.exposure;
    container.appendChild(this.webgl.domElement);

    // 2D canvas HUD (rendered in separate scene, goes through bloom + CRT)
    this.hudCanvas = document.createElement('canvas');
    this.hudCanvas.width = 1152;
    this.hudCanvas.height = 2048;
    this.hudCtx = this.hudCanvas.getContext('2d')!;
    this.hudTexture = new THREE.CanvasTexture(this.hudCanvas);
    this.hudTexture.minFilter = THREE.LinearFilter;
    this.hudTexture.magFilter = THREE.LinearFilter;

    // HUD scene with orthographic camera (overlays on main scene)
    this.hudScene = new THREE.Scene();
    this.hudCamera = new THREE.OrthographicCamera(-HW, HW, HH, -HH, 0.1, 10);
    this.hudCamera.position.z = 1;
    const hudMat = new THREE.MeshBasicMaterial({
      map: this.hudTexture,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
    const hudMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(GAME_WIDTH, GAME_HEIGHT),
      hudMat,
    );
    this.hudScene.add(hudMesh);

    // Post-processing
    this.composer = new EffectComposer(this.webgl);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    // Render HUD scene on top (clear=false keeps the main scene)
    const hudRenderPass = new RenderPass(this.hudScene, this.hudCamera);
    hudRenderPass.clear = false;
    this.composer.addPass(hudRenderPass);

    this.bloom = new UnrealBloomPass(
      new THREE.Vector2(Math.floor(GAME_WIDTH/2), Math.floor(GAME_HEIGHT/2)),
      initialTheme.bloomStrength,  // strength
      initialTheme.bloomRadius, // radius
      0.03,  // threshold
    );
    this.composer.addPass(this.bloom);
    this.crt = createCRTPass();
    this.composer.addPass(this.crt);
    this.composer.addPass(new OutputPass());

    // Groups
    this.bgGroup = new THREE.Group();
    this.bgGroup.position.z = -5;
    this.scene.add(this.bgGroup);
    this.fxGroup = new THREE.Group();
    this.scene.add(this.fxGroup);

    // HTML elements (hidden — we render to canvas instead)
    this.hudEl = document.getElementById('hud')!;
    this.overlayEl = document.getElementById('overlay')!;
    this.calloutsEl = document.getElementById('callouts')!;
    this.tickerEl = document.getElementById('ticker-content')!;
    this.hudEl.style.display = 'none';
    this.calloutsEl.style.display = 'none';
    document.getElementById('ticker')!.style.display = 'none';

    this.initTicker();

    // Resize
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  // ── Coordinate conversion ──
  /** Game coords (0,0 top-left) → Three.js world (0,0 center, y-up) */
  toWorld(gx: number, gy: number): THREE.Vector3 {
    return new THREE.Vector3(gx - HW, HH - gy, 0);
  }

  setPos(obj: THREE.Object3D, gx: number, gy: number, gz: number = 0) {
    obj.position.set(gx - HW, HH - gy, gz);
  }

  // ── Mesh factories ──

  makeBrick(def: BrickDefinition, w: number, h: number): THREE.Group {
    // Candlestick shape for sentiment bricks
    if (def.id === 'sentimentUp' || def.id === 'sentimentDown') {
      return this.makeCandleBrick(def, w, h);
    }

    const group = new THREE.Group();
    const depth = 6;
    const hw = (w - 1) / 2, hh = (h - 1) / 2;

    // Build custom wireframe with internal detail per brick type
    const positions: number[] = [];

    // Outer box edges (front face)
    positions.push(-hw, -hh, depth / 2, hw, -hh, depth / 2);
    positions.push(hw, -hh, depth / 2, hw, hh, depth / 2);
    positions.push(hw, hh, depth / 2, -hw, hh, depth / 2);
    positions.push(-hw, hh, depth / 2, -hw, -hh, depth / 2);
    // Back face
    positions.push(-hw, -hh, -depth / 2, hw, -hh, -depth / 2);
    positions.push(hw, -hh, -depth / 2, hw, hh, -depth / 2);
    positions.push(hw, hh, -depth / 2, -hw, hh, -depth / 2);
    positions.push(-hw, hh, -depth / 2, -hw, -hh, -depth / 2);
    // Connecting edges
    positions.push(-hw, -hh, depth / 2, -hw, -hh, -depth / 2);
    positions.push(hw, -hh, depth / 2, hw, -hh, -depth / 2);
    positions.push(hw, hh, depth / 2, hw, hh, -depth / 2);
    positions.push(-hw, hh, depth / 2, -hw, hh, -depth / 2);

    // Type-specific internal details (front face only for visibility)
    const d = depth / 2;
    if (def.id === 'standard') {
      // Inner hash cross
      positions.push(-hw * 0.4, 0, d, hw * 0.4, 0, d);
      positions.push(0, -hh * 0.5, d, 0, hh * 0.5, d);
    } else if (def.id === 'tough') {
      // Double border + reinforcement diagonals
      const inset = 0.18;
      const iw = hw * (1 - inset), ih = hh * (1 - inset);
      positions.push(-iw, -ih, d, iw, -ih, d);
      positions.push(iw, -ih, d, iw, ih, d);
      positions.push(iw, ih, d, -iw, ih, d);
      positions.push(-iw, ih, d, -iw, -ih, d);
      // Corner braces
      positions.push(-hw, -hh, d, -iw, -ih, d);
      positions.push(hw, -hh, d, iw, -ih, d);
      positions.push(hw, hh, d, iw, ih, d);
      positions.push(-hw, hh, d, -iw, ih, d);
    } else if (def.id === 'tough3') {
      // Triple-layered with inner diamond core
      for (const inset of [0.15, 0.35]) {
        const iw = hw * (1 - inset), ih = hh * (1 - inset);
        positions.push(-iw, -ih, d, iw, -ih, d);
        positions.push(iw, -ih, d, iw, ih, d);
        positions.push(iw, ih, d, -iw, ih, d);
        positions.push(-iw, ih, d, -iw, -ih, d);
      }
      // Inner diamond energy core
      positions.push(0, -hh * 0.35, d, hw * 0.3, 0, d);
      positions.push(hw * 0.3, 0, d, 0, hh * 0.35, d);
      positions.push(0, hh * 0.35, d, -hw * 0.3, 0, d);
      positions.push(-hw * 0.3, 0, d, 0, -hh * 0.35, d);
    } else if (def.id === 'explosive') {
      // Radiating star lines from center
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const r = Math.min(hw, hh) * 0.7;
        positions.push(0, 0, d, Math.cos(a) * r, Math.sin(a) * r, d);
      }
      // Warning inner triangle
      const ts = Math.min(hw, hh) * 0.4;
      positions.push(0, ts, d, ts * 0.866, -ts * 0.5, d);
      positions.push(ts * 0.866, -ts * 0.5, d, -ts * 0.866, -ts * 0.5, d);
      positions.push(-ts * 0.866, -ts * 0.5, d, 0, ts, d);
    } else if (def.id === 'drop') {
      // Downward chevrons (airdrop!)
      for (let i = 0; i < 2; i++) {
        const yOff = (i - 0.5) * hh * 0.6;
        positions.push(-hw * 0.4, yOff + hh * 0.2, d, 0, yOff, d);
        positions.push(0, yOff, d, hw * 0.4, yOff + hh * 0.2, d);
      }
      // Parachute arc
      const segs = 6;
      for (let s = 0; s < segs; s++) {
        const a1 = Math.PI + (s / segs) * Math.PI;
        const a2 = Math.PI + ((s + 1) / segs) * Math.PI;
        const r = hw * 0.5;
        positions.push(
          Math.cos(a1) * r, hh * 0.2 + Math.sin(a1) * r * 0.5, d,
          Math.cos(a2) * r, hh * 0.2 + Math.sin(a2) * r * 0.5, d);
      }
    } else if (def.id === 'indestructible') {
      // Dense grid / fortress pattern
      const gridLines = 3;
      for (let g = 1; g < gridLines; g++) {
        const t = g / gridLines;
        // Vertical grid
        const gx = -hw + t * hw * 2;
        positions.push(gx, -hh, d, gx, hh, d);
        // Horizontal grid
        const gy = -hh + t * hh * 2;
        positions.push(-hw, gy, d, hw, gy, d);
      }
      // Corner reinforcement squares
      const cs = Math.min(hw, hh) * 0.25;
      for (const [cx, cy] of [[-hw + cs, -hh + cs], [hw - cs, -hh + cs], [hw - cs, hh - cs], [-hw + cs, hh - cs]]) {
        positions.push(cx - cs * 0.5, cy - cs * 0.5, d, cx + cs * 0.5, cy - cs * 0.5, d);
        positions.push(cx + cs * 0.5, cy - cs * 0.5, d, cx + cs * 0.5, cy + cs * 0.5, d);
        positions.push(cx + cs * 0.5, cy + cs * 0.5, d, cx - cs * 0.5, cy + cs * 0.5, d);
        positions.push(cx - cs * 0.5, cy + cs * 0.5, d, cx - cs * 0.5, cy - cs * 0.5, d);
      }
    } else if (def.id === 'hazard') {
      // X mark with circle
      positions.push(-hw * 0.5, -hh * 0.5, d, hw * 0.5, hh * 0.5, d);
      positions.push(hw * 0.5, -hh * 0.5, d, -hw * 0.5, hh * 0.5, d);
      const r = Math.min(hw, hh) * 0.45;
      const segs = 8;
      for (let s = 0; s < segs; s++) {
        const a = (s / segs) * Math.PI * 2;
        const na = ((s + 1) / segs) * Math.PI * 2;
        positions.push(Math.cos(a) * r, Math.sin(a) * r, d, Math.cos(na) * r, Math.sin(na) * r, d);
      }
    } else if (def.id === 'fomo') {
      // Hourglass shape — time is running out
      positions.push(-hw * 0.5, -hh * 0.6, d, hw * 0.5, -hh * 0.6, d); // top bar
      positions.push(-hw * 0.5, hh * 0.6, d, hw * 0.5, hh * 0.6, d);   // bottom bar
      positions.push(-hw * 0.5, -hh * 0.6, d, hw * 0.5, hh * 0.6, d);  // X cross
      positions.push(hw * 0.5, -hh * 0.6, d, -hw * 0.5, hh * 0.6, d);
      // Sand dots in bottom half
      positions.push(-hw * 0.1, hh * 0.15, d, hw * 0.1, hh * 0.15, d);
      positions.push(-hw * 0.15, hh * 0.35, d, hw * 0.15, hh * 0.35, d);
    } else if (def.id === 'stable') {
      // Dollar sign circle — stablecoin
      const r = Math.min(hw, hh) * 0.5;
      const segs = 10;
      for (let s = 0; s < segs; s++) {
        const a = (s / segs) * Math.PI * 2;
        const na = ((s + 1) / segs) * Math.PI * 2;
        positions.push(Math.cos(a) * r, Math.sin(a) * r, d, Math.cos(na) * r, Math.sin(na) * r, d);
      }
      // $ sign: S-curve + vertical line
      positions.push(0, -hh * 0.55, d, 0, hh * 0.55, d); // vertical bar
      positions.push(hw * 0.2, -hh * 0.25, d, -hw * 0.2, 0, d);  // top curve
      positions.push(-hw * 0.2, 0, d, hw * 0.2, hh * 0.25, d);    // bottom curve
    } else if (def.id === 'leverage') {
      // Arrow pointing up with multiplier lines
      positions.push(0, -hh * 0.6, d, 0, hh * 0.4, d);           // shaft
      positions.push(-hw * 0.3, -hh * 0.1, d, 0, -hh * 0.6, d); // left head
      positions.push(hw * 0.3, -hh * 0.1, d, 0, -hh * 0.6, d);  // right head
      // x2 indicator bars
      positions.push(-hw * 0.5, hh * 0.3, d, -hw * 0.15, hh * 0.3, d);
      positions.push(hw * 0.15, hh * 0.3, d, hw * 0.5, hh * 0.3, d);
    } else if (def.id === 'rug') {
      // Trapdoor/carpet pattern — pulling away
      positions.push(-hw * 0.6, 0, d, hw * 0.6, 0, d);
      positions.push(-hw * 0.5, -hh * 0.4, d, -hw * 0.15, -hh * 0.3, d);
      positions.push(-hw * 0.15, -hh * 0.3, d, hw * 0.15, -hh * 0.4, d);
      positions.push(hw * 0.15, -hh * 0.4, d, hw * 0.5, -hh * 0.3, d);
      positions.push(-hw * 0.5, hh * 0.3, d, -hw * 0.15, hh * 0.4, d);
      positions.push(-hw * 0.15, hh * 0.4, d, hw * 0.15, hh * 0.3, d);
      positions.push(hw * 0.15, hh * 0.3, d, hw * 0.5, hh * 0.4, d);
    } else if (def.id === 'whale') {
      // Whale silhouette — rounded body with tail
      const r = Math.min(hw, hh) * 0.55;
      const segs = 8;
      // Body arc (top half)
      for (let s = 0; s < segs; s++) {
        const a1 = Math.PI + (s / segs) * Math.PI;
        const a2 = Math.PI + ((s + 1) / segs) * Math.PI;
        positions.push(Math.cos(a1) * r * 1.2, Math.sin(a1) * r * 0.8, d,
                       Math.cos(a2) * r * 1.2, Math.sin(a2) * r * 0.8, d);
      }
      // Body bottom
      positions.push(-r * 1.2, 0, d, r * 0.8, 0, d);
      // Tail fin
      positions.push(r * 0.8, 0, d, hw * 0.7, -hh * 0.5, d);
      positions.push(r * 0.8, 0, d, hw * 0.7, hh * 0.3, d);
      // Eye dot
      positions.push(-hw * 0.3, hh * 0.15, d, -hw * 0.2, hh * 0.15, d);
    } else if (def.id === 'influencer') {
      // Megaphone / broadcast shape
      // Cone opening to the right
      positions.push(-hw * 0.3, -hh * 0.15, d, -hw * 0.3, hh * 0.15, d);  // mouth
      positions.push(-hw * 0.3, -hh * 0.15, d, hw * 0.5, -hh * 0.5, d);   // top edge
      positions.push(-hw * 0.3, hh * 0.15, d, hw * 0.5, hh * 0.5, d);     // bottom edge
      positions.push(hw * 0.5, -hh * 0.5, d, hw * 0.5, hh * 0.5, d);      // front
      // Sound waves
      for (let w = 0; w < 3; w++) {
        const wOff = hw * (0.15 + w * 0.15);
        const wH = hh * (0.2 + w * 0.12);
        positions.push(hw * 0.5 + wOff, -wH, d, hw * 0.5 + wOff + hw * 0.05, 0, d);
        positions.push(hw * 0.5 + wOff + hw * 0.05, 0, d, hw * 0.5 + wOff, wH, d);
      }
      // Handle
      positions.push(-hw * 0.5, -hh * 0.08, d, -hw * 0.3, -hh * 0.08, d);
      positions.push(-hw * 0.5, hh * 0.08, d, -hw * 0.3, hh * 0.08, d);
    } else if (def.id === 'diamond') {
      // Diamond / gem shape — octagonal cut
      const dw = hw * 0.6, dh = hh * 0.7;
      // Top facet
      positions.push(-dw * 0.5, -dh, d, dw * 0.5, -dh, d);        // flat top
      positions.push(-dw, -dh * 0.3, d, -dw * 0.5, -dh, d);       // top-left
      positions.push(dw * 0.5, -dh, d, dw, -dh * 0.3, d);         // top-right
      // Middle widest
      positions.push(-dw, -dh * 0.3, d, -dw, dh * 0.1, d);        // left
      positions.push(dw, -dh * 0.3, d, dw, dh * 0.1, d);          // right
      // Bottom point
      positions.push(-dw, dh * 0.1, d, 0, dh, d);                 // bottom-left
      positions.push(dw, dh * 0.1, d, 0, dh, d);                  // bottom-right
      // Inner facet lines
      positions.push(-dw * 0.5, -dh, d, -dw * 0.3, dh * 0.1, d);
      positions.push(dw * 0.5, -dh, d, dw * 0.3, dh * 0.1, d);
      positions.push(0, -dh, d, 0, dh, d);                         // center line
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    const thickGeo = thickenGeo(geo, 0.06, 2);

    // Core wireframe
    const coreOpacity = def.id === 'indestructible' ? 0.25 : def.id === 'explosive' ? 0.50 : 0.40;
    const core = new THREE.LineSegments(thickGeo,
      new THREE.LineBasicMaterial({
        color: def.color, transparent: true, opacity: coreOpacity,
        fog: false, toneMapped: false,
      }));
    core.renderOrder = 5;
    group.add(core);

    // Fill
    const fillOpacity = def.id === 'explosive' ? 0.06 : def.id === 'tough3' ? 0.05 : 0.03;
    const fill = new THREE.Mesh(
      new THREE.PlaneGeometry(w - 2, h - 2),
      new THREE.MeshBasicMaterial({
        color: def.color, transparent: true, opacity: fillOpacity,
        side: THREE.DoubleSide,
      }));
    group.add(fill);

    // Glow (additive)
    const glowOpacity = def.id === 'explosive' ? 0.12 : def.id === 'tough3' ? 0.10 : 0.07;
    const glow = new THREE.LineSegments(thickGeo.clone(),
      new THREE.LineBasicMaterial({
        color: def.color, transparent: true, opacity: glowOpacity,
        blending: THREE.AdditiveBlending,
        depthTest: false, depthWrite: false,
        fog: false, toneMapped: false,
      }));
    glow.scale.setScalar(1.04);
    glow.renderOrder = 4;
    group.add(glow);

    return group;
  }

  private makeCandleBrick(def: BrickDefinition, w: number, h: number): THREE.Group {
    const group = new THREE.Group();
    const isGreen = def.id === 'sentimentUp';

    const bodyW = w - 2;
    const bodyH = h * 0.55;
    const positions: number[] = [];

    const bw = bodyW / 2, bh = bodyH / 2;
    // Body rectangle
    positions.push(-bw, -bh, 0, bw, -bh, 0);
    positions.push(bw, -bh, 0, bw, bh, 0);
    positions.push(bw, bh, 0, -bw, bh, 0);
    positions.push(-bw, bh, 0, -bw, -bh, 0);

    // Wicks
    const wickTop = (h - 1) / 2;
    const wickBot = -(h - 1) / 2;
    positions.push(0, bh, 0, 0, wickTop, 0);
    positions.push(0, -bh, 0, 0, wickBot, 0);

    // Inner detail: trend arrow
    if (isGreen) {
      // Upward arrow inside body
      positions.push(0, bh * 0.6, 0, bw * 0.35, -bh * 0.2, 0);
      positions.push(0, bh * 0.6, 0, -bw * 0.35, -bh * 0.2, 0);
      positions.push(0, bh * 0.6, 0, 0, bh * 0.15, 0);
      // Wick serifs
      positions.push(-3, wickTop, 0, 3, wickTop, 0);
    } else {
      // Downward arrow inside body
      positions.push(0, -bh * 0.6, 0, bw * 0.35, bh * 0.2, 0);
      positions.push(0, -bh * 0.6, 0, -bw * 0.35, bh * 0.2, 0);
      positions.push(0, -bh * 0.6, 0, 0, -bh * 0.15, 0);
      // Wick serifs
      positions.push(-3, wickBot, 0, 3, wickBot, 0);
    }

    // Side tick marks (price levels)
    positions.push(-bw, 0, 0, -bw - 3, 0, 0);
    positions.push(bw, 0, 0, bw + 3, 0, 0);

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    const thickGeo = thickenGeo(geo, 0.08, 2);

    const core = new THREE.LineSegments(thickGeo,
      new THREE.LineBasicMaterial({
        color: def.color, transparent: true, opacity: 0.50,
        fog: false, toneMapped: false,
      }));
    core.renderOrder = 5;
    group.add(core);

    // Fill body (green fills solid, red fills hollow-ish)
    const fill = new THREE.Mesh(
      new THREE.PlaneGeometry(bodyW - 1, bodyH - 1),
      new THREE.MeshBasicMaterial({
        color: def.color, transparent: true, opacity: isGreen ? 0.08 : 0.10,
        side: THREE.DoubleSide,
      }));
    group.add(fill);

    const glow = new THREE.LineSegments(thickGeo.clone(),
      new THREE.LineBasicMaterial({
        color: def.color, transparent: true, opacity: 0.14,
        blending: THREE.AdditiveBlending,
        depthTest: false, depthWrite: false,
        fog: false, toneMapped: false,
      }));
    glow.scale.setScalar(1.04);
    glow.renderOrder = 4;
    group.add(glow);

    return group;
  }

  updateBrickDamage(group: THREE.Group, hp: number, maxHp: number, shake = true) {
    const ratio = hp / maxHp;
    if (ratio >= 1) return; // no damage, nothing to do

    const core = group.children[0] as THREE.LineSegments;
    const coreMat = core.material as THREE.LineBasicMaterial;
    const fill = group.children[1] as THREE.Mesh;
    const fillMat = fill.material as THREE.MeshBasicMaterial;
    const glow = group.children[2] as THREE.LineSegments;
    const glowMat = glow.material as THREE.LineBasicMaterial;

    const damage = 1 - ratio; // 0 = full HP, 1 = nearly dead

    // 1. Color shift: lerp toward warning red as damage increases
    const baseColor = new THREE.Color(coreMat.color.getHex());
    const warnColor = new THREE.Color(0xff4444);
    const lerpedColor = baseColor.lerp(warnColor, damage * 0.6);
    coreMat.color.copy(lerpedColor);
    fillMat.color.copy(lerpedColor);
    glowMat.color.copy(lerpedColor);

    // 2. Core opacity: slight dim
    coreMat.opacity = 0.4 + ratio * 0.5;

    // 3. Glow ramp: damaged bricks "leak energy"
    glowMat.opacity = 0.07 + damage * 0.18;

    // 4. Fill gets brighter as brick is about to break
    fillMat.opacity = 0.03 + damage * 0.06;

    // 5. Add crack lines (only once per damage level)
    const crackKey = `_cracks_${hp}`;
    if (!(group.userData as Record<string, boolean>)[crackKey]) {
      (group.userData as Record<string, boolean>)[crackKey] = true;
      this.addCrackLines(group, damage);
    }

    // 6. Shake on hit
    if (shake) {
      const shakeAmount = 1.5 + damage * 2;
      const origX = group.position.x;
      const origY = group.position.y;
      group.position.x += (Math.random() - 0.5) * shakeAmount;
      group.position.y += (Math.random() - 0.5) * shakeAmount;
      setTimeout(() => {
        group.position.x = origX;
        group.position.y = origY;
      }, 80);
    }
  }

  private addCrackLines(group: THREE.Group, damage: number) {
    // Get brick dimensions from geometry's local bounding box (not world-space)
    const core = group.children[0] as THREE.LineSegments;
    core.geometry.computeBoundingBox();
    const box = core.geometry.boundingBox!;
    const hw = (box.max.x - box.min.x) / 2;
    const hh = (box.max.y - box.min.y) / 2;
    const d = 3; // front face z

    const positions: number[] = [];
    const numCracks = damage > 0.6 ? 4 : damage > 0.3 ? 3 : 2;

    for (let c = 0; c < numCracks; c++) {
      // Start from a random edge point
      const edge = Math.floor(Math.random() * 4);
      let sx: number, sy: number;
      if (edge === 0) { sx = -hw + Math.random() * hw * 2; sy = -hh; }
      else if (edge === 1) { sx = hw; sy = -hh + Math.random() * hh * 2; }
      else if (edge === 2) { sx = -hw + Math.random() * hw * 2; sy = hh; }
      else { sx = -hw; sy = -hh + Math.random() * hh * 2; }

      // Zigzag toward center with 2-3 segments
      let cx = sx, cy = sy;
      const segs = 2 + Math.floor(Math.random() * 2);
      for (let s = 0; s < segs; s++) {
        const t = (s + 1) / segs;
        const nx = sx * (1 - t) + (Math.random() - 0.5) * hw * 0.6;
        const ny = sy * (1 - t) + (Math.random() - 0.5) * hh * 0.6;
        positions.push(cx, cy, d, nx, ny, d);
        cx = nx;
        cy = ny;
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    const crackMesh = new THREE.LineSegments(geo,
      new THREE.LineBasicMaterial({
        color: 0xffffff, transparent: true, opacity: 0.3 + damage * 0.3,
        fog: false, toneMapped: false,
      }));
    crackMesh.renderOrder = 6;
    group.add(crackMesh);
  }

  makePaddle(w: number, h: number): THREE.Group {
    const group = new THREE.Group();
    const hw = w / 2, hh = h / 2;
    const depth = 6, d = depth / 2;

    // Build custom paddle wireframe with internal details
    const positions: number[] = [];

    // Outer box (front face)
    positions.push(-hw, -hh, d, hw, -hh, d);
    positions.push(hw, -hh, d, hw, hh, d);
    positions.push(hw, hh, d, -hw, hh, d);
    positions.push(-hw, hh, d, -hw, -hh, d);
    // Back face
    positions.push(-hw, -hh, -d, hw, -hh, -d);
    positions.push(hw, -hh, -d, hw, hh, -d);
    positions.push(hw, hh, -d, -hw, hh, -d);
    positions.push(-hw, hh, -d, -hw, -hh, -d);
    // Connecting edges
    positions.push(-hw, -hh, d, -hw, -hh, -d);
    positions.push(hw, -hh, d, hw, -hh, -d);
    positions.push(hw, hh, d, hw, hh, -d);
    positions.push(-hw, hh, d, -hw, hh, -d);

    // Internal circuitry / energy lines (front face)
    // Central energy channel
    positions.push(-hw * 0.6, 0, d, hw * 0.6, 0, d);
    // Vertical ticks along the channel
    const ticks = 6;
    for (let t = 0; t < ticks; t++) {
      const tx = -hw * 0.5 + (t / (ticks - 1)) * hw;
      positions.push(tx, -hh * 0.35, d, tx, hh * 0.35, d);
    }
    // Edge energy nodes (diamond shapes at each end)
    for (const side of [-1, 1]) {
      const nx = side * (hw - 6);
      const ns = 4;
      positions.push(nx, -ns, d, nx + ns, 0, d);
      positions.push(nx + ns, 0, d, nx, ns, d);
      positions.push(nx, ns, d, nx - ns, 0, d);
      positions.push(nx - ns, 0, d, nx, -ns, d);
    }
    // Angled energy feeds from nodes to edges
    positions.push(-hw, 0, d, -hw + 8, -hh * 0.4, d);
    positions.push(-hw, 0, d, -hw + 8, hh * 0.4, d);
    positions.push(hw, 0, d, hw - 8, -hh * 0.4, d);
    positions.push(hw, 0, d, hw - 8, hh * 0.4, d);

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    const thickGeo = thickenGeo(geo, 0.08, 2);

    const core = new THREE.LineSegments(thickGeo,
      new THREE.LineBasicMaterial({
        color: 0x44ddff, transparent: true, opacity: 0.45,
        fog: false, toneMapped: false,
      }));
    core.renderOrder = 5;
    group.add(core);

    // Fill with gradient-like effect (two layers)
    const fill = new THREE.Mesh(
      new THREE.PlaneGeometry(w - 2, h - 2),
      new THREE.MeshBasicMaterial({
        color: 0x44ddff, transparent: true, opacity: 0.04,
        side: THREE.DoubleSide,
      }));
    group.add(fill);

    // Energy field glow (wider than the paddle)
    const glow = new THREE.LineSegments(thickGeo.clone(),
      new THREE.LineBasicMaterial({
        color: 0x44ddff, transparent: true, opacity: 0.10,
        blending: THREE.AdditiveBlending,
        depthTest: false, depthWrite: false,
        fog: false, toneMapped: false,
      }));
    glow.scale.setScalar(1.06);
    glow.renderOrder = 4;
    group.add(glow);

    // Extra wide energy field halo
    const fieldPositions = new Float32Array([
      -hw * 1.1, 0, 0, hw * 1.1, 0, 0,
      -hw * 0.9, -hh * 1.3, 0, hw * 0.9, -hh * 1.3, 0,
    ]);
    const fieldGeo = new THREE.BufferGeometry();
    fieldGeo.setAttribute('position', new THREE.Float32BufferAttribute(fieldPositions, 3));
    const field = new THREE.LineSegments(fieldGeo,
      new THREE.LineBasicMaterial({
        color: 0x44ddff, transparent: true, opacity: 0.06,
        blending: THREE.AdditiveBlending,
        depthTest: false, depthWrite: false,
        fog: false, toneMapped: false,
      }));
    field.renderOrder = 3;
    group.add(field);

    return group;
  }

  makeBall(radius: number): THREE.Group {
    const group = new THREE.Group();
    const sphere = new THREE.IcosahedronGeometry(radius, 1);
    const edges = new THREE.EdgesGeometry(sphere);
    const thickGeo = thickenEdgesGeo(edges, 0.1, 2);

    const core = new THREE.LineSegments(thickGeo,
      new THREE.LineBasicMaterial({
        color: 0x44ddff, transparent: true, opacity: 0.9,
        fog: false, toneMapped: false,
      }));
    core.renderOrder = 6;
    group.add(core);

    // Inner glow sphere
    const glowSphere = new THREE.Mesh(
      new THREE.IcosahedronGeometry(radius * 0.7, 1),
      new THREE.MeshBasicMaterial({
        color: 0xffffff, transparent: true, opacity: 0.25,
        blending: THREE.AdditiveBlending,
        depthTest: false,
      }));
    group.add(glowSphere);

    // Outer glow
    const outerGlow = new THREE.LineSegments(thickGeo.clone(),
      new THREE.LineBasicMaterial({
        color: 0x44ddff, transparent: true, opacity: 0.2,
        blending: THREE.AdditiveBlending,
        depthTest: false, depthWrite: false,
        fog: false, toneMapped: false,
      }));
    outerGlow.scale.setScalar(1.3);
    outerGlow.renderOrder = 5;
    group.add(outerGlow);

    return group;
  }

  makeBallTrail(): THREE.Mesh {
    const maxPts = 20;
    // Triangle strip: 2 verts per point = maxPts*2 verts
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(maxPts * 2 * 3), 3));
    geo.setAttribute('alpha', new THREE.Float32BufferAttribute(new Float32Array(maxPts * 2), 1));
    geo.setIndex([]);

    const mat = new THREE.ShaderMaterial({
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        color: { value: new THREE.Color(0x66ddff) },
      },
      vertexShader: `
        attribute float alpha;
        varying float vAlpha;
        void main() {
          vAlpha = alpha;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 color;
        varying float vAlpha;
        void main() {
          gl_FragColor = vec4(color * (1.0 + vAlpha * 1.5), vAlpha);
        }
      `,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    mesh.renderOrder = 4;
    return mesh;
  }

  updateBallTrail(trail: THREE.Mesh, trailPositions: number[]) {
    const count = trailPositions.length / 3;
    if (count < 2) {
      trail.geometry.setDrawRange(0, 0);
      return;
    }

    const posAttr = trail.geometry.getAttribute('position') as THREE.BufferAttribute;
    const alphaAttr = trail.geometry.getAttribute('alpha') as THREE.BufferAttribute;
    const pos = posAttr.array as Float32Array;
    const alpha = alphaAttr.array as Float32Array;
    const indices: number[] = [];

    const maxWidth = 2.5; // widest point near the ball

    for (let i = 0; i < count; i++) {
      const t = count > 1 ? i / (count - 1) : 0; // 0=tail, 1=head
      const width = maxWidth * t * t; // quadratic taper — thin tail, wide head
      const a = t * t; // alpha also fades quadratically

      const x = trailPositions[i * 3];
      const y = trailPositions[i * 3 + 1];
      const z = trailPositions[i * 3 + 2];

      // Compute perpendicular direction
      let nx = 0, ny = 1;
      if (i < count - 1) {
        const dx = trailPositions[(i + 1) * 3] - x;
        const dy = trailPositions[(i + 1) * 3 + 1] - y;
        const len = Math.hypot(dx, dy);
        if (len > 0.01) { nx = -dy / len; ny = dx / len; }
      } else if (i > 0) {
        const dx = x - trailPositions[(i - 1) * 3];
        const dy = y - trailPositions[(i - 1) * 3 + 1];
        const len = Math.hypot(dx, dy);
        if (len > 0.01) { nx = -dy / len; ny = dx / len; }
      }

      const vi = i * 2;
      pos[vi * 3] = x + nx * width;
      pos[vi * 3 + 1] = y + ny * width;
      pos[vi * 3 + 2] = z;
      pos[(vi + 1) * 3] = x - nx * width;
      pos[(vi + 1) * 3 + 1] = y - ny * width;
      pos[(vi + 1) * 3 + 2] = z;
      alpha[vi] = a;
      alpha[vi + 1] = a;

      if (i < count - 1) {
        const ci = i * 2;
        indices.push(ci, ci + 1, ci + 2, ci + 1, ci + 3, ci + 2);
      }
    }

    posAttr.needsUpdate = true;
    alphaAttr.needsUpdate = true;
    trail.geometry.setIndex(indices);
    trail.geometry.setDrawRange(0, indices.length);
  }

  makePowerup(color: number): THREE.Group {
    const group = new THREE.Group();
    const geo = new THREE.EdgesGeometry(new THREE.OctahedronGeometry(10, 0));
    const thickGeo = thickenEdgesGeo(geo, 0.08, 2);

    const core = new THREE.LineSegments(thickGeo,
      new THREE.LineBasicMaterial({
        color, transparent: true, opacity: 0.85,
        fog: false, toneMapped: false,
      }));
    core.renderOrder = 5;
    group.add(core);

    const glow = new THREE.LineSegments(thickGeo.clone(),
      new THREE.LineBasicMaterial({
        color, transparent: true, opacity: 0.25,
        blending: THREE.AdditiveBlending,
        depthTest: false, depthWrite: false,
        fog: false, toneMapped: false,
      }));
    glow.scale.setScalar(1.3);
    glow.renderOrder = 4;
    group.add(glow);

    return group;
  }

  makeLaser(): THREE.Group {
    const group = new THREE.Group();
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array([0, -6, 0, 0, 6, 0]);
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    const thickGeo = thickenGeo(geo, 0.12, 2);

    const core = new THREE.LineSegments(thickGeo,
      new THREE.LineBasicMaterial({
        color: 0xff4444, transparent: true, opacity: 0.9,
        fog: false, toneMapped: false,
      }));
    core.renderOrder = 6;
    group.add(core);

    const glow = new THREE.LineSegments(thickGeo.clone(),
      new THREE.LineBasicMaterial({
        color: 0xff4444, transparent: true, opacity: 0.4,
        blending: THREE.AdditiveBlending,
        depthTest: false, depthWrite: false,
        fog: false, toneMapped: false,
      }));
    glow.scale.set(3, 1, 1);
    glow.renderOrder = 5;
    group.add(glow);

    return group;
  }

  makeHazard(): THREE.Group {
    const group = new THREE.Group();
    // Red candle shape
    const bodyGeo = new THREE.EdgesGeometry(new THREE.BoxGeometry(8, 20, 4));
    const thickBody = thickenEdgesGeo(bodyGeo, 0.07, 2);

    const core = new THREE.LineSegments(thickBody,
      new THREE.LineBasicMaterial({
        color: 0xff2222, transparent: true, opacity: 0.75,
        fog: false, toneMapped: false,
      }));
    core.renderOrder = 5;
    group.add(core);

    const fill = new THREE.Mesh(
      new THREE.PlaneGeometry(7, 19),
      new THREE.MeshBasicMaterial({
        color: 0xff2222, transparent: true, opacity: 0.15,
        side: THREE.DoubleSide,
      }));
    group.add(fill);

    const bodyGlow = new THREE.LineSegments(thickBody.clone(),
      new THREE.LineBasicMaterial({
        color: 0xff2222, transparent: true, opacity: 0.2,
        blending: THREE.AdditiveBlending,
        depthTest: false, depthWrite: false,
        fog: false, toneMapped: false,
      }));
    bodyGlow.scale.setScalar(1.04);
    bodyGlow.renderOrder = 4;
    group.add(bodyGlow);

    // Wicks
    const wickGeo = new THREE.BufferGeometry();
    const wickPos = new Float32Array([0, 10, 0, 0, 14, 0, 0, -10, 0, 0, -14, 0]);
    wickGeo.setAttribute('position', new THREE.Float32BufferAttribute(wickPos, 3));
    group.add(new THREE.LineSegments(wickGeo,
      new THREE.LineBasicMaterial({
        color: 0xff2222, transparent: true, opacity: 0.6,
        fog: false, toneMapped: false,
      })));

    return group;
  }

  makeShield(): THREE.Group {
    const group = new THREE.Group();
    const geo = new THREE.BufferGeometry();
    const w = GAME_WIDTH - 40;
    const positions = new Float32Array([-w / 2, 0, 0, w / 2, 0, 0]);
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    const thickGeo = thickenGeo(geo, 0.1, 2);

    const core = new THREE.LineSegments(thickGeo,
      new THREE.LineBasicMaterial({
        color: 0x44ddff, transparent: true, opacity: 0.7,
        fog: false, toneMapped: false,
      }));
    core.renderOrder = 5;
    group.add(core);

    const glow = new THREE.LineSegments(thickGeo.clone(),
      new THREE.LineBasicMaterial({
        color: 0x44ddff, transparent: true, opacity: 0.35,
        blending: THREE.AdditiveBlending,
        depthTest: false, depthWrite: false,
        fog: false, toneMapped: false,
      }));
    glow.scale.y = 3;
    glow.renderOrder = 4;
    group.add(glow);

    return group;
  }

  // ── Boss mesh ──

  // Geometry helpers for boss wireframes
  private bossCircle(cx: number, cy: number, z: number, r: number, segs: number): number[] {
    const p: number[] = [];
    for (let i = 0; i < segs; i++) {
      const a1 = (i / segs) * Math.PI * 2, a2 = ((i + 1) / segs) * Math.PI * 2;
      p.push(cx + Math.cos(a1) * r, cy + Math.sin(a1) * r, z,
             cx + Math.cos(a2) * r, cy + Math.sin(a2) * r, z);
    }
    return p;
  }

  private bossCurve(pts: [number, number][], z: number): number[] {
    const p: number[] = [];
    for (let i = 0; i < pts.length - 1; i++) {
      p.push(pts[i][0], pts[i][1], z, pts[i + 1][0], pts[i + 1][1], z);
    }
    return p;
  }

  private bossLineGroup(positions: number[], color: number | THREE.Color, opacity: number,
    thickness: number, additive: boolean, name?: string): THREE.LineSegments {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    const thickened = thickenGeo(geo, thickness, 2);
    const mesh = new THREE.LineSegments(thickened,
      new THREE.LineBasicMaterial({
        color, transparent: true, opacity,
        blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
        depthTest: !additive, depthWrite: false,
        fog: false, toneMapped: false,
      }));
    if (name) mesh.name = name;
    mesh.renderOrder = additive ? 5 : 6;
    return mesh;
  }

  makeBossMesh(def: BossDefinition): THREE.Group {
    if (def.id === 'whale') return this.makeWhaleMesh(def);
    if (def.id === 'liquidator') return this.makeLiquidatorMesh(def);
    if (def.id === 'flippening') return this.makeFlippeningMesh(def);
    // Fallback
    const g = new THREE.Group();
    g.add(this.bossLineGroup([0, 0, 0, 10, 10, 0], def.color, 0.6, 0.08, false));
    return g;
  }

  private makeWhaleMesh(def: BossDefinition): THREE.Group {
    const group = new THREE.Group();
    const hw = def.width / 2, hh = def.height / 2;
    const d = 4;
    const body: number[] = [];
    const detail: number[] = [];
    const hotglowPos: number[] = [];

    // ── Dorsal contour (top of whale, flowing left=nose to right=tail)
    const dorsalPts: [number, number][] = [
      [-hw * 0.82, hh * 0.05],    // nose tip
      [-hw * 0.75, -hh * 0.15],   // forehead
      [-hw * 0.55, -hh * 0.35],   // rising head
      [-hw * 0.3, -hh * 0.5],     // crown
      [-hw * 0.05, -hh * 0.45],   // behind head dip
      [hw * 0.15, -hh * 0.55],    // dorsal fin start
      [hw * 0.25, -hh * 0.9],     // dorsal fin peak
      [hw * 0.35, -hh * 0.5],     // dorsal fin back
      [hw * 0.55, -hh * 0.35],    // back slope
      [hw * 0.75, -hh * 0.15],    // tail peduncle
      [hw * 0.88, 0],             // tail base
    ];
    body.push(...this.bossCurve(dorsalPts, d));

    // ── Ventral contour (bottom)
    const ventralPts: [number, number][] = [
      [-hw * 0.82, hh * 0.05],    // nose tip (connects to dorsal)
      [-hw * 0.78, hh * 0.2],     // lower jaw
      [-hw * 0.6, hh * 0.4],      // jaw angle
      [-hw * 0.35, hh * 0.5],     // throat grooves area
      [-hw * 0.05, hh * 0.45],    // belly
      [hw * 0.2, hh * 0.4],       // mid belly
      [hw * 0.45, hh * 0.3],      // narrowing
      [hw * 0.65, hh * 0.15],     // tail taper
      [hw * 0.88, 0],             // tail base
    ];
    body.push(...this.bossCurve(ventralPts, d));

    // ── Fluke tail
    const flukeUp: [number, number][] = [
      [hw * 0.88, 0], [hw * 0.95, -hh * 0.2], [hw, -hh * 0.55], [hw * 1.05, -hh * 0.7],
    ];
    const flukeDown: [number, number][] = [
      [hw * 0.88, 0], [hw * 0.95, hh * 0.2], [hw, hh * 0.55], [hw * 1.05, hh * 0.7],
    ];
    body.push(...this.bossCurve(flukeUp, d));
    body.push(...this.bossCurve(flukeDown, d));
    // Fluke trailing edge
    body.push(hw * 1.05, -hh * 0.7, d, hw * 0.98, -hh * 0.35, d);
    body.push(hw * 1.05, hh * 0.7, d, hw * 0.98, hh * 0.35, d);

    // ── Dorsal fin inner ridge
    detail.push(hw * 0.18, -hh * 0.5, d, hw * 0.25, -hh * 0.85, d);
    detail.push(hw * 0.25, -hh * 0.85, d, hw * 0.32, -hh * 0.5, d);

    // ── Pectoral fin
    const pectPts: [number, number][] = [
      [-hw * 0.15, hh * 0.3], [-hw * 0.3, hh * 0.65], [-hw * 0.15, hh * 0.75], [-hw * 0.02, hh * 0.45],
    ];
    body.push(...this.bossCurve(pectPts, d));
    body.push(-hw * 0.02, hh * 0.45, d, -hw * 0.15, hh * 0.3, d); // close

    // ── Mouth line
    detail.push(-hw * 0.8, hh * 0.1, d, -hw * 0.55, hh * 0.25, d);
    // Baleen lines
    for (let i = 0; i < 4; i++) {
      const t = i / 3;
      const mx = -hw * 0.78 + t * hw * 0.25;
      const my1 = hh * 0.1 + t * hh * 0.1;
      detail.push(mx, my1, d, mx, my1 + hh * 0.12, d);
    }

    // ── Throat grooves (ventral pleats)
    for (let i = 0; i < 5; i++) {
      const t = i / 4;
      const gx = -hw * 0.5 + t * hw * 0.55;
      const gy = hh * 0.35 + Math.sin(t * Math.PI) * hh * 0.1;
      detail.push(gx, gy, d, gx + hw * 0.08, gy + hh * 0.04, d);
    }

    // ── Eye (outer + inner)
    const eyeX = -hw * 0.5, eyeY = -hh * 0.12;
    detail.push(...this.bossCircle(eyeX, eyeY, d, 4, 10));
    detail.push(...this.bossCircle(eyeX, eyeY, d, 1.8, 6));
    hotglowPos.push(...this.bossCircle(eyeX, eyeY, d, 4, 10));
    hotglowPos.push(...this.bossCircle(eyeX, eyeY, d, 1.8, 6));

    // ── Bioluminescent pattern (dots along body)
    const bioSpots: [number, number][] = [
      [-hw * 0.2, -hh * 0.2], [hw * 0.0, -hh * 0.25], [hw * 0.2, -hh * 0.22],
      [hw * 0.4, -hh * 0.18], [hw * 0.55, -hh * 0.1],
      [-hw * 0.1, hh * 0.15], [hw * 0.1, hh * 0.2], [hw * 0.3, hh * 0.15],
    ];
    for (const [bx, by] of bioSpots) {
      detail.push(...this.bossCircle(bx, by, d, 1.5, 5));
      hotglowPos.push(...this.bossCircle(bx, by, d, 1.5, 5));
    }

    // ── Ribcage lines (faint skeletal structure)
    for (let i = 0; i < 5; i++) {
      const t = i / 4;
      const rx = -hw * 0.15 + t * hw * 0.5;
      const topY = -hh * 0.4 + Math.sin(t * Math.PI * 0.5) * hh * 0.1;
      const botY = hh * 0.3 - Math.sin(t * Math.PI * 0.5) * hh * 0.05;
      detail.push(rx, topY, d, rx + hw * 0.02, botY, d);
    }

    // ── Back face (simplified silhouette)
    body.push(...this.bossCurve([dorsalPts[0], dorsalPts[3], dorsalPts[6], dorsalPts[10]], -d));
    body.push(...this.bossCurve([ventralPts[0], ventralPts[3], ventralPts[6], ventralPts[8]], -d));
    // Connect key points front to back
    for (const pt of [dorsalPts[0], dorsalPts[6], dorsalPts[10], flukeUp[3], flukeDown[3]]) {
      body.push(pt[0], pt[1], d, pt[0], pt[1], -d);
    }

    // Build meshes
    group.add(this.bossLineGroup(body, def.color, 0.7, 0.10, false, 'body'));
    group.add(this.bossLineGroup(detail, def.color, 0.45, 0.06, false, 'detail'));

    // Fill
    group.add(new THREE.Mesh(
      new THREE.PlaneGeometry(def.width - 4, def.height - 4),
      new THREE.MeshBasicMaterial({ color: def.color, transparent: true, opacity: 0.03, side: THREE.DoubleSide })));

    // Glow (body outline)
    const glowMesh = this.bossLineGroup(body, def.color, 0.2, 0.10, true, 'glow');
    glowMesh.scale.setScalar(1.06);
    group.add(glowMesh);

    // HDR hotglow on eye + bioluminescence
    const hdrColor = new THREE.Color(def.color).multiplyScalar(3.0);
    group.add(this.bossLineGroup(hotglowPos, hdrColor, 0.2, 0.08, true, 'hotglow'));

    // ── Animated: water spout
    const spoutPos: number[] = [];
    const spoutX = -hw * 0.1, spoutBaseY = -hh * 0.55;
    for (let i = 0; i < 5; i++) {
      const spread = (i - 2) * 3;
      spoutPos.push(spoutX + spread * 0.3, spoutBaseY, d,
                     spoutX + spread, spoutBaseY - 18 - Math.abs(spread) * 0.5, d);
    }
    // Cross lines in spray
    spoutPos.push(spoutX - 6, spoutBaseY - 14, d, spoutX + 6, spoutBaseY - 14, d);
    spoutPos.push(spoutX - 4, spoutBaseY - 8, d, spoutX + 4, spoutBaseY - 8, d);
    const spoutGroup = new THREE.Group();
    spoutGroup.name = 'anim_spout';
    spoutGroup.add(this.bossLineGroup(spoutPos, hdrColor, 0.3, 0.06, true));
    group.add(spoutGroup);

    // ── Animated: eye sparkle
    const eyeSparkPos: number[] = [];
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      eyeSparkPos.push(eyeX + Math.cos(a) * 1, eyeY + Math.sin(a) * 1, d + 1,
                        eyeX + Math.cos(a) * 3.5, eyeY + Math.sin(a) * 3.5, d + 1);
    }
    const eyeGroup = new THREE.Group();
    eyeGroup.name = 'anim_eye';
    eyeGroup.add(this.bossLineGroup(eyeSparkPos, 0xffffff, 0.5, 0.04, true));
    group.add(eyeGroup);

    return group;
  }

  private makeLiquidatorMesh(def: BossDefinition): THREE.Group {
    const group = new THREE.Group();
    const hw = def.width / 2, hh = def.height / 2;
    const d = 4;
    const body: number[] = [];
    const detail: number[] = [];
    const hotglowPos: number[] = [];

    // ── Angular hull (octagonal aggressive shape)
    const hullPts: [number, number][] = [
      [-hw * 0.5, -hh],           // top-left inner
      [hw * 0.5, -hh],            // top-right inner
      [hw, -hh * 0.45],           // right upper bevel
      [hw, hh * 0.45],            // right lower bevel
      [hw * 0.7, hh],             // bottom-right
      [-hw * 0.7, hh],            // bottom-left
      [-hw, hh * 0.45],           // left lower bevel
      [-hw, -hh * 0.45],          // left upper bevel
    ];
    // Close the hull
    for (let i = 0; i < hullPts.length; i++) {
      const [x1, y1] = hullPts[i];
      const [x2, y2] = hullPts[(i + 1) % hullPts.length];
      body.push(x1, y1, d, x2, y2, d);
    }
    // Back face
    for (let i = 0; i < hullPts.length; i++) {
      const [x1, y1] = hullPts[i];
      const [x2, y2] = hullPts[(i + 1) % hullPts.length];
      body.push(x1, y1, -d, x2, y2, -d);
      body.push(x1, y1, d, x1, y1, -d); // connect front to back
    }

    // ── Inner frame (structural crossbars)
    detail.push(0, -hh * 0.85, d, 0, hh * 0.85, d); // vertical spine
    detail.push(-hw * 0.75, 0, d, hw * 0.75, 0, d);  // horizontal bar
    detail.push(-hw * 0.55, -hh * 0.55, d, hw * 0.55, -hh * 0.55, d); // upper bar
    detail.push(-hw * 0.45, hh * 0.55, d, hw * 0.45, hh * 0.55, d);   // lower bar

    // ── Warning chevrons (left side)
    for (let i = 0; i < 3; i++) {
      const cy = -hh * 0.3 + i * hh * 0.3;
      body.push(-hw * 0.88, cy - hh * 0.1, d, -hw * 0.7, cy, d);
      body.push(-hw * 0.7, cy, d, -hw * 0.88, cy + hh * 0.1, d);
    }
    // Right side
    for (let i = 0; i < 3; i++) {
      const cy = -hh * 0.3 + i * hh * 0.3;
      body.push(hw * 0.88, cy - hh * 0.1, d, hw * 0.7, cy, d);
      body.push(hw * 0.7, cy, d, hw * 0.88, cy + hh * 0.1, d);
    }

    // ── Threat level bars (right of center)
    for (let i = 0; i < 5; i++) {
      const by = -hh * 0.4 + i * hh * 0.18;
      const bw = hw * 0.15;
      detail.push(hw * 0.45, by, d, hw * 0.45 + bw, by, d);
      hotglowPos.push(hw * 0.45, by, d, hw * 0.45 + bw, by, d);
    }

    // ── Piston details at quadrant intersections
    const pistonW = 3, pistonH = 5;
    const pistonPts: [number, number][] = [
      [-hw * 0.35, -hh * 0.35], [hw * 0.35, -hh * 0.35],
      [-hw * 0.3, hh * 0.35], [hw * 0.3, hh * 0.35],
    ];
    for (const [px, py] of pistonPts) {
      detail.push(px - pistonW, py - pistonH, d, px + pistonW, py - pistonH, d);
      detail.push(px + pistonW, py - pistonH, d, px + pistonW, py + pistonH, d);
      detail.push(px + pistonW, py + pistonH, d, px - pistonW, py + pistonH, d);
      detail.push(px - pistonW, py + pistonH, d, px - pistonW, py - pistonH, d);
      detail.push(px, py - pistonH, d, px, py + pistonH, d); // piston rod
    }

    // ── Scanner array (top sensor strip)
    detail.push(-hw * 0.4, -hh * 0.72, d, hw * 0.4, -hh * 0.72, d);
    detail.push(-hw * 0.4, -hh * 0.8, d, hw * 0.4, -hh * 0.8, d);
    for (let i = 0; i < 6; i++) {
      const sx = -hw * 0.35 + i * hw * 0.14;
      detail.push(sx, -hh * 0.72, d, sx, -hh * 0.8, d);
    }

    // ── Vent slits (flanks)
    for (let side = -1; side <= 1; side += 2) {
      for (let i = 0; i < 3; i++) {
        const vy = -hh * 0.1 + i * hh * 0.15;
        detail.push(side * hw * 0.55, vy, d, side * hw * 0.72, vy, d);
      }
    }

    // ── Gear suggestion (central small zigzag circle)
    const gr = 5, gSegs = 12;
    for (let i = 0; i < gSegs; i++) {
      const a1 = (i / gSegs) * Math.PI * 2;
      const a2 = ((i + 1) / gSegs) * Math.PI * 2;
      const r1 = i % 2 === 0 ? gr : gr * 0.7;
      const r2 = (i + 1) % 2 === 0 ? gr : gr * 0.7;
      detail.push(Math.cos(a1) * r1, Math.sin(a1) * r1, d,
                   Math.cos(a2) * r2, Math.sin(a2) * r2, d);
    }

    // Build meshes
    group.add(this.bossLineGroup(body, def.color, 0.7, 0.10, false, 'body'));
    group.add(this.bossLineGroup(detail, def.color, 0.4, 0.06, false, 'detail'));

    // Fill
    group.add(new THREE.Mesh(
      new THREE.PlaneGeometry(def.width - 4, def.height - 4),
      new THREE.MeshBasicMaterial({ color: def.color, transparent: true, opacity: 0.03, side: THREE.DoubleSide })));

    // Glow
    const glowMesh = this.bossLineGroup(body, def.color, 0.2, 0.10, true, 'glow');
    glowMesh.scale.setScalar(1.06);
    group.add(glowMesh);

    // HDR hotglow
    const hdrColor = new THREE.Color(def.color).multiplyScalar(3.0);
    group.add(this.bossLineGroup(hotglowPos, hdrColor, 0.2, 0.08, true, 'hotglow'));

    // ── Animated: rotating crosshair
    const crossPos: number[] = [];
    const outerR = Math.min(hw, hh) * 0.5;
    const innerR = outerR * 0.45;
    crossPos.push(...this.bossCircle(0, 0, d + 1, outerR, 20));
    crossPos.push(...this.bossCircle(0, 0, d + 1, innerR, 12));
    hotglowPos.push(...this.bossCircle(0, 0, d + 1, outerR, 20));
    // Cardinal crosshair lines (with gap)
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      crossPos.push(Math.cos(a) * innerR * 1.2, Math.sin(a) * innerR * 1.2, d + 1,
                     Math.cos(a) * outerR * 0.85, Math.sin(a) * outerR * 0.85, d + 1);
    }
    // Diagonal tick marks
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      crossPos.push(Math.cos(a) * outerR * 0.75, Math.sin(a) * outerR * 0.75, d + 1,
                     Math.cos(a) * outerR * 0.95, Math.sin(a) * outerR * 0.95, d + 1);
    }
    // Center dot (diamond)
    const cd = 2;
    crossPos.push(0, -cd, d + 1, cd, 0, d + 1);
    crossPos.push(cd, 0, d + 1, 0, cd, d + 1);
    crossPos.push(0, cd, d + 1, -cd, 0, d + 1);
    crossPos.push(-cd, 0, d + 1, 0, -cd, d + 1);

    const crosshairGroup = new THREE.Group();
    crosshairGroup.name = 'anim_crosshair';
    crosshairGroup.add(this.bossLineGroup(crossPos, hdrColor, 0.5, 0.07, true));
    group.add(crosshairGroup);

    // ── Animated: scanning lines
    const scanPos: number[] = [];
    scanPos.push(-hw * 0.85, 0, d + 0.5, hw * 0.85, 0, d + 0.5);
    scanPos.push(-hw * 0.7, 2, d + 0.5, hw * 0.7, 2, d + 0.5);
    const scanGroup = new THREE.Group();
    scanGroup.name = 'anim_scanlines';
    scanGroup.add(this.bossLineGroup(scanPos, hdrColor, 0.25, 0.05, true));
    group.add(scanGroup);

    return group;
  }

  private makeFlippeningMesh(def: BossDefinition): THREE.Group {
    const group = new THREE.Group();
    const hw = def.width / 2, hh = def.height / 2;
    const d = 4;
    const body: number[] = [];
    const detail: number[] = [];
    const hotglowPos: number[] = [];

    // ── Central dividing line (bold)
    body.push(0, -hh * 1.1, d, 0, hh * 1.1, d);
    body.push(0, -hh * 1.1, -d, 0, hh * 1.1, -d);
    body.push(0, -hh * 1.1, d, 0, -hh * 1.1, -d);
    body.push(0, hh * 1.1, d, 0, hh * 1.1, -d);

    // ── Left half: BULL
    // Head outline
    const bullHead: [number, number][] = [
      [0, -hh * 0.4],
      [-hw * 0.2, -hh * 0.35],
      [-hw * 0.4, -hh * 0.2],
      [-hw * 0.55, -hh * 0.05],
      [-hw * 0.6, hh * 0.05],     // snout
      [-hw * 0.55, hh * 0.15],
      [-hw * 0.45, hh * 0.25],
      [-hw * 0.3, hh * 0.35],
      [-hw * 0.15, hh * 0.4],
      [0, hh * 0.4],
    ];
    body.push(...this.bossCurve(bullHead, d));

    // Left horn (sweeping upward curve)
    const hornL: [number, number][] = [
      [-hw * 0.3, -hh * 0.3],
      [-hw * 0.4, -hh * 0.6],
      [-hw * 0.55, -hh * 0.85],
      [-hw * 0.7, -hh * 1.0],
      [-hw * 0.8, -hh * 1.05],    // tip curves outward
    ];
    body.push(...this.bossCurve(hornL, d));
    // Horn inner ridge
    detail.push(-hw * 0.35, -hh * 0.4, d, -hw * 0.6, -hh * 0.88, d);

    // Right horn (partially visible, foreshortened)
    const hornR: [number, number][] = [
      [-hw * 0.15, -hh * 0.35],
      [-hw * 0.2, -hh * 0.65],
      [-hw * 0.25, -hh * 0.9],
    ];
    body.push(...this.bossCurve(hornR, d));

    // Bull eye
    const bullEyeX = -hw * 0.4, bullEyeY = -hh * 0.05;
    detail.push(...this.bossCircle(bullEyeX, bullEyeY, d, 2.5, 8));
    hotglowPos.push(...this.bossCircle(bullEyeX, bullEyeY, d, 2.5, 8));

    // Nostril
    detail.push(-hw * 0.52, hh * 0.05, d, -hw * 0.5, hh * 0.1, d);
    detail.push(-hw * 0.48, hh * 0.05, d, -hw * 0.47, hh * 0.1, d);

    // Muscular shoulder lines
    detail.push(-hw * 0.1, -hh * 0.15, d, -hw * 0.2, hh * 0.1, d);
    detail.push(-hw * 0.15, -hh * 0.1, d, -hw * 0.25, hh * 0.15, d);

    // ── Right half: BEAR
    // Head outline
    const bearHead: [number, number][] = [
      [0, -hh * 0.4],
      [hw * 0.15, -hh * 0.4],
      [hw * 0.3, -hh * 0.35],
      [hw * 0.45, -hh * 0.2],
      [hw * 0.55, -hh * 0.05],
      [hw * 0.6, hh * 0.1],       // snout
      [hw * 0.55, hh * 0.2],      // jaw
      [hw * 0.45, hh * 0.3],
      [hw * 0.3, hh * 0.35],
      [hw * 0.15, hh * 0.4],
      [0, hh * 0.4],
    ];
    body.push(...this.bossCurve(bearHead, d));

    // Bear ears
    const earL: [number, number][] = [
      [hw * 0.2, -hh * 0.4], [hw * 0.22, -hh * 0.65], [hw * 0.3, -hh * 0.7], [hw * 0.35, -hh * 0.55], [hw * 0.32, -hh * 0.38],
    ];
    body.push(...this.bossCurve(earL, d));
    const earR: [number, number][] = [
      [hw * 0.38, -hh * 0.32], [hw * 0.42, -hh * 0.6], [hw * 0.5, -hh * 0.62], [hw * 0.53, -hh * 0.5], [hw * 0.48, -hh * 0.28],
    ];
    body.push(...this.bossCurve(earR, d));

    // Bear eye + angry brow
    const bearEyeX = hw * 0.38, bearEyeY = -hh * 0.08;
    detail.push(...this.bossCircle(bearEyeX, bearEyeY, d, 2.5, 8));
    detail.push(bearEyeX - 3, bearEyeY - 4, d, bearEyeX + 3, bearEyeY - 3, d); // angry brow
    hotglowPos.push(...this.bossCircle(bearEyeX, bearEyeY, d, 2.5, 8));

    // Bear teeth (along jaw)
    for (let i = 0; i < 4; i++) {
      const tx = hw * 0.4 + i * 4;
      const ty = hh * 0.2;
      detail.push(tx, ty, d, tx + 1.5, ty + 4, d);
      detail.push(tx + 1.5, ty + 4, d, tx + 3, ty, d);
    }

    // Claws (3 slash marks below bear jaw)
    for (let i = 0; i < 3; i++) {
      const cx = hw * 0.35 + i * 6;
      const clawPts: [number, number][] = [
        [cx, hh * 0.35], [cx + 2, hh * 0.55], [cx + 1, hh * 0.75],
      ];
      body.push(...this.bossCurve(clawPts, d));
    }

    // Fur texture (short lines along bear contour)
    const furPts: [number, number][] = [
      [hw * 0.5, -hh * 0.15], [hw * 0.55, -hh * 0.0], [hw * 0.52, hh * 0.1],
      [hw * 0.45, hh * 0.22], [hw * 0.35, hh * 0.3],
    ];
    for (const [fx, fy] of furPts) {
      const a = Math.atan2(fy, fx - hw * 0.3);
      detail.push(fx, fy, d, fx + Math.cos(a) * 4, fy + Math.sin(a) * 4, d);
    }

    // ── Energy conduit lines (from center to each half)
    const conduitTargets: [number, number][] = [
      [-hw * 0.3, -hh * 0.25], [-hw * 0.25, 0], [-hw * 0.3, hh * 0.25],
      [hw * 0.3, -hh * 0.25], [hw * 0.25, 0], [hw * 0.3, hh * 0.25],
    ];
    for (const [cx, cy] of conduitTargets) {
      detail.push(0, 0, d, cx, cy, d);
      hotglowPos.push(0, 0, d, cx, cy, d);
      // Energy tick marks along conduit
      const len = Math.sqrt(cx * cx + cy * cy);
      for (let t = 0.3; t < 0.9; t += 0.3) {
        const px = cx * t, py = cy * t;
        const nx = -cy / len * 2, ny = cx / len * 2;
        detail.push(px - nx, py - ny, d, px + nx, py + ny, d);
      }
    }

    // ── S-curve yin-yang divider overlay
    const sCurve: [number, number][] = [];
    for (let i = 0; i <= 12; i++) {
      const t = i / 12;
      const y = -hh * 0.5 + t * hh;
      const x = Math.sin(t * Math.PI * 2) * hw * 0.08;
      sCurve.push([x, y]);
    }
    detail.push(...this.bossCurve(sCurve, d));

    // ── Back face and connections
    body.push(...this.bossCurve([bullHead[0], bullHead[3], bullHead[6], bullHead[9]], -d));
    body.push(...this.bossCurve([bearHead[0], bearHead[3], bearHead[6], bearHead[10]], -d));
    // Connect horn tips and claw tips
    body.push(hornL[4][0], hornL[4][1], d, hornL[4][0], hornL[4][1], -d);
    body.push(bearHead[5][0], bearHead[5][1], d, bearHead[5][0], bearHead[5][1], -d);

    // Build meshes
    group.add(this.bossLineGroup(body, def.color, 0.7, 0.10, false, 'body'));
    group.add(this.bossLineGroup(detail, def.color, 0.4, 0.06, false, 'detail'));

    // Fill
    group.add(new THREE.Mesh(
      new THREE.PlaneGeometry(def.width - 4, def.height - 4),
      new THREE.MeshBasicMaterial({ color: def.color, transparent: true, opacity: 0.03, side: THREE.DoubleSide })));

    // Glow
    const glowMesh = this.bossLineGroup(body, def.color, 0.2, 0.10, true, 'glow');
    glowMesh.scale.setScalar(1.06);
    group.add(glowMesh);

    // HDR hotglow
    const hdrColor = new THREE.Color(def.color).multiplyScalar(3.0);
    group.add(this.bossLineGroup(hotglowPos, hdrColor, 0.2, 0.08, true, 'hotglow'));

    // ── Animated: central rotating core diamond
    const corePos: number[] = [];
    const outerD = 9, innerD = 6;
    // Outer diamond
    corePos.push(0, -outerD, d + 1, outerD, 0, d + 1);
    corePos.push(outerD, 0, d + 1, 0, outerD, d + 1);
    corePos.push(0, outerD, d + 1, -outerD, 0, d + 1);
    corePos.push(-outerD, 0, d + 1, 0, -outerD, d + 1);
    // Inner diamond (rotated 45deg = square)
    const id = innerD * 0.707;
    corePos.push(-id, -id, d + 1, id, -id, d + 1);
    corePos.push(id, -id, d + 1, id, id, d + 1);
    corePos.push(id, id, d + 1, -id, id, d + 1);
    corePos.push(-id, id, d + 1, -id, -id, d + 1);
    // Connecting lines inner to outer
    corePos.push(0, -outerD, d + 1, -id, -id, d + 1);
    corePos.push(outerD, 0, d + 1, id, -id, d + 1);
    corePos.push(0, outerD, d + 1, id, id, d + 1);
    corePos.push(-outerD, 0, d + 1, -id, id, d + 1);
    // Center circle
    corePos.push(...this.bossCircle(0, 0, d + 1, 3, 8));

    const coreGroup = new THREE.Group();
    coreGroup.name = 'anim_core';
    coreGroup.add(this.bossLineGroup(corePos, hdrColor, 0.5, 0.07, true));
    group.add(coreGroup);

    // ── Animated: bull energy (horn tip crackle)
    const bullEnergyPos: number[] = [];
    for (let i = 0; i < 4; i++) {
      const a = Math.random() * Math.PI;
      const tipX = hornL[4][0], tipY = hornL[4][1];
      bullEnergyPos.push(tipX, tipY, d, tipX + Math.cos(a) * 6, tipY + Math.sin(a) * 6, d);
    }
    const bullEGroup = new THREE.Group();
    bullEGroup.name = 'anim_bull_energy';
    bullEGroup.add(this.bossLineGroup(bullEnergyPos, new THREE.Color(0x00ff88).multiplyScalar(2.5), 0.35, 0.05, true));
    group.add(bullEGroup);

    // ── Animated: bear energy (claw crackle)
    const bearEnergyPos: number[] = [];
    for (let i = 0; i < 4; i++) {
      const a = Math.random() * Math.PI + Math.PI * 0.5;
      const tipX = hw * 0.45 + i * 3, tipY = hh * 0.7;
      bearEnergyPos.push(tipX, tipY, d, tipX + Math.cos(a) * 5, tipY + Math.sin(a) * 5, d);
    }
    const bearEGroup = new THREE.Group();
    bearEGroup.name = 'anim_bear_energy';
    bearEGroup.add(this.bossLineGroup(bearEnergyPos, new THREE.Color(0xff2222).multiplyScalar(2.5), 0.35, 0.05, true));
    group.add(bearEGroup);

    return group;
  }

  // ── Effects ──

  burst(gx: number, gy: number, color: number, count: number = 24) {
    const [wx, wy] = [gx - HW, HH - gy];
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + Math.random() * 0.5;
      const speed = 140 + Math.random() * 250;
      this.pushParticle({
        x: wx, y: wy, z: 0,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        vz: (Math.random() - 0.5) * 100,
        life: 1,
        decay: 0.9 + Math.random() * 1.0,
        color,
        size: 5 + Math.random() * 7,
      });
    }
  }

  shards(gx: number, gy: number, color: number) {
    const [wx, wy] = [gx - HW, HH - gy];
    const c = new THREE.Color(color);

    // 1. Thick shockwave ring — built from real geometry so bloom picks it up
    const ringGroup = new THREE.Group();
    ringGroup.position.set(wx, wy, 4);
    ringGroup.renderOrder = 997;
    const ringSegs = 36;
    const ringRadius = 1; // unit circle, scaled up over time
    const ringVerts: number[] = [];
    for (let i = 0; i < ringSegs; i++) {
      const a1 = (i / ringSegs) * Math.PI * 2;
      const a2 = ((i + 1) / ringSegs) * Math.PI * 2;
      const x1 = Math.cos(a1) * ringRadius, y1 = Math.sin(a1) * ringRadius;
      const x2 = Math.cos(a2) * ringRadius, y2 = Math.sin(a2) * ringRadius;
      // Thicken: offset perpendicular to segment
      const dx = x2 - x1, dy = y2 - y1;
      const len = Math.sqrt(dx * dx + dy * dy);
      const nx = -dy / len * 0.08, ny = dx / len * 0.08;
      ringVerts.push(x1 + nx, y1 + ny, 0, x2 + nx, y2 + ny, 0);
      ringVerts.push(x1 - nx, y1 - ny, 0, x2 - nx, y2 - ny, 0);
      ringVerts.push(x1, y1, 0, x2, y2, 0);
    }
    const ringGeo = new THREE.BufferGeometry();
    ringGeo.setAttribute('position', new THREE.Float32BufferAttribute(ringVerts, 3));
    const ringMat = new THREE.LineBasicMaterial({
      color: new THREE.Color(color).multiplyScalar(3.0),
      transparent: true, opacity: 0.9,
      blending: THREE.AdditiveBlending, depthTest: false, fog: false, toneMapped: false,
    });
    ringGroup.add(new THREE.LineSegments(ringGeo, ringMat));
    this.fxGroup.add(ringGroup);
    const ringStart = performance.now();
    const ringUpdate = () => {
      const t = (performance.now() - ringStart) / 450;
      if (t >= 1) {
        this.fxGroup.remove(ringGroup); ringGeo.dispose(); return;
      }
      ringGroup.scale.setScalar(8 + t * 50);
      ringMat.opacity = 0.9 * (1 - t) * (1 - t);
      requestAnimationFrame(ringUpdate);
    };
    requestAnimationFrame(ringUpdate);

    // 2. Hot sparks — mix of white-hot and colored
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2 + Math.random() * 0.6;
      const speed = 120 + Math.random() * 200;
      const isWhite = Math.random() < 0.5;
      this.pushParticle({
        x: wx, y: wy, z: Math.random() * 3,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        vz: (Math.random() - 0.5) * 60,
        life: 1, decay: 0.6 + Math.random() * 0.5,
        color: isWhite ? 0xffffff : color,
        size: 14 + Math.random() * 12,
        hot: true,
      });
    }

    // 3. Particle burst — mix of colored and white
    for (let i = 0; i < 35; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 100 + Math.random() * 260;
      this.pushParticle({
        x: wx + (Math.random() - 0.5) * 6,
        y: wy + (Math.random() - 0.5) * 6,
        z: 0,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        vz: (Math.random() - 0.5) * 80,
        life: 1, decay: 0.6 + Math.random() * 0.8,
        color: Math.random() < 0.3 ? 0xffffff : color,
        size: 4 + Math.random() * 7,
      });
    }

    // 4. Spinning debris chunks — HDR bright
    for (let i = 0; i < 5; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 80 + Math.random() * 180;
      const len = 5 + Math.random() * 10;
      const debrisGeo = new THREE.BufferGeometry();
      debrisGeo.setAttribute('position', new THREE.Float32BufferAttribute([-len, 0, 0, len, 0, 0], 3));
      const debrisColor = new THREE.Color().lerpColors(c, new THREE.Color(0xffffff), Math.random() * 0.5).multiplyScalar(2.0);
      const debrisMat = new THREE.LineBasicMaterial({
        color: debrisColor,
        transparent: true, opacity: 1.0,
        blending: THREE.AdditiveBlending, depthTest: false, fog: false, toneMapped: false,
      });
      const debris = new THREE.LineSegments(debrisGeo, debrisMat);
      debris.position.set(wx, wy, 3);
      debris.renderOrder = 200;
      this.fxGroup.add(debris);

      const dvx = Math.cos(angle) * speed;
      const dvy = Math.sin(angle) * speed;
      const spin = (Math.random() - 0.5) * 14;
      const debrisStart = performance.now();
      const debrisUpdate = () => {
        const elapsed = (performance.now() - debrisStart) / 1000;
        if (elapsed > 0.9) { this.fxGroup.remove(debris); debrisGeo.dispose(); return; }
        debris.position.x = wx + dvx * elapsed;
        debris.position.y = wy + dvy * elapsed - 50 * elapsed * elapsed;
        debris.rotation.z += spin * (1 / 60);
        debrisMat.opacity = 1.0 * Math.max(0, 1 - elapsed / 0.9);
        requestAnimationFrame(debrisUpdate);
      };
      requestAnimationFrame(debrisUpdate);
    }

    // 5. Subtle screen flash
    this.flash(color, 0.2);
  }

  /** Big cinematic explosion for explosive bricks — shockwave, debris, sparks, embers */
  explosion(gx: number, gy: number, color: number) {
    const [wx, wy] = [gx - HW, HH - gy];
    const c = new THREE.Color(color);

    // 1. Expanding shockwave ring
    const ringGeo = new THREE.BufferGeometry();
    const ringSegs = 48;
    const ringPos = new Float32Array(ringSegs * 2 * 3);
    for (let i = 0; i < ringSegs; i++) {
      const a1 = (i / ringSegs) * Math.PI * 2;
      const a2 = ((i + 1) / ringSegs) * Math.PI * 2;
      ringPos[i * 6] = Math.cos(a1); ringPos[i * 6 + 1] = Math.sin(a1); ringPos[i * 6 + 2] = 0;
      ringPos[i * 6 + 3] = Math.cos(a2); ringPos[i * 6 + 4] = Math.sin(a2); ringPos[i * 6 + 5] = 0;
    }
    ringGeo.setAttribute('position', new THREE.Float32BufferAttribute(ringPos, 3));
    const ringMat = new THREE.LineBasicMaterial({
      color, transparent: true, opacity: 0.8,
      blending: THREE.AdditiveBlending, depthTest: false, fog: false, toneMapped: false,
    });
    const ring = new THREE.LineSegments(ringGeo, ringMat);
    ring.position.set(wx, wy, 4);
    ring.renderOrder = 997;
    this.fxGroup.add(ring);
    // Second ring slightly delayed
    const ring2 = ring.clone();
    (ring2.material as THREE.LineBasicMaterial) = ringMat.clone();
    ring2.position.set(wx, wy, 4);
    this.fxGroup.add(ring2);
    const ringStart = performance.now();
    const ringUpdate = () => {
      const elapsed = performance.now() - ringStart;
      // Ring 1
      const t1 = elapsed / 500;
      if (t1 < 1) {
        ring.scale.setScalar(10 + t1 * 120);
        ringMat.opacity = 0.8 * (1 - t1) * (1 - t1);
      }
      // Ring 2 (delayed 80ms, smaller)
      const t2 = (elapsed - 80) / 400;
      if (t2 > 0 && t2 < 1) {
        ring2.scale.setScalar(8 + t2 * 80);
        (ring2.material as THREE.LineBasicMaterial).opacity = 0.5 * (1 - t2) * (1 - t2);
      }
      if (elapsed < 600) {
        requestAnimationFrame(ringUpdate);
      } else {
        this.fxGroup.remove(ring); ring.geometry.dispose();
        this.fxGroup.remove(ring2); ring2.geometry.dispose();
      }
    };
    requestAnimationFrame(ringUpdate);

    // 3. Primary burst — fast bright particles
    for (let i = 0; i < 40; i++) {
      const angle = (i / 40) * Math.PI * 2 + Math.random() * 0.4;
      const speed = 200 + Math.random() * 350;
      this.pushParticle({
        x: wx + (Math.random() - 0.5) * 8,
        y: wy + (Math.random() - 0.5) * 8,
        z: Math.random() * 5,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        vz: (Math.random() - 0.5) * 120,
        life: 1,
        decay: 0.8 + Math.random() * 0.8,
        color: 0xffffff,
        size: 4 + Math.random() * 6,
      });
    }

    // 4. Colored spark burst
    for (let i = 0; i < 50; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 100 + Math.random() * 280;
      this.pushParticle({
        x: wx, y: wy, z: 0,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        vz: (Math.random() - 0.5) * 100,
        life: 1,
        decay: 0.6 + Math.random() * 1.0,
        color,
        size: 2 + Math.random() * 5,
      });
    }

    // 5. Delayed secondary sparks (fire trail effect)
    setTimeout(() => {
      for (let i = 0; i < 25; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 60 + Math.random() * 150;
        // Mix between the brick color and orange/yellow for fire
        const fireColors = [color, 0xff6600, 0xffaa00, 0xffdd44];
        this.pushParticle({
          x: wx + (Math.random() - 0.5) * 30,
          y: wy + (Math.random() - 0.5) * 30,
          z: Math.random() * 3,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed + 40, // slight upward bias
          vz: (Math.random() - 0.5) * 40,
          life: 1,
          decay: 0.7 + Math.random() * 0.6,
          color: fireColors[Math.floor(Math.random() * fireColors.length)],
          size: 3 + Math.random() * 4,
        });
      }
    }, 60);

    // 6. Slow embers that float upward
    for (let i = 0; i < 15; i++) {
      this.pushParticle({
        x: wx + (Math.random() - 0.5) * 20,
        y: wy + (Math.random() - 0.5) * 20,
        z: 0,
        vx: (Math.random() - 0.5) * 40,
        vy: 30 + Math.random() * 60,  // float up
        vz: (Math.random() - 0.5) * 20,
        life: 1,
        decay: 0.3 + Math.random() * 0.3, // long-lived
        color: 0xff4400,
        size: 4 + Math.random() * 6,
      });
    }

    // 7. Spinning debris chunks (line segment objects)
    for (let i = 0; i < 8; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 80 + Math.random() * 200;
      const len = 5 + Math.random() * 12;
      const debrisGeo = new THREE.BufferGeometry();
      debrisGeo.setAttribute('position', new THREE.Float32BufferAttribute([-len, 0, 0, len, 0, 0], 3));
      const debrisMat = new THREE.LineBasicMaterial({
        color: new THREE.Color().lerpColors(c, new THREE.Color(0xffffff), Math.random() * 0.5),
        transparent: true, opacity: 0.9,
        blending: THREE.AdditiveBlending, depthTest: false, fog: false, toneMapped: false,
      });
      const debris = new THREE.LineSegments(debrisGeo, debrisMat);
      debris.position.set(wx, wy, 3);
      debris.renderOrder = 200;
      this.fxGroup.add(debris);

      const dvx = Math.cos(angle) * speed;
      const dvy = Math.sin(angle) * speed;
      const spin = (Math.random() - 0.5) * 15;
      const debrisStart = performance.now();
      const debrisUpdate = () => {
        const elapsed = (performance.now() - debrisStart) / 1000;
        if (elapsed > 1.2) { this.fxGroup.remove(debris); debrisGeo.dispose(); return; }
        debris.position.x = wx + dvx * elapsed;
        debris.position.y = wy + dvy * elapsed - 50 * elapsed * elapsed; // gravity
        debris.rotation.z += spin * (1 / 60);
        debrisMat.opacity = 0.9 * Math.max(0, 1 - elapsed / 1.2);
        requestAnimationFrame(debrisUpdate);
      };
      requestAnimationFrame(debrisUpdate);
    }

    // 8. Intense screen flash (stronger than normal)
    this.flash(color, 0.6);
    // Second flash delayed — the afterglow
    setTimeout(() => this.flash(0xff6600, 0.2), 80);
  }

  flash(color: number, intensity: number = 1) {
    const flashMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(GAME_WIDTH * 2, GAME_HEIGHT * 2),
      new THREE.MeshBasicMaterial({
        color, transparent: true, opacity: intensity * 0.04,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        depthTest: false,
      }));
    flashMesh.position.z = 10;
    flashMesh.renderOrder = 999;
    this.fxGroup.add(flashMesh);
    const start = performance.now();
    const update = () => {
      const t = (performance.now() - start) / 350;
      if (t >= 1) { this.fxGroup.remove(flashMesh); flashMesh.geometry.dispose(); return; }
      (flashMesh.material as THREE.MeshBasicMaterial).opacity = intensity * 0.04 * (1 - t);
      requestAnimationFrame(update);
    };
    requestAnimationFrame(update);
  }

  // ── Particles update ──
  updateParticles(dt: number) {
    // Compact in-place: remove dead particles by swapping with last
    const ps = this.particles;
    let i = 0;
    while (i < ps.length) {
      if (ps[i].life <= 0) {
        ps[i] = ps[ps.length - 1];
        ps.pop();
      } else {
        i++;
      }
    }

    // Update living particles
    for (let j = 0; j < ps.length; j++) {
      const p = ps[j];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      p.vy -= 60 * dt; // gravity
      p.life -= p.decay * dt;
    }

    // Update particle mesh buffers
    this.updateParticleMesh();
  }

  private pushParticle(p: Particle) {
    if (this.particles.length >= Renderer.MAX_PARTICLES) return;
    this.particles.push(p);
  }

  private particleMesh: THREE.Points | null = null;

  private particleShaderMat: THREE.ShaderMaterial | null = null;

  private getParticleShader(): THREE.ShaderMaterial {
    if (!this.particleShaderMat) {
      this.particleShaderMat = new THREE.ShaderMaterial({
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthTest: false,
        depthWrite: false,
        toneMapped: false,
        vertexShader: `
          attribute float size;
          attribute float hot;
          varying vec3 vColor;
          varying float vHot;
          void main() {
            vColor = color;
            vHot = hot;
            vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
            gl_PointSize = size * (400.0 / -mvPos.z);
            gl_Position = projectionMatrix * mvPos;
          }
        `,
        fragmentShader: `
          varying vec3 vColor;
          varying float vHot;
          void main() {
            float d = length(gl_PointCoord - vec2(0.5));
            if (d > 0.5) discard;
            float alpha;
            vec3 col;
            if (vHot > 0.5) {
              // Tight blazing white core
              float core = 1.0 - smoothstep(0.0, 0.1, d);
              // Mid glow ring
              float mid = 1.0 - smoothstep(0.0, 0.25, d);
              // Outer soft halo
              float outer = 1.0 - smoothstep(0.0, 0.5, d);
              // White-hot center bleeding into color
              vec3 white = vec3(1.0);
              col = mix(vColor, white, core * 0.9 + mid * 0.3);
              col *= (1.0 + core * 8.0 + mid * 2.0);
              alpha = outer * 0.7 + mid * 0.3;
            } else {
              alpha = 1.0 - smoothstep(0.2, 0.5, d);
              col = vColor;
            }
            gl_FragColor = vec4(col, alpha);
          }
        `,
        vertexColors: true,
      });
    }
    return this.particleShaderMat;
  }

  private ensureParticleMesh() {
    if (this.particleMesh) return;

    const MAX = Renderer.MAX_PARTICLES;
    this.particleGeo = new THREE.BufferGeometry();

    this.particlePosAttr = new THREE.BufferAttribute(this.particlePositions, 3);
    this.particlePosAttr.setUsage(THREE.DynamicDrawUsage);
    this.particleColAttr = new THREE.BufferAttribute(this.particleColors, 3);
    this.particleColAttr.setUsage(THREE.DynamicDrawUsage);
    this.particleSizeAttr = new THREE.BufferAttribute(this.particleSizes, 1);
    this.particleSizeAttr.setUsage(THREE.DynamicDrawUsage);
    this.particleHotAttr = new THREE.BufferAttribute(this.particleHots, 1);
    this.particleHotAttr.setUsage(THREE.DynamicDrawUsage);

    this.particleGeo.setAttribute('position', this.particlePosAttr);
    this.particleGeo.setAttribute('color', this.particleColAttr);
    this.particleGeo.setAttribute('size', this.particleSizeAttr);
    this.particleGeo.setAttribute('hot', this.particleHotAttr);
    this.particleGeo.setDrawRange(0, 0);

    this.particleMesh = new THREE.Points(this.particleGeo, this.getParticleShader());
    this.particleMesh.renderOrder = 100;
    this.fxGroup.add(this.particleMesh);
  }

  private updateParticleMesh() {
    this.ensureParticleMesh();

    const n = this.particles.length;
    const color = new THREE.Color();
    const positions = this.particlePositions;
    const colors = this.particleColors;
    const sizes = this.particleSizes;
    const hots = this.particleHots;

    for (let i = 0; i < n; i++) {
      const p = this.particles[i];
      positions[i * 3] = p.x;
      positions[i * 3 + 1] = p.y;
      positions[i * 3 + 2] = p.z;
      color.setHex(p.color);
      const hdr = (p.hot ? 6.0 : 2.0) * p.life;
      colors[i * 3] = color.r * hdr;
      colors[i * 3 + 1] = color.g * hdr;
      colors[i * 3 + 2] = color.b * hdr;
      sizes[i] = p.size * (p.hot ? (0.5 + p.life * 0.5) : (0.3 + p.life * 0.7));
      hots[i] = p.hot ? 1.0 : 0.0;
    }

    this.particlePosAttr!.needsUpdate = true;
    this.particleColAttr!.needsUpdate = true;
    this.particleSizeAttr!.needsUpdate = true;
    this.particleHotAttr!.needsUpdate = true;
    this.particleGeo!.setDrawRange(0, n);
  }

  // ── Temp Effects ──
  addTempEffect(group: THREE.Group, durationMs: number) {
    this.fxGroup.add(group);
    this.tempEffects.push({ group, expiresAt: performance.now() + durationMs });
  }

  updateTempEffects() {
    const now = performance.now();
    for (let i = this.tempEffects.length - 1; i >= 0; i--) {
      if (now >= this.tempEffects[i].expiresAt) {
        this.fxGroup.remove(this.tempEffects[i].group);
        this.disposeObject3D(this.tempEffects[i].group);
        this.tempEffects.splice(i, 1);
      }
    }
  }

  // ── Boss Attack Visuals ──

  /** Liquidation beam: tall glowing vertical line from boss to screen bottom */
  createBeamMesh(color: number = 0xff2222): THREE.Group {
    const group = new THREE.Group();

    // Core beam — tall narrow plane
    const beamGeo = new THREE.PlaneGeometry(8, GAME_HEIGHT);
    const beamMat = new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: 0.5,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      depthTest: false, depthWrite: false,
    });
    const beam = new THREE.Mesh(beamGeo, beamMat);
    beam.renderOrder = 50;
    group.add(beam);

    // Edge glow lines
    for (const xOff of [-6, 6]) {
      const edgeGeo = new THREE.BufferGeometry();
      edgeGeo.setAttribute('position', new THREE.Float32BufferAttribute([
        xOff, -GAME_HEIGHT / 2, 0,
        xOff, GAME_HEIGHT / 2, 0,
      ], 3));
      const edgeMat = new THREE.LineBasicMaterial({
        color, transparent: true, opacity: 0.3,
        blending: THREE.AdditiveBlending,
        depthTest: false,
      });
      const edge = new THREE.LineSegments(edgeGeo, edgeMat);
      edge.renderOrder = 50;
      group.add(edge);
    }

    return group;
  }

  updateBeam(group: THREE.Group, gx: number, intensity: number) {
    const wp = this.toWorld(gx, GAME_HEIGHT / 2);
    group.position.set(wp.x, wp.y, 1);

    // Pulse opacity
    const core = group.children[0] as THREE.Mesh;
    (core.material as THREE.MeshBasicMaterial).opacity = 0.3 + intensity * 0.4;
    for (let i = 1; i < group.children.length; i++) {
      const edge = group.children[i] as THREE.LineSegments;
      (edge.material as THREE.LineBasicMaterial).opacity = 0.2 + intensity * 0.3;
    }
  }

  /** Column strike warning: flashing vertical rectangle outline */
  drawColumnWarning(gx: number, width: number, progress: number, color: number = 0xff4400) {
    const hw = width / 2;
    const hh = GAME_HEIGHT / 2;
    const positions = [
      -hw, -hh, 0, hw, -hh, 0,
      hw, -hh, 0, hw, hh, 0,
      hw, hh, 0, -hw, hh, 0,
      -hw, hh, 0, -hw, -hh, 0,
    ];
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    const mat = new THREE.LineBasicMaterial({
      color, transparent: true,
      opacity: 0.15 + Math.sin(progress * Math.PI * 8) * 0.15,
      blending: THREE.AdditiveBlending,
      depthTest: false,
    });
    const mesh = new THREE.LineSegments(geo, mat);
    mesh.renderOrder = 45;
    const wp = this.toWorld(gx, GAME_HEIGHT / 2);
    mesh.position.set(wp.x, wp.y, 1);
    const group = new THREE.Group();
    group.add(mesh);
    this.addTempEffect(group, 50);
  }

  /** Gravity swell: concentric expanding rings around a point */
  drawGravityField(gx: number, gy: number, radius: number, progress: number, color: number = 0x0088ff) {
    const group = new THREE.Group();
    const wp = this.toWorld(gx, gy);
    group.position.set(wp.x, wp.y, 1);

    for (let ring = 0; ring < 3; ring++) {
      const ringProgress = (progress + ring * 0.33) % 1.0;
      const r = radius * ringProgress;
      const segs = 24;
      const positions: number[] = [];
      for (let s = 0; s < segs; s++) {
        const a1 = (s / segs) * Math.PI * 2;
        const a2 = ((s + 1) / segs) * Math.PI * 2;
        positions.push(Math.cos(a1) * r, Math.sin(a1) * r, 0);
        positions.push(Math.cos(a2) * r, Math.sin(a2) * r, 0);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      const mat = new THREE.LineBasicMaterial({
        color, transparent: true,
        opacity: 0.25 * (1 - ringProgress),
        blending: THREE.AdditiveBlending,
        depthTest: false,
      });
      const mesh = new THREE.LineSegments(geo, mat);
      mesh.renderOrder = 45;
      group.add(mesh);
    }

    this.addTempEffect(group, 50); // single frame, redrawn each frame
  }

  /** Liquidation lane strike: fast downward bolt in a column */
  drawLiqLaneStrike(gx: number, width: number, progress: number) {
    const hw = width / 2;
    const hh = GAME_HEIGHT / 2;
    // Full-height column flash
    const positions = [
      -hw, -hh, 0, hw, -hh, 0,
      hw, -hh, 0, hw, hh, 0,
      hw, hh, 0, -hw, hh, 0,
      -hw, hh, 0, -hw, -hh, 0,
      // Cross lines for visual impact
      -hw, -hh, 0, hw, hh, 0,
      hw, -hh, 0, -hw, hh, 0,
    ];
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    // Bright flash that fades
    const intensity = 1 - progress;
    const mat = new THREE.LineBasicMaterial({
      color: 0xff4400, transparent: true,
      opacity: 0.3 * intensity,
      blending: THREE.AdditiveBlending,
      depthTest: false,
    });
    const mesh = new THREE.LineSegments(geo, mat);
    mesh.renderOrder = 46;

    // Inner fill plane for the strike
    const fillGeo = new THREE.PlaneGeometry(width, GAME_HEIGHT);
    const fillMat = new THREE.MeshBasicMaterial({
      color: 0xff4400, transparent: true,
      opacity: 0.06 * intensity,
      blending: THREE.AdditiveBlending,
      depthTest: false,
    });
    const fill = new THREE.Mesh(fillGeo, fillMat);
    fill.renderOrder = 45;

    const wp = this.toWorld(gx, GAME_HEIGHT / 2);
    const group = new THREE.Group();
    group.add(mesh);
    group.add(fill);
    group.position.set(wp.x, wp.y, 1);
    this.addTempEffect(group, 50);
  }

  /** Telegraph indicator: pulsing line from boss toward target */
  drawTelegraphLine(fromGx: number, fromGy: number, toGx: number, toGy: number, color: number, progress: number) {
    const from = this.toWorld(fromGx, fromGy);
    const to = this.toWorld(toGx, toGy);
    const positions = [from.x, from.y, 1, to.x, to.y, 1];
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    const opacity = 0.2 + Math.sin(progress * Math.PI * 6) * 0.2;
    const mat = new THREE.LineBasicMaterial({
      color, transparent: true, opacity,
      blending: THREE.AdditiveBlending,
      depthTest: false,
    });
    const mesh = new THREE.LineSegments(geo, mat);
    mesh.renderOrder = 44;
    const group = new THREE.Group();
    group.add(mesh);
    this.addTempEffect(group, 50);
  }

  // ── Background ──
  setLevelTheme(levelIndex: number) {
    const theme = LEVEL_THEMES[levelIndex] || LEVEL_THEMES[0];
    (this.scene.background as THREE.Color).setHex(theme.bg);
    const fog = this.scene.fog as THREE.FogExp2;
    fog.color.setHex(theme.fog);
    fog.density = theme.fogDensity;
    this.bloom.strength = theme.bloomStrength;
    this.bloom.radius = theme.bloomRadius;
    this.bloom.threshold = 0.03;
    this.webgl.toneMappingExposure = theme.exposure;
  }

  clearBackground() {
    while (this.bgGroup.children.length > 0) {
      const child = this.bgGroup.children[0];
      this.bgGroup.remove(child);
      this.disposeObject3D(child);
    }
  }

  private disposeObject3D(root: THREE.Object3D) {
    root.traverse((node) => {
      if ('geometry' in node) {
        const geometry = (node as THREE.Mesh | THREE.LineSegments | THREE.Points).geometry;
        if (geometry) geometry.dispose();
      }
      if ('material' in node) {
        const material = (node as THREE.Mesh | THREE.LineSegments | THREE.Points).material;
        if (Array.isArray(material)) {
          for (const mat of material) this.disposeMaterial(mat);
        } else if (material) {
          this.disposeMaterial(material);
        }
      }
    });
  }

  private disposeMaterial(material: THREE.Material) {
    const m = material as THREE.Material & Record<string, unknown>;
    for (const key of ['map', 'alphaMap', 'lightMap', 'aoMap', 'emissiveMap', 'bumpMap', 'normalMap']) {
      const tex = m[key];
      if (tex instanceof THREE.Texture) tex.dispose();
    }
    material.dispose();
  }

  // ── HUD (canvas-based — rendered through CRT) ──

  private initTicker() {
    this.tickerData = this.fakeTicker();
    this.fetchRealTicker();
  }

  private fakeTicker(): { sym: string; price: number; pct: number }[] {
    const coins = [
      { sym: 'BTC', base: 67420 }, { sym: 'ETH', base: 3580 },
      { sym: 'SOL', base: 178 }, { sym: 'DOGE', base: 0.162 },
      { sym: 'AVAX', base: 38.5 }, { sym: 'LINK', base: 18.2 },
      { sym: 'ADA', base: 0.62 }, { sym: 'DOT', base: 7.85 },
      { sym: 'MATIC', base: 0.88 }, { sym: 'UNI', base: 12.4 },
      { sym: 'ATOM', base: 9.3 }, { sym: 'XRP', base: 0.54 },
      { sym: 'NEAR', base: 7.1 }, { sym: 'APT', base: 11.8 },
      { sym: 'ARB', base: 1.24 },
    ];
    return coins.map(c => {
      const pct = (Math.random() - 0.45) * 20;
      return { sym: c.sym, price: c.base * (1 + pct / 100), pct };
    });
  }

  private async fetchRealTicker() {
    const ids = 'bitcoin,ethereum,solana,dogecoin,avalanche-2,chainlink,cardano,polkadot,matic-network,uniswap,cosmos,ripple,near,aptos,arbitrum';
    const syms: Record<string, string> = {
      bitcoin: 'BTC', ethereum: 'ETH', solana: 'SOL', dogecoin: 'DOGE',
      'avalanche-2': 'AVAX', chainlink: 'LINK', cardano: 'ADA', polkadot: 'DOT',
      'matic-network': 'MATIC', uniswap: 'UNI', cosmos: 'ATOM', ripple: 'XRP',
      near: 'NEAR', aptos: 'APT', arbitrum: 'ARB',
    };
    try {
      const res = await fetch(
        `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true`
      );
      if (!res.ok) return;
      const json = await res.json();
      const data: { sym: string; price: number; pct: number }[] = [];
      for (const [id, sym] of Object.entries(syms)) {
        const entry = json[id];
        if (entry) {
          data.push({ sym, price: entry.usd, pct: entry.usd_24h_change ?? 0 });
        }
      }
      if (data.length > 0) this.tickerData = data;
    } catch {
      // Keep fake data if fetch fails
    }
  }

  showCallout(gx: number, gy: number, text: string, color: string, size: number = 18, quick: boolean = false) {
    // Nudge vertically so callouts don't overlap existing ones
    let finalGy = gy;
    const minGap = size * 1.4; // minimum vertical distance between callouts
    for (let attempt = 0; attempt < 5; attempt++) {
      let overlaps = false;
      for (const c of this.activeCallouts) {
        if (Math.abs(c.gx - gx) < 120 && Math.abs(c.gy - finalGy) < minGap) {
          overlaps = true;
          break;
        }
      }
      if (!overlaps) break;
      finalGy -= minGap; // shift upward
    }
    this.activeCallouts.push({ text, color, size: size * 1.0, gx, gy: finalGy, startTime: performance.now(), quick });
    this.hudDirty = true;
  }

  updateHUD(data: {
    score: number; lives: number; combo: number;
    sentiment: string; sentimentColor: string;
    stage: string; effects: string;
    eventLabel?: string;
    bossName?: string | null;
    bossHp?: number | null;
    riskLabel?: string;
    riskColor?: string;
  }) {
    this.hudData = data;
    this.hudDirty = true;
  }

  showOverlay(html: string) {
    this.overlayHtml = html;
    this.overlayEl.innerHTML = html;
    this.overlayEl.style.display = 'flex';
    this.overlayEl.style.position = 'absolute';
    this.overlayEl.style.zIndex = '20';
    this.hudDirty = true;
  }

  hideOverlay() {
    this.overlayHtml = null;
    this.overlayEl.style.display = 'none';
    this.overlayScreen = null;
    this.riskButtonRects = [];
    this.hudDirty = true;
  }

  /** Set a canvas-based overlay screen (rendered through CRT) */
  setOverlayScreen(screen: OverlayScreen) {
    this.overlayScreen = screen;
    this.overlayHtml = null;
    this.overlayEl.style.display = 'none';
    this.hudDirty = true;
    if (screen.type === 'menu') {
      this.riskButtonRects = [];
      this.selectedRiskId = 'margin';
    }
  }

  /** Get selected risk profile id */
  getSelectedRiskId(): string {
    return this.selectedRiskId;
  }

  /** Hit-test overlay buttons, returns risk id if a button was clicked, null otherwise */
  hitTestOverlay(gx: number, gy: number): string | null {
    for (const btn of this.riskButtonRects) {
      if (gx >= btn.gx && gx <= btn.gx + btn.gw && gy >= btn.gy && gy <= btn.gy + btn.gh) {
        this.selectedRiskId = btn.id;
        return btn.id;
      }
    }
    return null;
  }

  /** Check if overlay screen is showing */
  hasOverlayScreen(): boolean {
    return this.overlayScreen !== null;
  }

  /** Dim a hex color string by a multiplier (0-1) */
  private dimColor(hex: string, mult: number): string {
    const c = hex.replace('#', '');
    const r = Math.round(parseInt(c.substring(0, 2), 16) * mult);
    const g = Math.round(parseInt(c.substring(2, 4), 16) * mult);
    const b = Math.round(parseInt(c.substring(4, 6), 16) * mult);
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
  }

  /** Render all HUD/ticker/callouts to the canvas texture */
  private renderHudCanvas() {
    const needsRedraw = this.hudDirty || this.activeCallouts.length > 0 || this.tickerData.length > 0 || this.overlayScreen !== null;
    if (!needsRedraw) return;
    this.hudDirty = false;

    const W = this.hudCanvas.width;
    const H = this.hudCanvas.height;
    const ctx = this.hudCtx;
    const sx = W / GAME_WIDTH;
    const sy = H / GAME_HEIGHT;

    ctx.clearRect(0, 0, W, H);

    // ── Ticker tape (top) ──
    if (this.tickerData.length > 0) {
      const tickerH = 36 * sy;
      ctx.fillStyle = 'rgba(0, 2, 8, 0.6)';
      ctx.fillRect(0, 0, W, tickerH);

      ctx.save();
      ctx.rect(0, 0, W, tickerH);
      ctx.clip();

      const fontSize = Math.round(22 * sy);
      ctx.font = `bold ${fontSize}px "Courier New", monospace`;
      ctx.textBaseline = 'middle';

      // Build ticker string and measure
      let totalWidth = 0;
      const segments: { text: string; color: string; width: number }[] = [];
      for (const c of this.tickerData) {
        if (c.price == null || c.pct == null) continue;
        const sign = c.pct >= 0 ? '+' : '';
        const priceStr = c.price >= 1 ? c.price.toFixed(2) : c.price.toFixed(4);
        const label = `${c.sym} $${priceStr} ${sign}${c.pct.toFixed(1)}%`;
        const color = c.pct >= 0 ? '#00ff66' : '#ff5555';
        const w = ctx.measureText(label).width;
        segments.push({ text: label, color, width: w });
        const sepW = ctx.measureText('  |  ').width;
        segments.push({ text: '  |  ', color: '#557788', width: sepW });
        totalWidth += w + sepW;
      }

      // Scroll
      const now = performance.now();
      const tickerDt = this.lastTickerTime ? (now - this.lastTickerTime) / 1000 : 0.016;
      this.lastTickerTime = now;
      this.tickerOffset = (this.tickerOffset + 150 * tickerDt) % totalWidth; // 150 px/sec

      let x = -this.tickerOffset;
      const cy = tickerH / 2;
      // Draw twice for seamless loop
      for (let rep = 0; rep < 3 && x < W; rep++) {
        for (const seg of segments) {
          if (x + seg.width > 0 && x < W) {
            ctx.fillStyle = seg.color;
            ctx.fillText(seg.text, x, cy);
          }
          x += seg.width;
        }
      }
      ctx.restore();
    }

    // ── HUD (bottom) — two-row layout for portrait ──
    if (this.hudData) {
      const d = this.hudData;
      const bagValue = '$' + (d.score * 100 + 10000).toLocaleString();
      const pnl = d.score > 0 ? `+${(d.score * 0.8).toFixed(0)}%` : '0%';
      const pnlColor = d.score > 0 ? '#009966' : '#666666';
      const hodl = '\u25C6'.repeat(d.lives);
      const comboText = d.combo >= 5 ? `x${d.combo} SEND IT`
        : d.combo >= 3 ? `x${d.combo} PUMP`
        : d.combo > 1 ? `x${d.combo}` : '';

      // HUD background bar (taller for two rows)
      const hudBarH = 55 * sy;
      ctx.fillStyle = 'rgba(0, 2, 8, 0.5)';
      ctx.fillRect(0, H - hudBarH, W, hudBarH);

      const medFont = Math.round(18 * sy);
      const smallFont = Math.round(14 * sy);
      const pad = 10 * sx;

      // Row 1: bag value, PnL, lives
      const row1Y = H - 32 * sy;
      let hx = pad;
      ctx.textBaseline = 'bottom';

      ctx.font = `bold ${medFont}px "Courier New", monospace`;
      ctx.fillStyle = '#009966';
      ctx.fillText(bagValue, hx, row1Y);
      hx += ctx.measureText(bagValue).width + 8 * sx;

      ctx.fillStyle = pnlColor;
      ctx.fillText(pnl, hx, row1Y);
      hx += ctx.measureText(pnl).width + 8 * sx;

      ctx.fillStyle = '#3399bb';
      ctx.fillText(hodl, hx, row1Y);

      // Risk label + stage name (right side, row 1)
      ctx.font = `${smallFont}px "Courier New", monospace`;
      let rightX = W - pad;
      ctx.fillStyle = '#445566';
      const stageW = ctx.measureText(d.stage).width;
      ctx.fillText(d.stage, rightX - stageW, row1Y);
      if (d.riskLabel) {
        const riskText = ` [${d.riskLabel}]`;
        ctx.fillStyle = d.riskColor || '#666';
        const riskW = ctx.measureText(riskText).width;
        ctx.fillText(riskText, rightX - stageW - riskW, row1Y);
      }

      // Row 2: combo, sentiment, effects, event label
      const row2Y = H - 8 * sy;
      hx = pad;

      if (comboText) {
        ctx.font = `bold ${smallFont}px "Courier New", monospace`;
        ctx.fillStyle = '#bb8800';
        ctx.fillText(comboText, hx, row2Y);
        hx += ctx.measureText(comboText).width + 8 * sx;
      }

      ctx.font = `bold ${smallFont}px "Courier New", monospace`;
      ctx.fillStyle = d.sentimentColor;
      ctx.fillText(d.sentiment, hx, row2Y);
      hx += ctx.measureText(d.sentiment).width + 8 * sx;

      if (d.effects) {
        ctx.font = `${smallFont}px "Courier New", monospace`;
        ctx.fillStyle = '#3399bb';
        ctx.fillText(d.effects, hx, row2Y);
      }

      // Event label (right side, row 2)
      if (d.eventLabel) {
        ctx.font = `bold ${smallFont}px "Courier New", monospace`;
        ctx.fillStyle = '#cc4444';
        const eventW = ctx.measureText(d.eventLabel).width;
        ctx.fillText(d.eventLabel, W - eventW - pad, row2Y);
      }

      // Boss HP bar — full-width thin strip at very top of screen
      if (d.bossName && d.bossHp != null) {
        const barW = W;
        const barH = 6 * sy;
        const barX = 0;
        const barY = 0;

        // Bar background
        ctx.fillStyle = 'rgba(60, 0, 0, 0.4)';
        ctx.fillRect(barX, barY, barW, barH);

        // HP fill
        const hpFill = Math.max(0, Math.min(1, d.bossHp));
        const hpColor = hpFill > 0.5 ? '#cc4444' : hpFill > 0.25 ? '#cc6622' : '#cc2222';
        ctx.fillStyle = hpColor;
        ctx.fillRect(barX, barY, barW * hpFill, barH);

        // Boss name — small, right-aligned next to HP bar
        ctx.font = `bold ${Math.floor(smallFont * 0.85)}px "Courier New", monospace`;
        ctx.fillStyle = '#994444';
        ctx.textAlign = 'right';
        ctx.fillText(d.bossName, W - 8 * sx, barY + barH + 14 * sy);
        ctx.textAlign = 'left';
      }
    }

    // ── Callouts ──
    const now = performance.now();
    this.activeCallouts = this.activeCallouts.filter(c => {
      const dur = c.quick ? 600 : 1000;
      return now - c.startTime < dur;
    });
    for (const c of this.activeCallouts) {
      const dur = c.quick ? 600 : 1000;
      const t = (now - c.startTime) / dur; // 0→1
      const peakAlpha = c.quick ? 0.7 : 0.9;
      const alpha = (t < 0.3 ? peakAlpha : peakAlpha * (1 - (t - 0.3) / 0.7));
      const yOff = t * (c.quick ? -30 : -50) * sy;
      const scale = c.quick ? 1.0 : (t < 0.3 ? 1 + t * 0.15 : 1.045 - (t - 0.3) * 0.2);

      ctx.save();
      const cx = c.gx * sx;
      const cy = c.gy * sy + yOff;
      ctx.translate(cx, cy);
      ctx.scale(scale, scale);
      ctx.globalAlpha = Math.max(0, alpha);
      ctx.font = `bold ${c.size * sy}px "Courier New", monospace`;
      ctx.fillStyle = c.color;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(c.text, 0, 0);
      ctx.globalAlpha = 1;
      ctx.restore();
    }

    // ── Canvas Overlay Screens ──
    if (this.overlayScreen) {
      this.renderOverlayScreen(ctx, W, H, sx, sy);
    }

    this.hudTexture.needsUpdate = true;
  }

  /** Render a canvas-based overlay screen */
  private renderOverlayScreen(ctx: CanvasRenderingContext2D, W: number, H: number, sx: number, sy: number) {
    const screen = this.overlayScreen!;
    const now = performance.now();

    // All text uses muted colors (~40-50% brightness) to avoid bloom blowout
    // The bloom threshold is 0.03 so bright colors explode

    // Helper: draw text that always fits within maxW, shrinking font if needed
    const fitText = (c: CanvasRenderingContext2D, text: string, x: number, y: number,
                     maxW: number, fontSize: number, bold: boolean) => {
      let sz = fontSize;
      const prefix = bold ? 'bold ' : '';
      c.font = `${prefix}${sz}px "Courier New", monospace`;
      while (sz > 8 && c.measureText(text).width > maxW) {
        sz -= 1;
        c.font = `${prefix}${sz}px "Courier New", monospace`;
      }
      c.fillText(text, x, y);
    };

    ctx.save();

    switch (screen.type) {
      case 'menu': {
        ctx.fillStyle = 'rgba(0, 6, 4, 0.92)';
        ctx.fillRect(0, 0, W, H);

        const centerX = W / 2;
        const t = now * 0.001;

        // ── Helper: draw a 2D game brick with wireframe detail ──
        const drawBrick = (bx: number, by: number, bw: number, bh: number,
                           color: number, typeId: string, alpha: number) => {
          const r = (color >> 16) & 0xff;
          const g = (color >> 8) & 0xff;
          const b = color & 0xff;
          // Outer box at ~40%
          const dr = Math.round(r * 0.40);
          const dg = Math.round(g * 0.40);
          const db = Math.round(b * 0.40);
          const fillCol = `rgb(${dr},${dg},${db})`;
          // Internal wireframe at ~55%
          const wr = Math.round(r * 0.55);
          const wg = Math.round(g * 0.55);
          const wb = Math.round(b * 0.55);
          const wireCol = `rgb(${wr},${wg},${wb})`;

          ctx.globalAlpha = alpha * 1.8 > 1 ? 1 : alpha * 1.8;
          // Dark fill
          ctx.fillStyle = `rgba(${Math.round(r*0.12)},${Math.round(g*0.12)},${Math.round(b*0.12)},0.7)`;
          ctx.fillRect(bx, by, bw, bh);
          // Wireframe outer box
          ctx.strokeStyle = fillCol;
          ctx.lineWidth = 1.5;
          ctx.strokeRect(bx, by, bw, bh);

          // Type-specific internal wireframe detail
          const cx = bx + bw / 2, cy = by + bh / 2;
          const hw = bw / 2, hh = bh / 2;
          ctx.strokeStyle = wireCol;
          ctx.lineWidth = 1;
          ctx.beginPath();

          if (typeId === 'standard') {
            // Hash cross
            ctx.moveTo(cx - hw * 0.4, cy); ctx.lineTo(cx + hw * 0.4, cy);
            ctx.moveTo(cx, cy - hh * 0.5); ctx.lineTo(cx, cy + hh * 0.5);
          } else if (typeId === 'tough') {
            // Double border with corner braces
            const iw = hw * 0.82, ih = hh * 0.82;
            ctx.rect(cx - iw, cy - ih, iw * 2, ih * 2);
            ctx.moveTo(bx, by); ctx.lineTo(cx - iw, cy - ih);
            ctx.moveTo(bx + bw, by); ctx.lineTo(cx + iw, cy - ih);
            ctx.moveTo(bx + bw, by + bh); ctx.lineTo(cx + iw, cy + ih);
            ctx.moveTo(bx, by + bh); ctx.lineTo(cx - iw, cy + ih);
          } else if (typeId === 'tough3') {
            // Two nested rects + diamond core
            for (const s of [0.85, 0.65]) {
              ctx.rect(cx - hw * s, cy - hh * s, hw * s * 2, hh * s * 2);
            }
            const dw = hw * 0.3, dh = hh * 0.35;
            ctx.moveTo(cx, cy - dh); ctx.lineTo(cx + dw, cy);
            ctx.lineTo(cx, cy + dh); ctx.lineTo(cx - dw, cy);
            ctx.closePath();
          } else if (typeId === 'explosive') {
            // Star burst
            for (let i = 0; i < 8; i++) {
              const a = (i / 8) * Math.PI * 2;
              const rl = Math.min(hw, hh) * 0.7;
              ctx.moveTo(cx, cy);
              ctx.lineTo(cx + Math.cos(a) * rl, cy + Math.sin(a) * rl);
            }
            // Warning triangle
            const ts = Math.min(hw, hh) * 0.35;
            ctx.moveTo(cx, cy - ts); ctx.lineTo(cx + ts * 0.866, cy + ts * 0.5);
            ctx.lineTo(cx - ts * 0.866, cy + ts * 0.5); ctx.closePath();
          } else if (typeId === 'drop') {
            // Downward chevrons + parachute arc
            for (let i = 0; i < 2; i++) {
              const yOff = (i - 0.5) * hh * 0.6;
              ctx.moveTo(cx - hw * 0.4, cy + yOff + hh * 0.2);
              ctx.lineTo(cx, cy + yOff);
              ctx.lineTo(cx + hw * 0.4, cy + yOff + hh * 0.2);
            }
          } else if (typeId === 'sentimentUp') {
            // Green candle: body rect + wicks + up arrow
            const cbh = bh * 0.28;
            ctx.rect(cx - hw * 0.7, cy - cbh, hw * 1.4, cbh * 2);
            ctx.moveTo(cx, by + 1); ctx.lineTo(cx, by + bh - 1); // wick
            ctx.moveTo(cx, cy - cbh); ctx.lineTo(cx - hw * 0.3, cy);
            ctx.moveTo(cx, cy - cbh); ctx.lineTo(cx + hw * 0.3, cy);
          } else if (typeId === 'sentimentDown') {
            // Red candle: body rect + wicks + down arrow
            const cbh = bh * 0.28;
            ctx.rect(cx - hw * 0.7, cy - cbh, hw * 1.4, cbh * 2);
            ctx.moveTo(cx, by + 1); ctx.lineTo(cx, by + bh - 1);
            ctx.moveTo(cx, cy + cbh); ctx.lineTo(cx - hw * 0.3, cy);
            ctx.moveTo(cx, cy + cbh); ctx.lineTo(cx + hw * 0.3, cy);
          } else if (typeId === 'hazard') {
            // X mark + circle
            ctx.moveTo(cx - hw * 0.5, cy - hh * 0.5); ctx.lineTo(cx + hw * 0.5, cy + hh * 0.5);
            ctx.moveTo(cx + hw * 0.5, cy - hh * 0.5); ctx.lineTo(cx - hw * 0.5, cy + hh * 0.5);
            ctx.moveTo(cx + Math.min(hw, hh) * 0.45, cy);
            ctx.arc(cx, cy, Math.min(hw, hh) * 0.45, 0, Math.PI * 2);
          } else if (typeId === 'fomo') {
            // Hourglass
            ctx.moveTo(cx - hw * 0.5, cy - hh * 0.6); ctx.lineTo(cx + hw * 0.5, cy - hh * 0.6);
            ctx.moveTo(cx - hw * 0.5, cy + hh * 0.6); ctx.lineTo(cx + hw * 0.5, cy + hh * 0.6);
            ctx.moveTo(cx - hw * 0.5, cy - hh * 0.6); ctx.lineTo(cx + hw * 0.5, cy + hh * 0.6);
            ctx.moveTo(cx + hw * 0.5, cy - hh * 0.6); ctx.lineTo(cx - hw * 0.5, cy + hh * 0.6);
          } else if (typeId === 'stable') {
            // Dollar sign circle
            ctx.moveTo(cx + Math.min(hw, hh) * 0.5, cy);
            ctx.arc(cx, cy, Math.min(hw, hh) * 0.5, 0, Math.PI * 2);
            ctx.moveTo(cx, cy - hh * 0.55); ctx.lineTo(cx, cy + hh * 0.55);
          } else if (typeId === 'leverage') {
            // Up arrow
            ctx.moveTo(cx, cy - hh * 0.6); ctx.lineTo(cx, cy + hh * 0.4);
            ctx.moveTo(cx - hw * 0.3, cy - hh * 0.1); ctx.lineTo(cx, cy - hh * 0.6);
            ctx.lineTo(cx + hw * 0.3, cy - hh * 0.1);
          } else if (typeId === 'rug') {
            // Trapdoor pattern
            ctx.moveTo(cx - hw * 0.6, cy); ctx.lineTo(cx + hw * 0.6, cy);
            ctx.moveTo(cx - hw * 0.5, cy - hh * 0.4); ctx.lineTo(cx, cy - hh * 0.5);
            ctx.lineTo(cx + hw * 0.5, cy - hh * 0.4);
            ctx.moveTo(cx - hw * 0.5, cy + hh * 0.4); ctx.lineTo(cx, cy + hh * 0.5);
            ctx.lineTo(cx + hw * 0.5, cy + hh * 0.4);
          } else if (typeId === 'whale') {
            // Whale silhouette arc + tail
            const wr = Math.min(hw, hh) * 0.55;
            for (let s = 0; s < 8; s++) {
              const a1 = Math.PI + (s / 8) * Math.PI;
              const a2 = Math.PI + ((s + 1) / 8) * Math.PI;
              ctx.moveTo(cx + Math.cos(a1) * wr * 1.2, cy + Math.sin(a1) * wr * 0.8);
              ctx.lineTo(cx + Math.cos(a2) * wr * 1.2, cy + Math.sin(a2) * wr * 0.8);
            }
            ctx.moveTo(cx - wr * 1.2, cy); ctx.lineTo(cx + wr * 0.8, cy);
            ctx.moveTo(cx + wr * 0.8, cy); ctx.lineTo(cx + hw * 0.7, cy - hh * 0.5);
          } else if (typeId === 'influencer') {
            // Megaphone
            ctx.moveTo(cx - hw * 0.3, cy - hh * 0.15); ctx.lineTo(cx + hw * 0.5, cy - hh * 0.5);
            ctx.lineTo(cx + hw * 0.5, cy + hh * 0.5); ctx.lineTo(cx - hw * 0.3, cy + hh * 0.15);
            ctx.closePath();
          } else if (typeId === 'diamond') {
            // Gem octagonal cut
            const dw = hw * 0.6, dh = hh * 0.7;
            ctx.moveTo(cx - dw * 0.5, cy - dh); ctx.lineTo(cx + dw * 0.5, cy - dh);
            ctx.lineTo(cx + dw, cy - dh * 0.3); ctx.lineTo(cx + dw, cy + dh * 0.1);
            ctx.lineTo(cx, cy + dh); ctx.lineTo(cx - dw, cy + dh * 0.1);
            ctx.lineTo(cx - dw, cy - dh * 0.3); ctx.closePath();
            ctx.moveTo(cx, cy - dh); ctx.lineTo(cx, cy + dh);
          } else if (typeId === 'indestructible') {
            // Dense grid
            for (let i = 1; i < 3; i++) {
              const tx = i / 3;
              ctx.moveTo(bx + bw * tx, by); ctx.lineTo(bx + bw * tx, by + bh);
              ctx.moveTo(bx, by + bh * tx); ctx.lineTo(bx + bw, by + bh * tx);
            }
          }
          ctx.stroke();
          ctx.globalAlpha = 1;
        };

        // ── Brick type data for the field ──
        const brickDefs: [string, number][] = [
          ['standard', 0x00ff88], ['tough', 0x00aaff], ['tough3', 0x8844ff],
          ['explosive', 0xff4400], ['drop', 0xffaa00], ['sentimentUp', 0x00ff44],
          ['sentimentDown', 0xff2222], ['hazard', 0xff0066], ['fomo', 0x44ff44],
          ['stable', 0x22cc88], ['leverage', 0xff8800], ['rug', 0x9933ff],
          ['whale', 0x0066cc], ['influencer', 0xff44cc], ['diamond', 0x88eeff],
          ['indestructible', 0x444444],
        ];

        // ── Brick field — real game proportions (50×18 game units, 8 cols) ──
        const brickW = 50 * sx;
        const brickH = 18 * sy;
        const brickGapX = 4 * sx;
        const cols = 8;
        const gridW = cols * brickW + (cols - 1) * brickGapX;
        const gridX0 = (W - gridW) / 2;
        const rowH = 22 * sy;

        // Layout: brick type indices, -1 = empty
        // Pattern: scattered half-destroyed field, showcasing different brick types
        const S=0, T=1, H2=2, E=3, D=4, U=5, R=6, Z=7, F=8, C=9, L=10, G=11, Wh=12, N=13, M=14, I=15;
        const _=-1;
        const menuLayout: number[][] = [
          [ _, S, T, _, M, _, E, _],
          [ U, _, _, Wh, _, D, _, R],
          [ _, H2, _, _, _, _, L, _],
          [ _, _, G, _, _, N, _, _],
          [ Z, _, _, F, C, _, _, I],
          [ _, T, _, _, _, _, S, _],
          [ _, _, E, _, _, H2, _, _],
        ];

        const fieldTop = 38 * sy;
        for (let row = 0; row < menuLayout.length; row++) {
          for (let col = 0; col < cols; col++) {
            const idx = menuLayout[row][col];
            if (idx < 0) continue;
            const bx = gridX0 + col * (brickW + brickGapX);
            const by = fieldTop + row * rowH;
            const floatY = Math.sin(t * 0.7 + col * 0.9 + row * 1.1) * 1.5 * sy;
            const alpha = 0.4 + Math.sin(t * 0.4 + col * 0.5 + row * 0.8) * 0.08;
            const [typeId, color] = brickDefs[idx];
            drawBrick(bx, by + floatY, brickW, brickH, color, typeId, alpha);
          }
        }

        // ── Title — dark scrim behind so it doesn't fight bricks ──
        const titleY = fieldTop + menuLayout.length * rowH * 0.45;
        const titleSize = Math.round(80 * sy);
        // Scrim: gradient fade behind title so it doesn't look like a rectangle
        const scrimTop = titleY - titleSize * 0.8;
        const scrimBot = titleY + titleSize * 0.8;
        const scrimGrad = ctx.createLinearGradient(0, scrimTop, 0, scrimBot);
        scrimGrad.addColorStop(0, 'rgba(0, 3, 2, 0)');
        scrimGrad.addColorStop(0.25, 'rgba(0, 3, 2, 0.8)');
        scrimGrad.addColorStop(0.5, 'rgba(0, 3, 2, 0.9)');
        scrimGrad.addColorStop(0.75, 'rgba(0, 3, 2, 0.8)');
        scrimGrad.addColorStop(1, 'rgba(0, 3, 2, 0)');
        ctx.fillStyle = scrimGrad;
        ctx.fillRect(0, scrimTop, W, scrimBot - scrimTop);
        ctx.font = `bold ${titleSize}px "Courier New", monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#003322';
        ctx.fillText('REKTANOID', centerX, titleY);

        // ── Subtitle ──
        let y = fieldTop + menuLayout.length * rowH + 22 * sy;
        const subSize = Math.round(20 * sy);
        ctx.font = `bold ${subSize}px "Courier New", monospace`;
        ctx.fillStyle = '#226688';
        ctx.fillText('BREAK BLOCKS. PUMP BAGS. GET REKT.', centerX, y);

        // ── NFA line ──
        y += subSize * 2.2;
        const nfaSize = Math.round(14 * sy);
        ctx.font = `${nfaSize}px "Courier New", monospace`;
        ctx.fillStyle = '#556677';
        ctx.fillText('NFA \u2022 DYOR \u2022 WAGMI', centerX, y);

        // ── Decorative paddle + bouncing ball ──
        y += nfaSize * 3;
        const paddleW = 70 * sx;
        const paddleH = 8 * sy;
        const ballRad = 5 * sy;
        ctx.fillStyle = '#153322';
        ctx.fillRect(centerX - paddleW / 2, y, paddleW, paddleH);
        ctx.strokeStyle = '#1a4433';
        ctx.lineWidth = 1;
        ctx.strokeRect(centerX - paddleW / 2, y, paddleW, paddleH);
        const ballBounceY = y - 14 * sy - Math.abs(Math.sin(t * 2.5)) * 28 * sy;
        const ballBounceX = centerX + Math.sin(t * 1.3) * 35 * sx;
        ctx.beginPath();
        ctx.arc(ballBounceX, ballBounceY, ballRad, 0, Math.PI * 2);
        ctx.fillStyle = '#1a4433';
        ctx.fill();
        for (let i = 1; i <= 3; i++) {
          const trailT = t - i * 0.06;
          const trailY2 = y - 14 * sy - Math.abs(Math.sin(trailT * 2.5)) * 28 * sy;
          const trailX2 = centerX + Math.sin(trailT * 1.3) * 35 * sx;
          ctx.globalAlpha = 0.15 / i;
          ctx.beginPath();
          ctx.arc(trailX2, trailY2, ballRad * (1 - i * 0.15), 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1;

        // ── Divider ──
        y += paddleH + 28 * sy;
        ctx.strokeStyle = '#2a4444';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(W * 0.1, y);
        ctx.lineTo(W * 0.9, y);
        ctx.stroke();

        // ── Controls ──
        y += 24 * sy;
        const ctrlSize = Math.round(14 * sy);
        ctx.font = `${ctrlSize}px "Courier New", monospace`;
        ctx.fillStyle = '#556677';
        ctx.fillText('Arrow keys / Mouse to move', centerX, y);
        y += ctrlSize * 1.6;
        ctx.fillText('Space / Click to launch', centerX, y);

        // ── SELECT LEVERAGE ──
        y += ctrlSize * 4.5;
        const levSize = Math.round(18 * sy);
        ctx.font = `bold ${levSize}px "Courier New", monospace`;
        ctx.fillStyle = '#446677';
        ctx.fillText('SELECT LEVERAGE', centerX, y);

        // ── Risk buttons ──
        y += levSize * 4.5;
        const profiles = screen.riskProfiles;
        const btnW = 115 * sx;
        const btnH = 70 * sy;
        const gap = 18 * sx;
        const totalBtnW = profiles.length * btnW + (profiles.length - 1) * gap;
        let bx2 = (W - totalBtnW) / 2;

        this.riskButtonRects = [];
        for (let i = 0; i < profiles.length; i++) {
          const p = profiles[i];
          const isSelected = p.id === this.selectedRiskId;
          // Border/text: selected ~30%, unselected ~20%
          // Bloom threshold is 0.03 so even 30% of #ffaa00 = #4c3300 will bloom slightly
          const dimMult = isSelected ? 0.30 : 0.20;
          const dimColor = this.dimColor(p.color, dimMult);
          const nameColor = this.dimColor(p.color, isSelected ? 0.35 : 0.25);

          const gameX = bx2 / sx;
          const gameY = (y - btnH / 2) / sy;
          const gameW = btnW / sx;
          const gameH = btnH / sy;
          this.riskButtonRects.push({ id: p.id, gx: gameX, gy: gameY, gw: gameW, gh: gameH });

          const bxc = bx2;
          const byc = y - btnH / 2;

          // Button fill — barely visible tint
          ctx.fillStyle = isSelected ? this.dimColor(p.color, 0.04) : '#040806';
          ctx.fillRect(bxc, byc, btnW, btnH);

          // Outer border
          ctx.strokeStyle = dimColor;
          ctx.lineWidth = (isSelected ? 2.5 : 1) * sy;
          ctx.strokeRect(bxc + 1, byc + 1, btnW - 2, btnH - 2);

          // Selected indicator
          if (isSelected) {
            ctx.fillStyle = dimColor;
            ctx.font = `${Math.round(14 * sy)}px "Courier New", monospace`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('\u25BC', bxc + btnW / 2, byc - 8 * sy);
          }

          // Label (e.g. "1x")
          const lblSize = Math.round(30 * sy);
          ctx.font = `bold ${lblSize}px "Courier New", monospace`;
          ctx.fillStyle = dimColor;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(p.label, bxc + btnW / 2, byc + btnH * 0.32);

          // Name (e.g. "Spot")
          const nameSize = Math.round(15 * sy);
          ctx.font = `${nameSize}px "Courier New", monospace`;
          ctx.fillStyle = nameColor;
          ctx.fillText(p.name, bxc + btnW / 2, byc + btnH * 0.7);

          bx2 += btnW + gap;
        }

        // Risk description
        y += btnH / 2 + 35 * sy;
        const descSize = Math.round(16 * sy);
        ctx.font = `${descSize}px "Courier New", monospace`;
        ctx.fillStyle = '#556677';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const selectedProfile = profiles.find(p => p.id === this.selectedRiskId);
        if (selectedProfile) {
          ctx.fillText(selectedProfile.description, centerX, y);
        }

        // ── APE IN prompt (pulsing) ──
        y += descSize * 4.5;
        const apeSize = Math.round(26 * sy);
        const pulse = 0.6 + 0.3 * Math.sin(now * 0.004);
        ctx.globalAlpha = pulse;
        ctx.font = `bold ${apeSize}px "Courier New", monospace`;
        ctx.fillStyle = '#665522';
        ctx.fillText('APE IN (SPACE / CLICK)', centerX, y);
        ctx.globalAlpha = 1;

        // ── Studio logo at the bottom ──
        if (this.logoLoaded && this.logoImg) {
          const logoH = 50 * sy;
          const logoAspect = this.logoImg.naturalWidth / this.logoImg.naturalHeight;
          const logoW = logoH * logoAspect;
          const logoX = (W - logoW) / 2;
          const logoY = H - logoH - 18 * sy;
          ctx.globalAlpha = 0.3;
          ctx.drawImage(this.logoImg, logoX, logoY, logoW, logoH);
          ctx.globalAlpha = 1;
        }
        break;
      }

      case 'stage-intro': {
        ctx.fillStyle = 'rgba(0, 4, 6, 0.6)';
        ctx.fillRect(0, 0, W, H);

        const centerX = W / 2;
        const centerY = H * 0.42;
        const maxTextW = W - 40 * sx;

        // Level name
        const nameSize = Math.round(52 * sy);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#006644';
        fitText(ctx, screen.name, centerX, centerY, maxTextW, nameSize, true);

        // Flavor text
        const flavorSize = Math.round(22 * sy);
        ctx.fillStyle = '#226688';
        fitText(ctx, screen.flavorText, centerX, centerY + nameSize * 0.9, maxTextW, flavorSize, false);

        // Boss info
        if (screen.bossInfo) {
          const bossSize = Math.round(18 * sy);
          ctx.fillStyle = '#664422';
          fitText(ctx, screen.bossInfo, centerX, centerY + nameSize * 0.9 + flavorSize * 1.8, maxTextW, bossSize, true);
        }
        break;
      }

      case 'paused': {
        ctx.fillStyle = 'rgba(0, 4, 6, 0.75)';
        ctx.fillRect(0, 0, W, H);

        const centerX = W / 2;
        const centerY = H * 0.42;

        const pauseSize = Math.round(52 * sy);
        const maxTextW = W - 40 * sx;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#226688';
        fitText(ctx, 'PAUSED', centerX, centerY, maxTextW, pauseSize, true);

        const hintSize = Math.round(22 * sy);
        ctx.fillStyle = '#556677';
        fitText(ctx, 'Press ESC to resume', centerX, centerY + pauseSize * 1.0, maxTextW, hintSize, false);
        break;
      }

      case 'game-over': {
        ctx.fillStyle = 'rgba(6, 0, 0, 0.85)';
        ctx.fillRect(0, 0, W, H);

        const centerX = W / 2;
        let y = H * 0.30;
        const maxTextW = W - 40 * sx;

        // LIQUIDATED — muted red
        const titleSize = Math.round(64 * sy);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#661111';
        fitText(ctx, 'LIQUIDATED', centerX, y, maxTextW, titleSize, true);

        // BAGS LIQUIDATED
        y += titleSize * 0.85;
        const subSize = Math.round(22 * sy);
        ctx.fillStyle = '#552222';
        fitText(ctx, 'BAGS LIQUIDATED', centerX, y, maxTextW, subSize, true);

        // Bag value
        y += subSize * 1.8;
        const valSize = Math.round(36 * sy);
        ctx.fillStyle = '#665522';
        fitText(ctx, '$' + screen.bagValue, centerX, y, maxTextW, valSize, true);

        // -99.7% NGMI
        y += valSize * 1.2;
        const ngmiSize = Math.round(20 * sy);
        ctx.fillStyle = '#552222';
        fitText(ctx, '-99.7% NGMI', centerX, y, maxTextW, ngmiSize, true);

        // Stage info
        y += ngmiSize * 1.8;
        const stageSize = Math.round(18 * sy);
        ctx.fillStyle = '#556666';
        fitText(ctx, screen.stageText, centerX, y, maxTextW, stageSize, false);

        // APE BACK IN prompt
        y += stageSize * 3;
        const apeSize = Math.round(22 * sy);
        const pulse = 0.5 + 0.3 * Math.sin(now * 0.004);
        ctx.globalAlpha = pulse;
        ctx.fillStyle = '#226688';
        fitText(ctx, 'PRESS SPACE TO APE BACK IN', centerX, y, maxTextW, apeSize, true);
        ctx.globalAlpha = 1;
        break;
      }

      case 'victory': {
        ctx.fillStyle = 'rgba(6, 4, 0, 0.85)';
        ctx.fillRect(0, 0, W, H);

        const centerX = W / 2;
        let y = H * 0.25;
        const maxTextW = W - 40 * sx;

        // CYCLE TOP CALLED
        const titleSize = Math.round(56 * sy);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#665522';
        fitText(ctx, 'CYCLE TOP CALLED', centerX, y, maxTextW, titleSize, true);

        // BAGS MOONED
        y += titleSize * 0.85;
        const subSize = Math.round(22 * sy);
        ctx.fillStyle = '#006644';
        fitText(ctx, 'BAGS MOONED', centerX, y, maxTextW, subSize, true);

        // Moon value
        y += subSize * 1.8;
        const valSize = Math.round(40 * sy);
        ctx.fillStyle = '#006644';
        fitText(ctx, '$' + screen.moonValue, centerX, y, maxTextW, valSize, true);

        // Unrealized gains
        y += valSize * 1.2;
        const gainsSize = Math.round(22 * sy);
        ctx.fillStyle = '#005533';
        fitText(ctx, '+' + screen.returnPct + '% UNREALIZED GAINS', centerX, y, maxTextW, gainsSize, true);

        // Risk mode
        y += gainsSize * 1.8;
        const riskSize = Math.round(18 * sy);
        ctx.fillStyle = this.dimColor(screen.riskColor, 0.3);
        fitText(ctx, screen.riskLabel + ' ' + screen.riskName + ' MODE', centerX, y, maxTextW, riskSize, true);

        // APE BACK IN
        y += riskSize * 3;
        const apeSize = Math.round(22 * sy);
        const pulse = 0.6 + 0.3 * Math.sin(now * 0.004);
        ctx.globalAlpha = pulse;
        ctx.fillStyle = '#226688';
        fitText(ctx, 'PRESS SPACE TO APE BACK IN', centerX, y, maxTextW, apeSize, true);
        ctx.globalAlpha = 1;
        break;
      }
    }

    ctx.restore();
  }

  // ── Render ──
  render() {
    this.renderHudCanvas();
    this.crt.uniforms.time.value = performance.now() * 0.001;
    this.composer.render();
  }

  // ── Resize ──
  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const scale = Math.min(w / GAME_WIDTH, h / GAME_HEIGHT);
    const cw = GAME_WIDTH * scale;
    const ch = GAME_HEIGHT * scale;

    // Render at actual displayed pixel resolution for crisp CRT
    const pr = Math.min(window.devicePixelRatio, 2);
    const renderW = Math.round(cw * pr);
    const renderH = Math.round(ch * pr);
    this.webgl.setSize(renderW, renderH, false);
    this.composer.setSize(renderW, renderH);
    this.bloom.resolution.set(Math.floor(renderW/2), Math.floor(renderH/2));
    this.crt.uniforms.resolution.value.set(renderW, renderH);

    const canvas = this.webgl.domElement;
    canvas.style.width = `${cw}px`;
    canvas.style.height = `${ch}px`;
    canvas.style.position = 'absolute';
    canvas.style.left = `${(w - cw) / 2}px`;
    canvas.style.top = `${(h - ch) / 2}px`;
    canvas.style.zIndex = '1';

    // Overlay (still HTML for menu/pause/gameover — sits on top of CRT canvas)
    this.overlayEl.style.width = `${cw}px`;
    this.overlayEl.style.height = `${ch}px`;
    this.overlayEl.style.left = `${(w - cw) / 2}px`;
    this.overlayEl.style.top = `${(h - ch) / 2}px`;
  }

  /** Convert screen mouse coords to game coords */
  screenToGame(clientX: number, clientY: number): [number, number] {
    const rect = this.webgl.domElement.getBoundingClientRect();
    const gx = ((clientX - rect.left) / rect.width) * GAME_WIDTH;
    const gy = ((clientY - rect.top) / rect.height) * GAME_HEIGHT;
    return [gx, gy];
  }

  remove(obj: THREE.Object3D) {
    obj.parent?.remove(obj);
    obj.traverse((child: THREE.Object3D) => {
      if (child instanceof THREE.Mesh || child instanceof THREE.LineSegments || child instanceof THREE.Line || child instanceof THREE.Points) {
        child.geometry.dispose();
      }
    });
  }
}

interface Particle {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  life: number; decay: number;
  color: number; size: number;
  hot?: boolean; // renders with glowing core + soft falloff like the ball
}
