export function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function degToRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

export function radToDeg(rad: number): number {
  return (rad * 180) / Math.PI;
}

/** Ensure a velocity vector has at least `minRatio` vertical component */
export function enforceMinVertical(vx: number, vy: number, minRatio: number, speed: number): { vx: number; vy: number } {
  const absVy = Math.abs(vy);
  const absVx = Math.abs(vx);
  if (absVy / (absVx + absVy) < minRatio) {
    const sign = vy >= 0 ? 1 : -1;
    const newVy = sign * speed * minRatio;
    const newVx = Math.sign(vx) * Math.sqrt(speed * speed - newVy * newVy);
    return { vx: newVx, vy: newVy };
  }
  return { vx, vy };
}

/** Normalize a vector to a given magnitude */
export function normalize(vx: number, vy: number, mag: number): { vx: number; vy: number } {
  const len = Math.sqrt(vx * vx + vy * vy);
  if (len === 0) return { vx: 0, vy: -mag };
  return { vx: (vx / len) * mag, vy: (vy / len) * mag };
}
