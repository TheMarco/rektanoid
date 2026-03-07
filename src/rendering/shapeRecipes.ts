/**
 * Shape recipe definitions - the visual grammar layer.
 * Each recipe describes how to draw a reusable visual element.
 */

export interface ShapeRecipe {
  id: string;
  type: 'panel' | 'capsule' | 'ring' | 'chevron' | 'meter' | 'candlestick' | 'diamond';
}

// Panel with border and optional inner lines
export const RECIPE_PANEL: ShapeRecipe = { id: 'panel', type: 'panel' };

// Reinforced panel with double border
export const RECIPE_REINFORCED_PANEL: ShapeRecipe = { id: 'reinforced_panel', type: 'panel' };

// Pickup capsule shape
export const RECIPE_CAPSULE: ShapeRecipe = { id: 'capsule', type: 'capsule' };

// Ring/circle motif
export const RECIPE_RING: ShapeRecipe = { id: 'ring', type: 'ring' };

// Warning chevron
export const RECIPE_CHEVRON: ShapeRecipe = { id: 'chevron', type: 'chevron' };

// Meter frame with fill
export const RECIPE_METER: ShapeRecipe = { id: 'meter', type: 'meter' };

// Candlestick chart element
export const RECIPE_CANDLESTICK: ShapeRecipe = { id: 'candlestick', type: 'candlestick' };

// Diamond shape
export const RECIPE_DIAMOND: ShapeRecipe = { id: 'diamond', type: 'diamond' };
