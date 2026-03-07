// Core palette
export const COL_BG = 0x0a0a0a;
export const COL_BG_DARK = 0x050505;

// Bullish / positive
export const COL_GREEN = 0x00ff88;
export const COL_GREEN_BRIGHT = 0x00ff44;
export const COL_GREEN_DIM = 0x006633;

// Bearish / danger
export const COL_RED = 0xff2222;
export const COL_RED_BRIGHT = 0xff4444;
export const COL_RED_DIM = 0x661111;

// Premium / score
export const COL_GOLD = 0xffaa00;
export const COL_GOLD_BRIGHT = 0xffcc44;
export const COL_AMBER = 0xff8800;

// Tech accent
export const COL_CYAN = 0x44ddff;
export const COL_CYAN_DIM = 0x226688;

// Neutral
export const COL_WHITE = 0xffffff;
export const COL_GRAY = 0x888888;
export const COL_GRAY_DIM = 0x333333;

// Specialty
export const COL_PURPLE = 0x8844ff;
export const COL_BLUE = 0x00aaff;

export function hexToComponents(hex: number): [number, number, number] {
  return [(hex >> 16) & 0xff, (hex >> 8) & 0xff, hex & 0xff];
}

export function dimColor(hex: number, factor: number): number {
  const r = Math.floor(((hex >> 16) & 0xff) * factor);
  const g = Math.floor(((hex >> 8) & 0xff) * factor);
  const b = Math.floor((hex & 0xff) * factor);
  return (r << 16) | (g << 8) | b;
}
