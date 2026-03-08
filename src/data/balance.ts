// ── Paddle ──
export const PADDLE_SPEED = 500;
export const PADDLE_WIDTH = 80;
export const PADDLE_HEIGHT = 12;
export const PADDLE_Y_OFFSET = 110; // from bottom (above HUD bar)
export const PADDLE_WIDTH_EXPANDED = 120;
export const PADDLE_WIDTH_SHRUNK = 48;

// ── Ball ──
export const BALL_RADIUS = 3;
export const BALL_BASE_SPEED = 420;
export const BALL_SPEED_CAP = 700;
export const BALL_SPEED_INCREMENT = 5; // per brick hit
export const BALL_MIN_VERTICAL_RATIO = 0.3; // prevent flat angles
export const BALL_LAUNCH_ANGLE_DEG = -75; // degrees from horizontal

// ── Lives ──
export const STARTING_LIVES = 3;
export const MAX_LIVES = 5;

// ── Combo ──
export const COMBO_WINDOW_MS = 3000;
export const COMBO_DECAY_MS = 1000;

// ── Score ──
export const SCORE_BRICK_BASE = 10;
export const SCORE_COMBO_MULTIPLIER = 0.5; // added per combo level
export const SCORE_LEVEL_CLEAR_BONUS = 500;
export const SCORE_LIFE_PRESERVATION_BONUS = 200;

// ── Powerups ──
export const POWERUP_FALL_SPEED = 120;
export const POWERUP_BASE_DROP_CHANCE = 0.2;
export const POWERUP_DEFAULT_DURATION = 8000;

// ── Sentiment ──
export const SENTIMENT_MAX = 100;
export const SENTIMENT_BULL_THRESHOLD = 65;
export const SENTIMENT_BEAR_THRESHOLD = 35;
export const SENTIMENT_START = 50;
export const SENTIMENT_COMBO_BOOST = 2;
export const SENTIMENT_BULL_SCORE_BONUS = 1.5;

// ── Bricks ──
export const BRICK_COLS = 8;
export const BRICK_ROWS = 8;
export const BRICK_WIDTH = 50;
export const BRICK_HEIGHT = 18;
export const BRICK_PADDING = 4;
export const BRICK_OFFSET_X = 9;
export const BRICK_OFFSET_Y = 70;

// ── Laser ──
export const LASER_SPEED = 500;
export const LASER_FIRE_RATE = 300; // ms between shots
export const LASER_DURATION = 8000;

// ── Shield ──
export const SHIELD_DURATION = 10000;
