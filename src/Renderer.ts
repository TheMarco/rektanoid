import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { GAME_WIDTH, GAME_HEIGHT } from './constants';
import { MODELS } from 'retrozone';
import type { BrickDefinition } from './types/BrickDefinition';

const HW = GAME_WIDTH / 2;
const HH = GAME_HEIGHT / 2;

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
  { bg: 0x010a06, fog: 0x021a0c, accent: 0x00ff88, fogDensity: 0.0017, bloomStrength: 0.35, bloomRadius: 0.40, exposure: 1.15 }, // Genesis Block
  { bg: 0x010a06, fog: 0x021a0c, accent: 0x00ff88, fogDensity: 0.0016, bloomStrength: 0.37, bloomRadius: 0.42, exposure: 1.15 }, // Bull Trap
  { bg: 0x0a0204, fog: 0x1a0508, accent: 0xff2222, fogDensity: 0.00195, bloomStrength: 0.40, bloomRadius: 0.44, exposure: 1.12 }, // Liquidation
  { bg: 0x0a0800, fog: 0x1a1000, accent: 0xffaa00, fogDensity: 0.00175, bloomStrength: 0.38, bloomRadius: 0.42, exposure: 1.18 }, // Pump & Dump
  { bg: 0x020810, fog: 0x041420, accent: 0x44ddff, fogDensity: 0.00185, bloomStrength: 0.38, bloomRadius: 0.42, exposure: 1.16 }, // Diamond
  { bg: 0x0a0204, fog: 0x1a0508, accent: 0xff2222, fogDensity: 0.002, bloomStrength: 0.42, bloomRadius: 0.46, exposure: 1.10 }, // Bear Market
  { bg: 0x060804, fog: 0x0c1008, accent: 0xffaa00, fogDensity: 0.0017, bloomStrength: 0.36, bloomRadius: 0.40, exposure: 1.15 }, // Halving
  { bg: 0x020810, fog: 0x041420, accent: 0x44ddff, fogDensity: 0.0019, bloomStrength: 0.40, bloomRadius: 0.44, exposure: 1.14 }, // DeFi Maze
  { bg: 0x0a0204, fog: 0x1a0508, accent: 0xff2222, fogDensity: 0.0021, bloomStrength: 0.44, bloomRadius: 0.46, exposure: 1.10 }, // Margin Call
  { bg: 0x060210, fog: 0x0c0420, accent: 0x8844ff, fogDensity: 0.0018, bloomStrength: 0.42, bloomRadius: 0.44, exposure: 1.17 }, // Flippening
];

export class Renderer {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  webgl: THREE.WebGLRenderer;
  composer: EffectComposer;
  bloom: UnrealBloomPass;
  bgGroup: THREE.Group;
  fxGroup: THREE.Group;
  private container: HTMLElement;
  private hudEl: HTMLElement;
  private overlayEl: HTMLElement;
  private calloutsEl: HTMLElement;
  private tickerEl: HTMLElement;
  private particles: Particle[] = [];

