export function weightedRandomPick<T>(
  items: T[],
  getWeight: (item: T) => number,
  rng: () => number = Math.random
): T | null {
  const total = items.reduce((sum, item) => sum + Math.max(0, getWeight(item)), 0);
  if (total <= 0) return null;

  let roll = rng() * total;
  for (const item of items) {
    roll -= Math.max(0, getWeight(item));
    if (roll <= 0) return item;
  }
  return items[items.length - 1] ?? null;
}
