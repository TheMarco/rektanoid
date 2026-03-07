/** Pick from weighted entries. weights don't need to sum to 1. */
export function weightedPick<T>(items: T[], weights: number[]): T {
  const total = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i];
    if (r <= 0) return items[i];
  }
  return items[items.length - 1];
}

export function randomBetween(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

export function chance(probability: number): boolean {
  return Math.random() < probability;
}