  constructor(container: HTMLElement) {
    this.container = container;

    // Scene
    const initialTheme = LEVEL_THEMES[0];
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(initialTheme.bg);
    this.scene.fog = new THREE.FogExp2(initialTheme.fog, initialTheme.fogDensity);

    // Camera: see 800x600 area at z=0
    const fov = 60;
    const aspect = GAME_WIDTH / GAME_HEIGHT;
    this.camera = new THREE.PerspectiveCamera(fov, aspect, 1, 2000);
    const camZ = HH / Math.tan((fov / 2) * Math.PI / 180);
    this.camera.position.set(0, 0, camZ);
    this.camera.lookAt(0, 0, 0);

    // WebGL renderer
    this.webgl = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.webgl.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.webgl.setSize(GAME_WIDTH, GAME_HEIGHT, false);
    this.webgl.toneMapping = THREE.ACESFilmicToneMapping;
    this.webgl.toneMappingExposure = initialTheme.exposure;
    container.appendChild(this.webgl.domElement);

    // Post-processing
    this.composer = new EffectComposer(this.webgl);
    this.composer.setSize(GAME_WIDTH, GAME_HEIGHT);
    this.composer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(
      new THREE.Vector2(GAME_WIDTH, GAME_HEIGHT),
      initialTheme.bloomStrength,  // strength
      initialTheme.bloomRadius, // radius
      0.03,  // threshold
    );
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    // Groups
    this.bgGroup = new THREE.Group();
    this.bgGroup.position.z = -5;
    this.scene.add(this.bgGroup);
    this.fxGroup = new THREE.Group();
    this.scene.add(this.fxGroup);

    // HUD & overlay
    this.hudEl = document.getElementById('hud')!;
    this.overlayEl = document.getElementById('overlay')!;
    this.calloutsEl = document.getElementById('callouts')!;
    this.tickerEl = document.getElementById('ticker-content')!;
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

  updateBrickDamage(group: THREE.Group, hp: number, maxHp: number) {
    const ratio = hp / maxHp;
    const core = group.children[0] as THREE.LineSegments;
    const mat = core.material as THREE.LineBasicMaterial;
    mat.opacity = 0.4 + ratio * 0.5;
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
    outerGlow.scale.setScalar(1.4);
    outerGlow.renderOrder = 5;
    group.add(outerGlow);

    return group;
  }

  makeBallTrail(): THREE.Mesh {
    const maxPts = 60;
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

    const maxWidth = 8; // widest point near the ball

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

  // ── RetroZone model → Three.js ──
  modelToMesh(modelName: string, color: number, scale: number): THREE.Group {
    const model = MODELS[modelName];
    if (!model) return new THREE.Group();

    const positions: number[] = [];
    for (const line of model) {
      positions.push(line.from[0], line.from[1], line.from[2] || 0);
      positions.push(line.to[0], line.to[1], line.to[2] || 0);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    const thickGeo = thickenGeo(geo, 0.07, 2);

    const group = new THREE.Group();
    group.scale.setScalar(scale);

    const core = new THREE.LineSegments(thickGeo,
      new THREE.LineBasicMaterial({
        color, transparent: true, opacity: 0.7,
        fog: false, toneMapped: false,
      }));
    core.renderOrder = 5;
    group.add(core);

    const glow = new THREE.LineSegments(thickGeo.clone(),
      new THREE.LineBasicMaterial({
        color, transparent: true, opacity: 0.2,
        blending: THREE.AdditiveBlending,
        depthTest: false, depthWrite: false,
        fog: false, toneMapped: false,
      }));
    glow.scale.setScalar(1.05);
    glow.renderOrder = 4;
    group.add(glow);

    return group;
  }

  // ── Effects ──

  burst(gx: number, gy: number, color: number, count: number = 24) {
    const [wx, wy] = [gx - HW, HH - gy];
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + Math.random() * 0.5;
      const speed = 120 + Math.random() * 200;
      this.particles.push({
        x: wx, y: wy, z: 0,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        vz: (Math.random() - 0.5) * 80,
        life: 1,
        decay: 1.0 + Math.random() * 1.2,
        color,
        size: 3 + Math.random() * 5,
      });
    }
  }

  shards(gx: number, gy: number, color: number) {
    this.burst(gx, gy, color, 35);
    this.flash(color, 0.3);
  }

  flash(color: number, intensity: number = 1) {
    const flashMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(GAME_WIDTH * 2, GAME_HEIGHT * 2),
      new THREE.MeshBasicMaterial({
        color, transparent: true, opacity: intensity * 0.3,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        depthTest: false,
      }));
    flashMesh.position.z = 10;
    flashMesh.renderOrder = 999;
    this.fxGroup.add(flashMesh);
    const start = performance.now();
    const update = () => {
      const t = (performance.now() - start) / 300;
      if (t >= 1) { this.fxGroup.remove(flashMesh); flashMesh.geometry.dispose(); return; }
      (flashMesh.material as THREE.MeshBasicMaterial).opacity = intensity * 0.3 * (1 - t);
      requestAnimationFrame(update);
    };
    requestAnimationFrame(update);
  }

  // ── Particles update ──
  updateParticles(dt: number) {
    // Remove dead particles
    this.particles = this.particles.filter(p => p.life > 0);

    // Update living particles
    for (const p of this.particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      p.vy -= 60 * dt; // gravity
      p.life -= p.decay * dt;
    }

    // Rebuild particle mesh
    this.rebuildParticleMesh();
  }

  private particleMesh: THREE.Points | null = null;

  private rebuildParticleMesh() {
    if (this.particleMesh) {
      this.fxGroup.remove(this.particleMesh);
      this.particleMesh.geometry.dispose();
    }

    if (this.particles.length === 0) {
      this.particleMesh = null;
      return;
    }

    const positions = new Float32Array(this.particles.length * 3);
    const colors = new Float32Array(this.particles.length * 3);
    const sizes = new Float32Array(this.particles.length);
    const color = new THREE.Color();

    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      positions[i * 3] = p.x;
      positions[i * 3 + 1] = p.y;
      positions[i * 3 + 2] = p.z;
      color.setHex(p.color);
      colors[i * 3] = color.r * p.life;
      colors[i * 3 + 1] = color.g * p.life;
      colors[i * 3 + 2] = color.b * p.life;
      sizes[i] = p.size * p.life;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geo.setAttribute('size', new THREE.Float32BufferAttribute(sizes, 1));

    this.particleMesh = new THREE.Points(geo,
      new THREE.PointsMaterial({
        size: 3,
        vertexColors: true,
        transparent: true,
        opacity: 0.8,
        blending: THREE.AdditiveBlending,
        depthTest: false,
        sizeAttenuation: true,
      }));
    this.particleMesh.renderOrder = 100;
    this.fxGroup.add(this.particleMesh);
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

  // ── HUD ──
  // ── Crypto ticker tape ──
  private initTicker() {
    // Show fake data immediately, then replace with real data
    this.renderTickerData(this.fakeTicker());
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

  private renderTickerData(data: { sym: string; price: number; pct: number }[]) {
    let html = '';
    for (let rep = 0; rep < 2; rep++) {
      for (const c of data) {
        const cls = c.pct >= 0 ? 'up' : 'down';
        const sign = c.pct >= 0 ? '+' : '';
        const priceStr = c.price >= 1 ? c.price.toFixed(2) : c.price.toFixed(4);
        html += `<span class="${cls}">${c.sym} $${priceStr} ${sign}${c.pct.toFixed(1)}%</span>`;
        html += `<span class="sep">|</span>`;
      }
    }
    this.tickerEl.innerHTML = html;
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
      if (data.length > 0) this.renderTickerData(data);
    } catch {
      // Keep fake data if fetch fails
    }
  }

  // ── Callout popups ──
  showCallout(gx: number, gy: number, text: string, color: string, size: number = 18) {
    const el = document.createElement('div');
    el.className = 'callout';
    el.textContent = text;
    el.style.color = color;
    el.style.fontSize = size + 'px';
    // Convert game coords to screen percentage
    const pctX = (gx / GAME_WIDTH) * 100;
    const pctY = (gy / GAME_HEIGHT) * 100;
    el.style.left = pctX + '%';
    el.style.top = pctY + '%';
    el.style.transform = 'translate(-50%, -50%)';
    this.calloutsEl.appendChild(el);
    setTimeout(() => el.remove(), 1200);
  }

  updateHUD(data: {
    score: number; lives: number; combo: number;
    sentiment: string; sentimentColor: string;
    stage: string; effects: string;
  }) {
    const bagValue = (data.score * 100 + 10000).toLocaleString();
    const pnl = data.score > 0 ? `+${(data.score * 0.8).toFixed(0)}%` : '0%';
    const pnlColor = data.score > 0 ? '#00ff88' : '#888';
    const hodlIcons = '&#9670;'.repeat(data.lives);
    const comboText = data.combo >= 5 ? `x${data.combo} MEGA PUMP`
      : data.combo >= 3 ? `x${data.combo} PUMP`
      : data.combo > 1 ? `x${data.combo}` : '';

    this.hudEl.innerHTML = `
      <div>
        <span style="color:#00ff88;font-size:15px">$${bagValue}</span>
        <span style="color:${pnlColor};font-size:11px">${pnl}</span>
        <span style="color:#44ddff">${hodlIcons}</span>
        ${comboText ? `<span style="color:#ffaa00">${comboText}</span>` : ''}
        <span style="color:${data.sentimentColor};font-size:11px">${data.sentiment}</span>
        ${data.effects ? `<span style="color:#44ddff;font-size:10px">${data.effects}</span>` : ''}
      </div>
      <div><span style="color:#334455;font-size:10px">${data.stage}</span></div>
    `;
  }

  showOverlay(html: string) {
    this.overlayEl.innerHTML = html;
    this.overlayEl.style.display = 'flex';
  }

  hideOverlay() {
    this.overlayEl.style.display = 'none';
  }

  // ── Render ──
  render() {
    this.composer.render();
  }

  // ── Resize ──
  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const scale = Math.min(w / GAME_WIDTH, h / GAME_HEIGHT);
    const cw = GAME_WIDTH * scale;
    const ch = GAME_HEIGHT * scale;

    const canvas = this.webgl.domElement;
    canvas.style.width = `${cw}px`;
    canvas.style.height = `${ch}px`;
    canvas.style.position = 'absolute';
    canvas.style.left = `${(w - cw) / 2}px`;
    canvas.style.top = `${(h - ch) / 2}px`;

    // Scale HUD/overlay to match
    this.hudEl.style.width = `${cw}px`;
    this.hudEl.style.left = `${(w - cw) / 2}px`;
    this.hudEl.style.bottom = `${(h - ch) / 2 + 5}px`;
    this.hudEl.style.fontSize = `${Math.max(11, scale * 13)}px`;

    this.overlayEl.style.width = `${cw}px`;
    this.overlayEl.style.height = `${ch}px`;
    this.overlayEl.style.left = `${(w - cw) / 2}px`;
    this.overlayEl.style.top = `${(h - ch) / 2}px`;

    this.calloutsEl.style.width = `${cw}px`;
    this.calloutsEl.style.height = `${ch}px`;
    this.calloutsEl.style.left = `${(w - cw) / 2}px`;
    this.calloutsEl.style.top = `${(h - ch) / 2}px`;

    const tickerContainer = this.tickerEl.parentElement!;
    tickerContainer.style.width = `${cw}px`;
    tickerContainer.style.left = `${(w - cw) / 2}px`;
    tickerContainer.style.top = `${(h - ch) / 2}px`;
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
}
