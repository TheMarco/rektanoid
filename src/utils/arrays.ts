/** Flatten a 2D grid into { col, row, value } entries, skipping nulls */
export function gridEntries<T>(grid: (T | null)[][]): { col: number; row: number; value: T }[] {
  const results: { col: number; row: number; value: T }[] = [];
  for (let row = 0; row < grid.length; row++) {
    for (let col = 0; col < grid[row].length; col++) {
      const v = grid[row][col];
      if (v !== null) results.push({ col, row, value: v });
    }
  }
  return results;
}

/** Shuffle array in place (Fisher-Yates) */
export function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
