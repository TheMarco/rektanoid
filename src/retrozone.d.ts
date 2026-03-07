declare module 'retrozone' {
  export class RetroDisplay {
    constructor(canvas: HTMLCanvasElement);
    setMode(mode: 'vector' | 'crt'): void;
    setPhosphorDecay(decay: number): void;
    destroy(): void;
  }

  export function createShaderOverlay(canvas: HTMLCanvasElement): any;

  interface ProjectionConfig {
    centerX: number;
    centerY: number;
    perspective?: number;
  }

  interface ProjectedLine {
    x1: number; y1: number;
    x2: number; y2: number;
    depth: number;
    scale: number;
  }

  interface ProjectedLineFlat {
    x1: number; y1: number;
    x2: number; y2: number;
  }

  interface ProjectionSystem {
    projectPoint(worldX: number, worldY: number, worldZ: number): { x: number; y: number; scale: number };
    getScale(worldZ: number): number;
    projectModel(lines: ModelLine[], worldX: number, worldY: number, worldZ: number, modelScale: number, rotation?: number): ProjectedLine[];
    projectModelFlat(lines: ModelLine[], screenX: number, screenY: number, modelScale: number, rotation?: number): ProjectedLineFlat[];
  }

  export function createProjection(config: ProjectionConfig): ProjectionSystem;

  interface ModelLine {
    from: number[];
    to: number[];
  }

  export const FIGHTER: ModelLine[];
  export const MOTH: ModelLine[];
  export const HORNET: ModelLine[];
  export const CROWN: ModelLine[];
  export const SPINNER: ModelLine[];
  export const BEETLE: ModelLine[];
  export const CRYSTAL: ModelLine[];
  export const JELLYFISH: ModelLine[];
  export const SPIDER: ModelLine[];
  export const WARSHIP: ModelLine[];
  export const BULLET: ModelLine[];
  export const DART: ModelLine[];
  export const MODELS: Record<string, ModelLine[]>;

  export function vectorText(text: string, x: number, y: number, scale?: number): { x1: number; y1: number; x2: number; y2: number }[];
  export function vectorTextWidth(text: string, scale?: number): number;

  interface GlowPass { width: number; alpha: number }

  export function drawGlowLine(
    graphics: any, x1: number, y1: number, x2: number, y2: number,
    color: number, mask?: boolean, passes?: GlowPass[]
  ): void;

  export function drawGlowCircle(
    graphics: any, x: number, y: number, radius: number,
    color: number, segments?: number, mask?: boolean
  ): void;

  export function drawGlowEllipse(
    graphics: any, x: number, y: number, rx: number, ry: number,
    color: number, rotation?: number, segments?: number, mask?: boolean
  ): void;

  export function drawGlowPolygon(
    graphics: any, points: { x: number; y: number }[],
    color: number, mask?: boolean
  ): void;

  export function drawGlowArc(
    graphics: any, x: number, y: number, rx: number, ry: number,
    color: number, rotation?: number, startAngle?: number, endAngle?: number, segments?: number
  ): void;

  export function drawGlowDiamond(
    graphics: any, cx: number, cy: number, size: number,
    color: number
  ): void;

  export function drawGlowDashedEllipse(
    graphics: any, cx: number, cy: number, rx: number, ry: number,
    color: number, rotation?: number, numDashes?: number, segments?: number
  ): void;

  export function drawGlowDashedLine(
    graphics: any, x1: number, y1: number, x2: number, y2: number,
    color: number, numDashes?: number
  ): void;

  export class ExplosionRenderer {
    constructor(options?: any);
    update(delta: number): void;
    render(graphics: any, color: number): void;
    isDone(): boolean;
  }
}
