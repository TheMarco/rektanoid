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

/** Ensure |vy| >= speed * minRatio. Uses speed-magnitude ratio (not sum ratio). */
export function enforceMinVertical(vx: number, vy: number, minRatio: number, speed: number): { vx: number; vy: number } {
  const minVyMag = speed * minRatio;
  if (Math.abs(vy) < minVyMag) {
    const vySign = vy <= 0 ? -1 : 1;
    const newVy = vySign * minVyMag;
    const newVx = Math.sign(vx || 1) * Math.sqrt(Math.max(0, speed * speed - newVy * newVy));
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
