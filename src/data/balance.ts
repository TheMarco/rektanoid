// ── Paddle ──
export const PADDLE_SPEED = 500;
export const PADDLE_WIDTH = 80;
export const PADDLE_HEIGHT = 12;
export const PADDLE_Y_OFFSET = 110; // from bottom (above HUD bar)
export const PADDLE_WIDTH_EXPANDED = 120;
export const PADDLE_WIDTH_SHRUNK = 48;

// ── Ball ──
export const BALL_RADIUS = 4.5;
export const BALL_BASE_SPEED = 420;
export const BALL_MIN_SPEED = 360;
export const BALL_SPEED_CAP = 640;
export const BALL_SPEED_INCREMENT = 5; // legacy — kept for powerup effects
export const BALL_SPEED_TIER_EVERY_HITS = 12;
export const BALL_SPEED_TIER_ADD = 18;
export const BALL_MIN_VERTICAL_RATIO = 0.53; // prevent flat angles
export const BALL_LAUNCH_ANGLE_DEG = -75; // degrees from horizontal (kept for re-launch safety)
export const BALL_SUBSTEPS = 4;

// ── Paddle bounce ──
export const PADDLE_MAX_BOUNCE_ANGLE_DEG = 58;
export const PADDLE_CURVE_POWER = 1.15;
export const PADDLE_VELOCITY_INFLUENCE = 0.18;

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

// ── Rug-Pull Collapse ──
export const RUG_UNSTABLE_DURATION = 0.65;  // seconds before unstable bricks start falling
export const RUG_DEFAULT_RADIUS = 90;       // default collapse radius (overridden per stage)
export const RUG_MAX_FALLING = 6;           // max simultaneously falling bricks from rug pulls

// ── Liquidation Lanes ──
export const LIQ_LANE_TELEGRAPH_MS = 1800;  // warning duration before strike
export const LIQ_LANE_STRIKE_MS = 300;      // strike active duration
export const LIQ_LANE_WIDTH = 54;           // lane width in game units (≈ 1 brick column)
export const LIQ_LANE_STRIKE_SPEED = 900;   // downward speed of strike bolt

// ── Sell Walls ──
export const SELL_WALL_TELEGRAPH_MS = 1000;   // warning flash before drop
export const SELL_WALL_DROP_PAUSE_MS = 2500;  // pause between successive drops
export const SELL_WALL_DANGER_Y = 650;        // if wall reaches this y, punish player
