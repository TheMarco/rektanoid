import * as THREE from 'three';
import { Renderer } from './Renderer';
import { animateBackground as animateBackgroundFx, buildBackground } from './Background';
import type { BackgroundRuntimeControls } from './Background';
import { GAME_WIDTH, GAME_HEIGHT } from './constants';
import { BRICK_TYPES } from './data/brickTypes';
import { POWERUP_TYPES, POSITIVE_POWERUPS, NEGATIVE_POWERUPS } from './data/powerups';
import { LEVEL_ORDER } from './data/levelOrder';
import { SentimentState } from './types/SentimentState';
import type { BrickDefinition } from './types/BrickDefinition';
import type { PowerupDefinition } from './types/PowerupDefinition';
import type { MarketModifiers } from './types/MarketModifiers';
import type { MarketStateId } from './types/MarketState';
import type { EventContext } from './types/EventDefinition';
import { clamp, enforceMinVertical, normalize, degToRad } from './utils/math';
import { chance } from './utils/random';
import * as B from './data/balance';
import { audio } from './systems/AudioSystem';
import { MarketDirector } from './systems/MarketDirector';
import { EventSystem } from './systems/EventSystem';
import { BossSystem } from './systems/BossSystem';
import type { BossContext } from './systems/BossSystem';
import { EVENT_DEFINITIONS } from './data/events';
import { BOSS_DEFINITIONS } from './data/bosses';
import { STAGE_META } from './data/stageMeta';
import { RISK_PROFILES, type RiskProfile } from './data/riskProfiles';

// ── Types ──

type GameState = 'menu' | 'playing' | 'stage-intro' | 'paused' | 'game-over' | 'victory';

interface Ball {
  x: number; y: number; vx: number; vy: number;
  speed: number;         // current target speed
  lastX: number;         // previous frame position (for collision classification)
  lastY: number;
  brickHits: number;     // total brick hits for speed tier calculation
  mesh: THREE.Group;
  trail: THREE.Mesh;
  trailPositions: number[];
}

interface BrickInst {
  def: BrickDefinition;
  hp: number; x: number; y: number;
  alive: boolean;
  mesh: THREE.Group;
  row?: number;              // grid position for spatial queries
  col?: number;
  scoreValue?: number;       // for leverage bricks: accumulates multiplied score
  fomoTimer?: number;        // for fomo bricks: countdown in seconds
  depegged?: boolean;        // for stable bricks: true when sentiment is extreme
  falling?: boolean;         // for rug-pull effect: brick detaches and falls
  fallingVy?: number;        // fall speed
  unstable?: boolean;        // rug-pull collapse: warning phase before falling
  unstableTimer?: number;    // seconds remaining in unstable state
  sellWallId?: number;       // tracks which sell wall group this brick belongs to
  isBossSupport?: boolean;   // spawned by boss shield attack
  spawnedFromEvent?: boolean; // spawned by market event
}

interface PowerupInst {
  def: PowerupDefinition;
  x: number; y: number; vy: number;
  alive: boolean;
  mesh: THREE.Group;
}

interface ActiveEffect {
  id: string;
  expiresAt: number;
  onExpire: () => void;
}

interface Hazard {
  x: number; y: number; vy: number;
  mesh: THREE.Group;
}

interface Laser {
  x: number; y: number;
  mesh: THREE.Group;
}

interface LiqLaneStrike {
  x: number;               // center x in game coords
  width: number;            // lane width
  telegraphTimer: number;   // seconds remaining in telegraph phase
  strikeTimer: number;      // seconds remaining in strike phase (starts after telegraph)
  phase: 'telegraph' | 'strike' | 'done';
}

interface SellWall {
  id: number;
  brickIndices: number[];   // indices into this.bricks for affected bricks
  colStart: number;         // leftmost column
  colEnd: number;           // rightmost column (inclusive)
  currentRow: number;       // current grid row (increases = descends)
  dropsRemaining: number;   // how many more 1-row drops
  telegraphTimer: number;   // seconds of warning before next drop
  pauseTimer: number;       // seconds of pause between drops
  phase: 'telegraph' | 'dropping' | 'paused' | 'done';
}

// ── Game ──

export class Game {
  private r: Renderer;
  private state: GameState = 'menu';

  // Paddle
  private paddleX = GAME_WIDTH / 2;
  private lastPaddleX = GAME_WIDTH / 2;
  private paddleVx = 0;
  private paddleWidth = B.PADDLE_WIDTH;
  private paddleMesh: THREE.Group | null = null;

  // Balls
  private balls: Ball[] = [];
  private ballLaunched = false;

  // Bricks
  private bricks: BrickInst[] = [];
  private brickGrid: (BrickInst | null)[][] = [];   // [row][col] spatial lookup
  private looseBricks: BrickInst[] = [];             // boss-spawned / event bricks without grid pos
  private brickCandidates: BrickInst[] = [];         // reusable array for spatial query results

  // Powerups
  private powerups: PowerupInst[] = [];
  private activeEffects: ActiveEffect[] = [];

  // Shield
  private shieldMesh: THREE.Group | null = null;
  private shieldActive = false;

  // Lasers
  private laserActive = false;
  private lastLaserTime = 0;
  private lasers: Laser[] = [];

  // Hazards
  private hazards: Hazard[] = [];

  // Risk profile
  private riskProfile: RiskProfile = RISK_PROFILES[1]; // default: margin (5x)

  // State
  private score = 0;
  private lives = B.STARTING_LIVES;
  private comboCount = 0;
  private comboTimer = 0;
  private currentLevel = 0;
  private sentimentValue = B.SENTIMENT_START;
  private sentimentState = SentimentState.Neutral;
  private piercing = false;
  private levelClearing = false;
  private gameTime = 0;

  // Input
  private keys: Record<string, boolean> = {};
  private useMouseControl = false;
  private mouseX = GAME_WIDTH / 2;

  // Animation
  private animId = 0;
  private lastTime = 0;

  // ── New systems ──
  private marketDirector = new MarketDirector();
  private eventSystem = new EventSystem(EVENT_DEFINITIONS);
  private bossSystem = new BossSystem(BOSS_DEFINITIONS);
  private currentModifiers: MarketModifiers | null = null;
  private bossMode = false;
  private bossMesh: THREE.Group | null = null;
  private beamMesh: THREE.Group | null = null;
  private lastBossAttackId: string | null = null;

  // Event-driven overrides (temporary modifiers from events)
  private eventHazardBias = 1.0;
  private eventBallSpeedMult = 1.0;
  private pendingTickerMessages: string[] = [];

  // Mechanic systems
  private liqLanes: LiqLaneStrike[] = [];
  private liqLaneTimer = 0;          // countdown to next lane strike
  private sellWalls: SellWall[] = [];
  private sellWallTimer = 0;         // countdown to next sell wall
  private sellWallIdCounter = 0;
  private sellWallAccelerated = false; // true during flashCrash

  constructor(container: HTMLElement) {
    this.r = new Renderer(container);
    this.setupInput();
  }

  start() {
    this.showMenu();
    this.lastTime = performance.now();
    this.loop(this.lastTime);
  }

  // ── Input ──
  private setupInput() {
    window.addEventListener('keydown', e => {
      this.keys[e.code] = true;

      // Space/Enter during menu starts the game with selected risk
      if (this.state === 'menu' && (e.code === 'Space' || e.code === 'Enter')) {
        audio.init();
        audio.resume();
        const selectedId = this.r.getSelectedRiskId();
        const selected = RISK_PROFILES.find(p => p.id === selectedId);
        if (selected) this.riskProfile = selected;
        audio.menuSelect();
        this.startGame();
        return;
      }

      if (this.state === 'game-over' || this.state === 'victory') {
        if (e.code === 'Space' || e.code === 'Enter') {
          audio.menuSelect();
          this.showMenu();
          return;
        }
      }

      if (this.state === 'playing') {
        if (e.code === 'Space') this.launchBall();
        if (e.code === 'Escape') this.togglePause();
        if (e.code === 'ArrowLeft' || e.code === 'KeyA') this.useMouseControl = false;
        if (e.code === 'ArrowRight' || e.code === 'KeyD') this.useMouseControl = false;
        // Debug: cycle levels with [ and ]
        if (e.code === 'BracketRight') {
          this.currentLevel = (this.currentLevel + 1) % LEVEL_ORDER.length;
          this.debugJumpToLevel();
        }
        if (e.code === 'BracketLeft') {
          this.currentLevel = (this.currentLevel - 1 + LEVEL_ORDER.length) % LEVEL_ORDER.length;
          this.debugJumpToLevel();
        }
        // Debug: B = trigger boss fight on current stage (if it has one)
        if (e.code === 'KeyB') {
          this.debugTriggerBoss();
        }
        // Debug: F = jump to final boss (stage 10 boss)
        if (e.code === 'KeyF') {
          this.currentLevel = LEVEL_ORDER.length - 1;
          this.debugJumpToLevel();
          setTimeout(() => this.debugTriggerBoss(), 500);
        }
        // Debug: E = trigger a random event
        if (e.code === 'KeyE') {
          this.eventSystem.maybeTrigger(this.makeEventContext());
        }
      }

      if (this.state === 'paused' && e.code === 'Escape') {
        this.togglePause();
      }
    });

    window.addEventListener('keyup', e => {
      this.keys[e.code] = false;
    });

    window.addEventListener('mousemove', e => {
      const [gx] = this.r.screenToGame(e.clientX, e.clientY);
      this.mouseX = gx;
      if (this.state === 'playing') this.useMouseControl = true;
    });

    window.addEventListener('mousedown', (e) => {
      if (this.state === 'menu') {
        // Check if a risk button was clicked
        const [gx, gy] = this.r.screenToGame(e.clientX, e.clientY);
        const hitRisk = this.r.hitTestOverlay(gx, gy);
        if (hitRisk) {
          const profile = RISK_PROFILES.find(p => p.id === hitRisk);
          if (profile) this.riskProfile = profile;
          audio.menuSelect();
          return; // Don't start game, just select risk
        }
        audio.init();
        audio.resume();
        // Apply selected risk profile before starting
        const selectedId = this.r.getSelectedRiskId();
        const selected = RISK_PROFILES.find(p => p.id === selectedId);
        if (selected) this.riskProfile = selected;
        audio.menuSelect();
        this.startGame();
      } else if (this.state === 'playing') {
        this.launchBall();
      } else if (this.state === 'game-over' || this.state === 'victory') {
        audio.menuSelect();
        this.showMenu();
      }
    });

    window.addEventListener('touchstart', e => {
      const touch = e.touches[0];
      if (touch) {
        const [gx, gy] = this.r.screenToGame(touch.clientX, touch.clientY);
        this.mouseX = gx;
        this.useMouseControl = true;

        if (this.state === 'menu') {
          const hitRisk = this.r.hitTestOverlay(gx, gy);
          if (hitRisk) {
            const profile = RISK_PROFILES.find(p => p.id === hitRisk);
            if (profile) this.riskProfile = profile;
            audio.menuSelect();
            return;
          }
          audio.init();
          audio.resume();
          const selectedId = this.r.getSelectedRiskId();
          const selected = RISK_PROFILES.find(p => p.id === selectedId);
          if (selected) this.riskProfile = selected;
          audio.menuSelect();
          this.startGame();
          return;
        }
      }
      if (this.state === 'playing') {
        this.launchBall();
      } else if (this.state === 'game-over' || this.state === 'victory') {
        audio.menuSelect();
        this.showMenu();
      }
    });

    window.addEventListener('touchmove', e => {
      const touch = e.touches[0];
      if (touch) {
        const [gx] = this.r.screenToGame(touch.clientX, touch.clientY);
        this.mouseX = gx;
        this.useMouseControl = true;
      }
    });
  }

  // ── State transitions ──
  private showMenu() {
    this.state = 'menu';
    this.clearAll();
    this.r.setLevelTheme(0);
    const bg = buildBackground(this.r, 0);
    this.r.bgGroup.add(bg);
    this.r.setOverlayScreen({
      type: 'menu',
      riskProfiles: RISK_PROFILES.map(p => ({
        id: p.id, label: p.label, name: p.name,
        description: p.description, color: p.color,
      })),
    });
  }

  private startGame() {
    this.clearAll();
    this.score = 0;
    this.lives = this.riskProfile.modifiers.lives;
    this.comboCount = 0;
    this.comboTimer = 0;
    this.currentLevel = 0;
    this.sentimentValue = B.SENTIMENT_START;
    this.sentimentState = SentimentState.Neutral;
    this.piercing = false;
    this.laserActive = false;
    this.levelClearing = false;
    this.gameTime = 0;
    this.bossMode = false;
    this.eventHazardBias = 1.0;
    this.eventBallSpeedMult = 1.0;
    this.pendingTickerMessages = [];

    // Reset systems
    this.marketDirector.reset();
    this.eventSystem.reset();
    this.bossSystem.reset();

    this.r.hideOverlay();
    audio.startMusic();
    this.setupLevel();
  }

  private setupLevel() {
    // Background
    this.r.clearBackground();
    this.r.setLevelTheme(this.currentLevel);
    const bg = buildBackground(this.r, this.currentLevel);
    this.r.bgGroup.add(bg);

    // Paddle
    this.paddleWidth = B.PADDLE_WIDTH;
    this.paddleX = GAME_WIDTH / 2;
    this.rebuildPaddle();

    // Ball
    this.createBall();
    this.ballLaunched = false;

    // Bricks
    this.loadLevel(this.currentLevel);

    // Reset event system for new level
    this.eventSystem.reset();
    this.eventHazardBias = 1.0;
    this.eventBallSpeedMult = 1.0;

    // Reset mechanic systems
    this.liqLanes = [];
    this.liqLaneTimer = 8; // grace period at level start
    this.sellWalls = [];
    this.sellWallTimer = 10; // grace period at level start
    this.sellWallAccelerated = false;

    // Boss check
    this.bossMode = false;
    this.removeBossVisual();

    // Stage intro
    this.showStageIntro();
  }

  private showStageIntro() {
    const level = LEVEL_ORDER[this.currentLevel];
    if (!level) return;

    const stageMeta = STAGE_META[this.currentLevel];
    const bossInfo = stageMeta?.bossId ? `// BOSS: ${stageMeta.bossId.toUpperCase()}` : undefined;

    this.state = 'stage-intro';
    this.r.setOverlayScreen({
      type: 'stage-intro',
      name: level.name.toUpperCase(),
      flavorText: level.flavorText,
      bossInfo,
    });

    setTimeout(() => {
      if (this.state === 'stage-intro') {
        this.r.hideOverlay();
        this.state = 'playing';
      }
    }, 2000);
  }

  private togglePause() {
    if (this.state === 'playing') {
      this.state = 'paused';
      this.r.setOverlayScreen({ type: 'paused' });
    } else if (this.state === 'paused') {
      this.state = 'playing';
      this.r.hideOverlay();
    }
  }

  private gameOver() {
    this.state = 'game-over';
    // Clean up active event
    if (this.eventSystem.isEventActive()) {
      this.eventSystem.forceEnd(this.makeEventContext());
    }
    this.bossSystem.reset();
    this.removeBossVisual();

    audio.stopAmbient();
    audio.stopMusic();
    audio.gameOver();
    const bagVal = (this.score * 100 + 10000).toLocaleString();
    this.r.setOverlayScreen({
      type: 'game-over',
      bagValue: bagVal,
      stageText: `Stage ${this.currentLevel + 1} of ${LEVEL_ORDER.length}`,
    });
  }

  private victory() {
    this.state = 'victory';
    audio.stopAmbient();
    audio.stopMusic();
    audio.levelClear();
    const moonVal = (this.score * 100 + 10000).toLocaleString();
    const returnPct = (this.score * 0.8).toFixed(0);
    const rp = this.riskProfile;
    this.r.setOverlayScreen({
      type: 'victory',
      moonValue: moonVal,
      returnPct,
      riskLabel: rp.label,
      riskColor: rp.color,
      riskName: rp.name,
    });
  }

  // ── Paddle ──
  private rebuildPaddle() {
    if (this.paddleMesh) this.r.remove(this.paddleMesh);
    this.paddleMesh = this.r.makePaddle(this.paddleWidth, B.PADDLE_HEIGHT);
    this.r.scene.add(this.paddleMesh);
    this.r.setPos(this.paddleMesh, this.paddleX, GAME_HEIGHT - B.PADDLE_Y_OFFSET);
  }

  // ── Ball ──
  private createBall(): Ball {
    const mesh = this.r.makeBall(B.BALL_RADIUS);
    this.r.scene.add(mesh);
    const trail = this.r.makeBallTrail();
    this.r.scene.add(trail);

    const startX = this.paddleX;
    const startY = GAME_HEIGHT - B.PADDLE_Y_OFFSET - B.PADDLE_HEIGHT / 2 - B.BALL_RADIUS - 2;
    const ball: Ball = {
      x: startX, y: startY,
      vx: 0, vy: 0,
      speed: B.BALL_BASE_SPEED * this.getLevelSpeedMult(),
      lastX: startX, lastY: startY,
      brickHits: 0,
      mesh, trail,
      trailPositions: [],
    };
    this.balls.push(ball);
    // NOTE: callers (setupLevel, loseLife) set ballLaunched = false explicitly.
    // spawnExtraBall does NOT reset ballLaunched since the game is already in play.
    return ball;
  }

  private launchBall() {
    if (this.ballLaunched) return;
    const ball = this.balls[0];
    if (!ball) return;
    this.ballLaunched = true;
    const speed = B.BALL_BASE_SPEED * this.getLevelSpeedMult();
    const angle = degToRad(B.BALL_LAUNCH_ANGLE_DEG);
    ball.speed = speed;
    ball.brickHits = 0;
    ball.vx = Math.cos(angle) * speed;
    ball.vy = Math.sin(angle) * speed;
  }

  // ── Bricks ──
  private loadLevel(index: number) {
    const level = LEVEL_ORDER[index];
    if (!level) return;

    // Initialize spatial grid
    const layout = level.layout;
    const gridRows = layout.length;
    const gridCols = gridRows > 0 ? layout[0].length : B.BRICK_COLS;
    this.brickGrid = [];
    for (let r = 0; r < gridRows; r++) {
      this.brickGrid[r] = new Array(gridCols).fill(null);
    }
    this.looseBricks = [];

    for (let row = 0; row < layout.length; row++) {
      for (let col = 0; col < layout[row].length; col++) {
        const typeId = layout[row][col];
        if (!typeId) continue;
        const def = BRICK_TYPES[typeId];
        if (!def) continue;

        const x = B.BRICK_OFFSET_X + col * (B.BRICK_WIDTH + B.BRICK_PADDING) + B.BRICK_WIDTH / 2;
        const y = B.BRICK_OFFSET_Y + row * (B.BRICK_HEIGHT + B.BRICK_PADDING) + B.BRICK_HEIGHT / 2;

        const mesh = this.r.makeBrick(def, B.BRICK_WIDTH, B.BRICK_HEIGHT);
        this.r.scene.add(mesh);
        this.r.setPos(mesh, x, y);

        const inst: BrickInst = { def, hp: def.hp, x, y, alive: true, mesh, row, col };
        if (def.fomo) inst.fomoTimer = 6.0 * this.riskProfile.modifiers.fomoTimerMult;
        if (def.leverage) inst.scoreValue = def.score;
        if (def.stable) inst.depegged = false;
        this.bricks.push(inst);
        this.brickGrid[row][col] = inst;
      }
    }
  }

  // ── Game loop ──
  private frameAccum = 0;
  private static readonly FRAME_INTERVAL = 1000 / 60; // lock to 60fps

  private loop = (now: number) => {
    this.animId = requestAnimationFrame(this.loop);
    const elapsed = now - this.lastTime;
    if (elapsed < Game.FRAME_INTERVAL * 0.95) return; // skip if too soon (0.95 for timing jitter)
    const dt = Math.min(elapsed / 1000, 0.05); // cap at 50ms
    this.lastTime = now;

    if (this.state === 'playing') {
      this.gameTime += dt;
      this.updateMarketState();
      this.updateEventSystem(dt);
      this.updatePaddle(dt);
      this.updateBalls(dt);
      this.updateCollisions();
      this.updateBoss(dt);
      this.updatePowerups(dt);
      this.updateLasers(dt);
      this.updateHazards(dt);
      this.updateBricks(dt);
      this.updateLiqLanes(dt);
      this.updateSellWalls(dt);
      this.updateCombo(dt);
      this.updateEffects();
      this.updateHUD();
      this.checkLevelClear();
    }

    // Animate background models
    this.animateBackground(now);

    // Update particles
    this.r.updateParticles(dt);
    this.r.updateTempEffects();

    // Render
    this.r.render();
  };

  private animateBackground(now: number) {
    const moodPulse = this.currentModifiers?.visualProfile.backgroundPulse ?? 0.5;
    const eventPulse = this.eventSystem.isEventActive() ? 1 : 0;
    const parallaxX = clamp((this.paddleX / GAME_WIDTH - 0.5) * 2, -1, 1);
    const leadBall = this.balls[0];
    const parallaxY = leadBall ? clamp((leadBall.y / GAME_HEIGHT - 0.5) * 2, -1, 1) : 0;
    const ballSpeed = leadBall ? Math.hypot(leadBall.vx, leadBall.vy) : B.BALL_BASE_SPEED;
    const expectedBase = B.BALL_BASE_SPEED * this.riskProfile.modifiers.ballSpeedMult;
    const ballEnergy = clamp(ballSpeed / Math.max(1, expectedBase), 0.5, 1.8);

    const controls: BackgroundRuntimeControls = {
      moodPulse,
      eventPulse,
      parallaxX,
      parallaxY,
      ballEnergy,
    };

    for (const child of this.r.bgGroup.children) {
      if (child instanceof THREE.Group) {
        animateBackgroundFx(child, now, controls);
      }
    }
  }

  // ── Market State Director ──
  private updateMarketState() {
    const transition = this.marketDirector.checkTransition(this.sentimentValue, this.gameTime * 1000);
    if (transition) {
      this.currentModifiers = this.marketDirector.getModifiers(this.sentimentValue);
      const color = this.marketDirector.getStateColorHex(transition.to);
      this.r.flash(color, 0.4);

      // Ambient drone layer
      audio.setMarketAmbient(transition.to);

      // Audio + callouts for state transitions
      if (transition.to === 'euphoria') {
        audio.euphoriaEnter();
        this.r.showCallout(GAME_WIDTH / 2, GAME_HEIGHT / 2, 'EUPHORIA!', '#ffaa00', 34);
      } else if (transition.to === 'bull') {
        audio.sentimentShift('bull');
        this.r.showCallout(GAME_WIDTH / 2, GAME_HEIGHT / 2, 'BULL MARKET!', '#00ff88', 30);
      } else if (transition.to === 'bear') {
        audio.sentimentShift('bear');
        this.r.showCallout(GAME_WIDTH / 2, GAME_HEIGHT / 2, 'BEAR MARKET!', '#ff2222', 30);
      } else if (transition.to === 'neutral') {
        // Subtle transition back to neutral
        this.r.showCallout(GAME_WIDTH / 2, GAME_HEIGHT / 2, 'CONSOLIDATION', '#888888', 22);
      }

      // Inject a ticker message for the new state
      const msg = this.marketDirector.getNextTickerMessage(transition.to);
      if (msg) this.pendingTickerMessages.push(msg);
    }

    // Always keep modifiers current
    if (!this.currentModifiers) {
      this.currentModifiers = this.marketDirector.getModifiers(this.sentimentValue);
    }

    // Map MarketStateId to SentimentState enum for backwards compat
    const marketState = this.marketDirector.getCurrentState();
    if (marketState === 'euphoria' || marketState === 'bull') {
      this.sentimentState = marketState === 'euphoria' ? SentimentState.Euphoria : SentimentState.Bull;
    } else if (marketState === 'bear') {
      this.sentimentState = SentimentState.Bear;
    } else {
      this.sentimentState = SentimentState.Neutral;
    }
  }

  // ── Event System ──
  private updateEventSystem(dt: number) {
    // Don't run events during boss intro
    if (this.bossSystem.isBossIntroPlaying()) return;

    const ctx = this.makeEventContext();
    this.eventSystem.update(ctx, dt);
  }

  private makeEventContext(): EventContext {
    const marketState = this.marketDirector.getCurrentState();
    return {
      nowMs: this.gameTime * 1000,
      stageNumber: this.currentLevel + 1,
      sentiment: this.sentimentValue,
      combo: this.comboCount,
      marketState,
      addCallout: (x, y, text, color, size) => this.r.showCallout(x, y, text, color, size),
      flashScreen: (color, intensity) => this.r.flash(color, intensity),
      adjustSentiment: (delta) => this.adjustSentiment(delta),
      getActiveBrickCount: () => this.bricks.filter(b => b.alive && b.def.destructible).length,
      setBallSpeedMultiplier: (mult) => { this.eventBallSpeedMult = mult; },
      setHazardBias: (bias) => { this.eventHazardBias = bias; },
      addTickerMessage: (msg) => { this.pendingTickerMessages.push(msg); },
      setSellWallAccelerated: (active) => { this.sellWallAccelerated = active; },
    };
  }

  // ── Boss System ──
  private updateBoss(dt: number) {
    if (!this.bossMode) return;

    const boss = this.bossSystem.getBoss();
    if (!boss) return;

    const ctx = this.makeBossContext();
    this.bossSystem.update(ctx, dt);

    // Update boss visual position
    if (this.bossMesh) {
      this.r.setPos(this.bossMesh, boss.x, boss.y);

      // Pulse effect — stronger when weak point is open
      const basePulse = boss.weakPointOpen ? 0.06 : 0.02;
      const pulseSpeed = boss.weakPointOpen ? 8 : 4;
      const pulse = 1.0 + Math.sin(this.gameTime * pulseSpeed) * basePulse;
      this.bossMesh.scale.setScalar(pulse);

      // Flash when invulnerable
      if (boss.flags.invulnerable && boss.flags.introduced) {
        this.bossMesh.visible = Math.sin(this.gameTime * 20) > 0;
      } else {
        this.bossMesh.visible = true;
      }

      // Animate boss sub-parts
      const t = this.gameTime;

      // Whale: spout pulse + eye sparkle rotation
      const spout = this.bossMesh.getObjectByName('anim_spout');
      if (spout) {
        spout.scale.y = 0.7 + Math.sin(t * 2.5) * 0.4;
        const spoutMat = (spout.children[0] as THREE.LineSegments).material as THREE.LineBasicMaterial;
        spoutMat.opacity = 0.15 + Math.sin(t * 3) * 0.15;
      }
      const eye = this.bossMesh.getObjectByName('anim_eye');
      if (eye) eye.rotation.z += dt * 1.5;

      // Liquidator: crosshair rotation + scan line sweep
      const crosshair = this.bossMesh.getObjectByName('anim_crosshair');
      if (crosshair) crosshair.rotation.z += dt * 2.0;
      const scan = this.bossMesh.getObjectByName('anim_scanlines');
      if (scan) {
        scan.position.y = Math.sin(t * 3) * (boss.height * 0.3);
        const scanMat = (scan.children[0] as THREE.LineSegments).material as THREE.LineBasicMaterial;
        scanMat.opacity = 0.15 + Math.sin(t * 6) * 0.1;
      }

      // Flippening: core rotation + energy pulses
      const core = this.bossMesh.getObjectByName('anim_core');
      if (core) core.rotation.z += dt * 1.2;
      const bullE = this.bossMesh.getObjectByName('anim_bull_energy');
      if (bullE) {
        const s = 0.85 + Math.sin(t * 5) * 0.15;
        bullE.scale.set(s, s, 1);
        const mat = (bullE.children[0] as THREE.LineSegments).material as THREE.LineBasicMaterial;
        mat.opacity = 0.2 + Math.sin(t * 7) * 0.15;
      }
      const bearE = this.bossMesh.getObjectByName('anim_bear_energy');
      if (bearE) {
        const s = 0.85 + Math.sin(t * 5 + Math.PI) * 0.15;
        bearE.scale.set(s, s, 1);
        const mat = (bearE.children[0] as THREE.LineSegments).material as THREE.LineBasicMaterial;
        mat.opacity = 0.2 + Math.sin(t * 7 + Math.PI) * 0.15;
      }
    }

    // Apply active attack effects
    const attack = this.bossSystem.getActiveAttack();
    if (attack && !attack.telegraphing) {
      this.applyBossAttackEffect(boss, attack, dt);
    }

    // Clean up beam when attack ends or changes
    if (this.beamMesh && (!attack || attack.id !== 'liquidationBeam' || attack.telegraphing)) {
      this.r.remove(this.beamMesh);
      this.beamMesh = null;
    }

    // Track attack transitions for cleanup
    const currentAttackId = attack?.id ?? null;
    if (currentAttackId !== this.lastBossAttackId) {
      this.lastBossAttackId = currentAttackId;
    }

    // Telegraph visualization — type-specific
    if (attack?.telegraphing && this.bossMesh) {
      this.bossMesh.visible = Math.sin(this.gameTime * 30) > 0;
      const def = this.bossSystem.getDefinition();
      const atkDef = def?.attacks.find(a => a.id === attack.id);
      const telegraphProgress = atkDef ? 1 - (this.bossSystem.getBoss()!.telegraphRemainingMs / atkDef.telegraphMs) : 0;

      if (attack.id === 'liquidationBeam') {
        // Show targeting line toward paddle
        this.r.drawTelegraphLine(boss.x, boss.y + boss.height / 2, boss.x, GAME_HEIGHT, 0xff2222, telegraphProgress);
      } else if (attack.id === 'columnStrike') {
        // Flash the target columns
        const colIndex = Math.floor(telegraphProgress * 3) % 3;
        const colX = GAME_WIDTH * (0.25 + colIndex * 0.25);
        this.r.drawColumnWarning(colX, 60, telegraphProgress);
      } else if (attack.id === 'gravitySwell') {
        // Expanding rings
        this.r.drawGravityField(boss.x, boss.y, 80 * telegraphProgress, telegraphProgress, 0x0088ff);
      } else {
        // Default: warning particles
        if (Math.random() < 0.3) {
          this.r.burst(boss.x, boss.y, 0xff4400, 3);
        }
      }
    }

    // Ball vs boss collision (only launched balls)
    if (boss.flags.introduced && !boss.flags.defeated && this.ballLaunched) {
      for (const ball of this.balls) {
        if (this.circleRect(ball.x, ball.y, B.BALL_RADIUS, boss.x, boss.y, boss.width, boss.height)) {
          // Bounce ball off boss
          const dx = ball.x - boss.x;
          const dy = ball.y - boss.y;
          if (Math.abs(dx) / boss.width > Math.abs(dy) / boss.height) {
            ball.vx = Math.abs(ball.vx) * Math.sign(dx);
            ball.x = boss.x + Math.sign(dx) * (boss.width / 2 + B.BALL_RADIUS + 1);
          } else {
            ball.vy = Math.abs(ball.vy) * Math.sign(dy);
            ball.y = boss.y + Math.sign(dy) * (boss.height / 2 + B.BALL_RADIUS + 1);
          }

          // Damage boss
          const defeated = this.bossSystem.damageBoss(1, ctx);
          if (!boss.flags.invulnerable) {
            audio.bossHit();
            this.r.burst(ball.x, ball.y, 0xff8800, 12);
          }

          if (defeated) {
            this.onBossDefeated();
          }
        }
      }

      // Laser vs boss collision
      for (let li = this.lasers.length - 1; li >= 0; li--) {
        const laser = this.lasers[li];
        if (this.rectRect(laser.x, laser.y, 4, 14, boss.x, boss.y, boss.width, boss.height)) {
          const defeated = this.bossSystem.damageBoss(1, ctx);
          if (!boss.flags.invulnerable) {
            audio.bossHit();
            this.r.burst(laser.x, laser.y, 0xff8800, 8);
          }
          this.r.remove(laser.mesh);
          this.lasers.splice(li, 1);
          if (defeated) {
            this.onBossDefeated();
          }
        }
      }
    }

    // Check defeat animation done
    if (this.bossSystem.isDefeatAnimationDone()) {
      this.onBossDefeatComplete();
    }
  }

  /** Apply the gameplay effects of the boss's current attack */
  private applyBossAttackEffect(
    boss: { x: number; y: number; width: number; height: number; id: string },
    attack: { id: string; elapsed: number; duration: number },
    dt: number
  ) {
    const t = attack.elapsed / attack.duration; // 0→1 progress

    switch (attack.id) {
      // ── Whale attacks ──
      case 'gravitySwell': {
        // Pull all launched balls toward the boss — gentle but persistent
        if (!this.ballLaunched) break;
        const strength = 140 * (1 - Math.abs(t - 0.5) * 2); // ramp up then down
        for (const ball of this.balls) {
          const dx = boss.x - ball.x;
          const dist = Math.abs(dx);
          if (dist > 20 && dist < 400) {
            const force = strength / Math.max(dist, 80);
            ball.vx += Math.sign(dx) * force * dt * 60;
          }
        }
        // Visual: concentric expanding rings
        const gravRadius = 120 + strength * 0.8;
        this.r.drawGravityField(boss.x, boss.y, gravRadius, (this.gameTime * 0.5) % 1, 0x0088ff);
        // Spiral particles toward boss
        if (Math.random() < 0.3) {
          const angle = this.gameTime * 3 + Math.random() * Math.PI * 2;
          const d = 80 + Math.random() * 120;
          this.r.burst(
            boss.x + Math.cos(angle) * d,
            boss.y + Math.sin(angle) * d,
            0x0088ff, 2
          );
        }
        break;
      }

      case 'pickupVacuum': {
        // Pull all active powerups toward the boss and destroy them on contact
        for (const pu of this.powerups) {
          if (!pu.alive) continue;
          const dx = boss.x - pu.x;
          const dy = boss.y - pu.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 300) {
            const pull = 250 / Math.max(dist, 40);
            pu.x += (dx / dist) * pull * dt * 60;
            pu.vy = 0; // override normal fall
            pu.y += (dy / dist) * pull * dt * 60;
            // Eat powerup if close enough
            if (dist < 30) {
              pu.alive = false;
              this.r.burst(pu.x, pu.y, 0x0088ff, 8);
            }
          }
        }
        // Visual: suction lines
        if (Math.random() < 0.3) {
          const angle = Math.random() * Math.PI * 2;
          const dist = 60 + Math.random() * 80;
          this.r.burst(
            boss.x + Math.cos(angle) * dist,
            boss.y + Math.sin(angle) * dist,
            0x44ddff, 1
          );
        }
        break;
      }

      case 'shieldSpawn': {
        // Spawn a row of bricks in front of the boss (once at start of attack)
        // Skip positions where bricks already exist to avoid overlap
        if (attack.elapsed < 100 && !this.bricks.some(b => b.alive && b.isBossSupport && Math.abs(b.y - (boss.y + boss.height / 2 + 30)) < 5)) {
          const shieldY = boss.y + boss.height / 2 + 30;
          const count = 4;
          const spacing = boss.width / count;
          const startX = boss.x - (boss.width / 2) + spacing / 2;
          let spawned = 0;
          for (let i = 0; i < count; i++) {
            const bx = startX + i * spacing;
            // Check for overlap with existing alive bricks
            const overlaps = this.bricks.some(b => b.alive &&
              Math.abs(b.x - bx) < B.BRICK_WIDTH * 0.6 &&
              Math.abs(b.y - shieldY) < B.BRICK_HEIGHT * 0.7);
            if (overlaps) continue;
            // 25% chance to spawn a rug brick instead of tough
            const isRug = Math.random() < 0.25;
            const def = BRICK_TYPES[isRug ? 'rug' : 'tough'];
            if (!def) continue;
            const mesh = this.r.makeBrick(def, B.BRICK_WIDTH * 0.7, B.BRICK_HEIGHT * 0.8);
            this.r.scene.add(mesh);
            this.r.setPos(mesh, bx, shieldY);
            const bossInst: BrickInst = { def, hp: def.hp, x: bx, y: shieldY, alive: true, mesh, isBossSupport: true };
            this.bricks.push(bossInst);
            this.looseBricks.push(bossInst);
            spawned++;
          }
          if (spawned > 0) {
            this.r.burst(boss.x, shieldY, 0x00aaff, 15);
            audio.brickHit();
          }
        }
        break;
      }

      // ── Liquidator attacks ──
      case 'liquidationBeam': {
        // Vertical beam that sweeps toward the paddle — damages on contact
        const beamX = boss.x + Math.sin(t * Math.PI * 2) * 120;

        // Create beam mesh if not exists
        if (!this.beamMesh) {
          this.beamMesh = this.r.createBeamMesh(0xff2222);
          this.r.scene.add(this.beamMesh);
        }
        // Update beam position and intensity
        const beamIntensity = 0.5 + Math.sin(t * Math.PI * 8) * 0.3;
        this.r.updateBeam(this.beamMesh, beamX, beamIntensity);

        // Edge particle sparks
        if (Math.random() < 0.4) {
          this.r.burst(beamX + (Math.random() - 0.5) * 12, boss.y + Math.random() * (GAME_HEIGHT - boss.y), 0xff2222, 1);
        }

        // Damage paddle if beam is on it
        if (Math.abs(beamX - this.paddleX) < this.paddleWidth / 2 + 10) {
          if (Math.random() < 0.02) {
            this.applyHazardHit();
          }
        }
        break;
      }

      case 'columnStrike': {
        // Mark a column, then strike it
        const colIndex = Math.floor((t * 3) % 3);
        const colX = GAME_WIDTH * (0.25 + colIndex * 0.25);
        if (t < 0.6) {
          // Warning phase — column outline rectangle
          this.r.drawColumnWarning(colX, 50, t);
        } else {
          // Strike — spawn hazards down the column
          if (Math.random() < 0.08) {
            const mesh = this.r.makeHazard();
            this.r.scene.add(mesh);
            this.hazards.push({ x: colX + (Math.random() - 0.5) * 40, y: boss.y + 40, vy: 150, mesh });
            this.r.setPos(mesh, colX, boss.y + 40);
          }
        }
        break;
      }

      case 'volatilityPulse': {
        // Periodic speed bursts on all balls
        if (!this.ballLaunched) break;
        const pulsePhase = Math.sin(t * Math.PI * 6);
        if (pulsePhase > 0.9 && Math.random() < 0.1) {
          for (const ball of this.balls) {
            ball.speed = Math.min(ball.speed * 1.15, B.BALL_SPEED_CAP);
            const norm = normalize(ball.vx, ball.vy, ball.speed);
            ball.vx = norm.vx;
            ball.vy = norm.vy;
          }
          this.r.flash(0xff4400, 0.15);
        }
        break;
      }

      case 'hazardSummon': {
        // Rapid hazard spawn burst
        if (Math.random() < 0.06 && this.hazards.length < 5) {
          const x = boss.x + (Math.random() - 0.5) * boss.width;
          const mesh = this.r.makeHazard();
          this.r.scene.add(mesh);
          this.hazards.push({ x, y: boss.y + boss.height / 2, vy: 120 + Math.random() * 60, mesh });
          this.r.setPos(mesh, x, boss.y + boss.height / 2);
        }
        break;
      }

      // ── Flippening attacks ──
      case 'polarityShift': {
        // Flip ball directions randomly
        // Visual: sweeping vertical divider line
        const sweepX = GAME_WIDTH * (0.5 + Math.sin(t * Math.PI * 2) * 0.45);
        this.r.drawTelegraphLine(sweepX, 0, sweepX, GAME_HEIGHT, 0x8844ff, t);
        // Left half green, right half red edge pulses
        if (Math.random() < 0.15) {
          this.r.burst(5, Math.random() * GAME_HEIGHT, 0x00ff88, 2);
          this.r.burst(GAME_WIDTH - 5, Math.random() * GAME_HEIGHT, 0xff2222, 2);
        }
        if (t > 0.3 && t < 0.7 && Math.random() < 0.02) {
          for (const ball of this.balls) {
            ball.vx = -ball.vx;
          }
          this.r.flash(0x8844ff, 0.2);
          this.r.showCallout(boss.x, boss.y + 50, 'REVERSAL', '#8844ff', 16, true);
        }
        break;
      }

      case 'moodInversion': {
        // Swing sentiment wildly
        // Visual: pulsing rings around boss alternating green/red
        const moodColor = Math.sin(t * Math.PI * 4) > 0 ? 0x00ff88 : 0xff2222;
        this.r.drawGravityField(boss.x, boss.y, 60 + t * 40, (this.gameTime * 0.8) % 1, moodColor);
        if (Math.random() < 0.03) {
          const swing = (Math.random() > 0.5 ? 1 : -1) * (8 + Math.random() * 12);
          this.adjustSentiment(swing);
        }
        break;
      }

      case 'lanePressure': {
        // Drop hazards in lanes near the paddle
        // Visual: downward arrows/lines at target positions
        const laneOffset = (Math.random() > 0.5 ? 1 : -1) * (40 + Math.random() * 80);
        const laneX = clamp(this.paddleX + laneOffset, 40, GAME_WIDTH - 40);
        // Draw targeting line from boss to target area
        this.r.drawTelegraphLine(boss.x, boss.y + boss.height / 2, laneX, GAME_HEIGHT - B.PADDLE_Y_OFFSET, 0xffaa00, t);
        if (Math.random() < 0.05 && this.hazards.length < 4) {
          const x = laneX;
          const mesh = this.r.makeHazard();
          this.r.scene.add(mesh);
          this.hazards.push({ x, y: boss.y + boss.height / 2 + 20, vy: 100 + Math.random() * 50, mesh });
          this.r.setPos(mesh, x, boss.y + boss.height / 2 + 20);
        }
        break;
      }
    }
  }

  private makeBossContext(): BossContext {
    return {
      nowMs: this.gameTime * 1000,
      paddleX: this.paddleX,
      paddleY: GAME_HEIGHT - B.PADDLE_Y_OFFSET,
      paddleWidth: this.paddleWidth,
      ballPositions: this.balls.map(b => ({ x: b.x, y: b.y })),
      addCallout: (x, y, text, color, size) => this.r.showCallout(x, y, text, color, size),
      flashScreen: (color, intensity) => this.r.flash(color, intensity),
      playSound: (sound) => {
        if (sound === 'bossIntro') audio.bossIntro();
        else if (sound === 'bossPhaseChange') audio.bossPhaseChange();
        else if (sound === 'bossDefeat') audio.bossDefeat();
      },
      spawnHazard: (x) => {
        const mesh = this.r.makeHazard();
        this.r.scene.add(mesh);
        const vy = 100 + Math.random() * 40;
        this.hazards.push({ x, y: -20, vy, mesh });
        this.r.setPos(mesh, x, -20);
      },
      adjustSentiment: (delta) => this.adjustSentiment(delta),
    };
  }

  private startBossFight() {
    const stageMeta = STAGE_META[this.currentLevel];
    if (!stageMeta?.bossId) return;

    const bossDef = this.bossSystem.getBossForStage(this.currentLevel + 1);
    if (!bossDef) return;

    this.bossMode = true;
    this.bossSystem.spawnBoss(bossDef.id, this.gameTime * 1000);

    // Create boss visual
    this.bossMesh = this.r.makeBossMesh(bossDef);
    this.r.scene.add(this.bossMesh);
    this.r.setPos(this.bossMesh, GAME_WIDTH / 2, 100);

    // Boss intro callout
    this.r.showCallout(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 50, bossDef.introCallout, '#ff4444', 32);
    audio.bossIntro();
  }

  private onBossDefeated() {
    // Boss defeat handled by BossSystem - just visual cleanup after animation
    this.r.burst(this.bossSystem.getBoss()!.x, this.bossSystem.getBoss()!.y, 0xffaa00, 40);
    this.score += 1000;
  }

  private onBossDefeatComplete() {
    this.bossMode = false;
    this.removeBossVisual();
    this.bossSystem.reset();

    // Progress to next level
    this.score += B.SCORE_LEVEL_CLEAR_BONUS;
    this.r.flash(0xffaa00, 0.4);
    audio.levelClear();

    this.currentLevel++;
    if (this.currentLevel >= LEVEL_ORDER.length) {
      setTimeout(() => this.victory(), 1500);
    } else {
      setTimeout(() => {
        this.cleanupLevel();
        this.setupLevel();
        this.levelClearing = false;
      }, 1500);
    }
  }

  private removeBossVisual() {
    if (this.bossMesh) {
      this.r.remove(this.bossMesh);
      this.bossMesh = null;
    }
    if (this.beamMesh) {
      this.r.remove(this.beamMesh);
      this.beamMesh = null;
    }
    this.lastBossAttackId = null;
  }

  // ── Paddle update ──
  private updatePaddle(dt: number) {
    this.lastPaddleX = this.paddleX;

    if (this.keys['ArrowLeft'] || this.keys['KeyA'] || this.keys['ArrowRight'] || this.keys['KeyD']) {
      this.useMouseControl = false;
    }

    if (this.useMouseControl) {
      this.paddleX = clamp(this.mouseX, this.paddleWidth / 2, GAME_WIDTH - this.paddleWidth / 2);
    } else {
      let vx = 0;
      if (this.keys['ArrowLeft'] || this.keys['KeyA']) vx = -B.PADDLE_SPEED;
      if (this.keys['ArrowRight'] || this.keys['KeyD']) vx = B.PADDLE_SPEED;
      this.paddleX += vx * dt;
    }

    this.paddleX = clamp(this.paddleX, this.paddleWidth / 2, GAME_WIDTH - this.paddleWidth / 2);

    // Compute paddle velocity for ball influence
    this.paddleVx = dt > 0 ? (this.paddleX - this.lastPaddleX) / dt : 0;

    if (this.paddleMesh) {
      this.r.setPos(this.paddleMesh, this.paddleX, GAME_HEIGHT - B.PADDLE_Y_OFFSET);
    }

    // Keep docked ball following paddle — reset position AND velocity
    if (!this.ballLaunched && this.balls.length > 0) {
      this.balls[0].x = this.paddleX;
      this.balls[0].y = GAME_HEIGHT - B.PADDLE_Y_OFFSET - B.PADDLE_HEIGHT / 2 - B.BALL_RADIUS - 2;
      this.balls[0].vx = 0;
      this.balls[0].vy = 0;
    }
  }

  // ── Ball update (substepped) ──
  private updateBalls(dt: number) {
    for (let i = this.balls.length - 1; i >= 0; i--) {
      const ball = this.balls[i];

      if (this.ballLaunched) {
        // Safety valve: if ball has near-zero speed, re-launch it
        const curLen = Math.hypot(ball.vx, ball.vy);
        if (curLen < 1) {
          ball.vx = 0;
          ball.vy = -ball.speed;
        }

        // Store previous position for collision classification
        ball.lastX = ball.x;
        ball.lastY = ball.y;

        // Substepped movement + collision
        const substeps = B.BALL_SUBSTEPS;
        const stepDt = dt / substeps;
        for (let s = 0; s < substeps; s++) {
          ball.x += ball.vx * stepDt;
          ball.y += ball.vy * stepDt;

          // Wall collisions
          if (ball.x - B.BALL_RADIUS < 0) { ball.x = B.BALL_RADIUS; ball.vx = Math.abs(ball.vx); }
          if (ball.x + B.BALL_RADIUS > GAME_WIDTH) { ball.x = GAME_WIDTH - B.BALL_RADIUS; ball.vx = -Math.abs(ball.vx); }
          if (ball.y - B.BALL_RADIUS < 0) { ball.y = B.BALL_RADIUS; ball.vy = Math.abs(ball.vy); }

          // Paddle collision
          this.resolveBallPaddle(ball);

          // Brick collision (single best brick per substep)
          this.resolveBallBricks(ball);

          // Shield collision
          const shieldY = GAME_HEIGHT - B.PADDLE_Y_OFFSET + B.PADDLE_HEIGHT + 15;
          if (this.shieldActive && ball.y + B.BALL_RADIUS > shieldY && ball.vy > 0) {
            ball.vy = -Math.abs(ball.vy);
            ball.y = shieldY - B.BALL_RADIUS;
            this.r.burst(ball.x, shieldY, 0x44ddff, 8);
            audio.shieldHit();
            this.removeShield();
          }

          // Enforce speed and anti-degenerate
          this.enforceBallSpeed(ball);
          const fixed = enforceMinVertical(ball.vx, ball.vy, B.BALL_MIN_VERTICAL_RATIO, ball.speed);
          ball.vx = fixed.vx;
          ball.vy = fixed.vy;
        }
      }

      // Update visual
      this.r.setPos(ball.mesh, ball.x, ball.y);

      // Update trail — distance-based for consistent length across frame rates
      const wp = this.r.toWorld(ball.x, ball.y);
      const tp = ball.trailPositions;
      const MAX_TRAIL_LEN = 120; // max trail length in world units
      tp.push(wp.x, wp.y, wp.z);
      // Compute cumulative length from head (end) backwards, trim excess
      let cumLen = 0;
      let cutIdx = 0;
      for (let j = tp.length - 3; j >= 3; j -= 3) {
        const dx = tp[j] - tp[j - 3], dy = tp[j + 1] - tp[j - 2];
        cumLen += Math.sqrt(dx * dx + dy * dy);
        if (cumLen > MAX_TRAIL_LEN) { cutIdx = j - 3; break; }
      }
      if (cutIdx > 0) tp.splice(0, cutIdx);
      // Hard cap on point count for the geometry buffer
      while (tp.length > 20 * 3) tp.splice(0, 3);
      this.r.updateBallTrail(ball.trail, tp);

      // Ball lost
      if (ball.y > GAME_HEIGHT + 20) {
        this.removeBall(i);
        if (this.balls.length === 0) {
          this.loseLife();
        }
      }
    }
  }

  private enforceBallSpeed(ball: Ball) {
    const len = Math.hypot(ball.vx, ball.vy);
    if (len <= 0.0001) {
      ball.vx = 0;
      ball.vy = -ball.speed;
      return;
    }
    ball.vx = (ball.vx / len) * ball.speed;
    ball.vy = (ball.vy / len) * ball.speed;
  }

  private removeBall(index: number) {
    const ball = this.balls[index];
    this.r.remove(ball.mesh);
    this.r.remove(ball.trail);
    this.balls.splice(index, 1);
  }

  // ── Collisions (non-ball; ball collisions are in substep loop) ──
  private updateCollisions() {
    const paddleY = GAME_HEIGHT - B.PADDLE_Y_OFFSET;

    // Powerups vs paddle (always active, even before ball launch)
    for (const pu of this.powerups) {
      if (!pu.alive) continue;
      if (this.rectRect(pu.x, pu.y, 20, 20,
          this.paddleX, paddleY, this.paddleWidth, B.PADDLE_HEIGHT)) {
        this.catchPowerup(pu);
      }
    }

    if (!this.ballLaunched) return;

    // Lasers vs bricks
    for (let li = this.lasers.length - 1; li >= 0; li--) {
      const laser = this.lasers[li];
      for (const brick of this.bricks) {
        if (!brick.alive) continue;
        if (this.rectRect(laser.x, laser.y, 4, 14, brick.x, brick.y, B.BRICK_WIDTH, B.BRICK_HEIGHT)) {
          this.hitBrick(brick);
          this.r.remove(laser.mesh);
          this.lasers.splice(li, 1);
          break;
        }
      }
    }
  }

  private circleRect(cx: number, cy: number, cr: number, rx: number, ry: number, rw: number, rh: number): boolean {
    const closestX = clamp(cx, rx - rw / 2, rx + rw / 2);
    const closestY = clamp(cy, ry - rh / 2, ry + rh / 2);
    const dx = cx - closestX;
    const dy = cy - closestY;
    return dx * dx + dy * dy < cr * cr;
  }

  private rectRect(ax: number, ay: number, aw: number, ah: number, bx: number, by: number, bw: number, bh: number): boolean {
    return Math.abs(ax - bx) < (aw + bw) / 2 && Math.abs(ay - by) < (ah + bh) / 2;
  }

  // ── Paddle collision (spec §12-15): top-face aiming + side fallback ──
  private resolveBallPaddle(ball: Ball) {
    const pLeft = this.paddleX - this.paddleWidth / 2;
    const pRight = this.paddleX + this.paddleWidth / 2;
    const pTop = GAME_HEIGHT - B.PADDLE_Y_OFFSET - B.PADDLE_HEIGHT / 2;
    const pBottom = GAME_HEIGHT - B.PADDLE_Y_OFFSET + B.PADDLE_HEIGHT / 2;

    if (!this.circleRect(ball.x, ball.y, B.BALL_RADIUS, this.paddleX, GAME_HEIGHT - B.PADDLE_Y_OFFSET, this.paddleWidth, B.PADDLE_HEIGHT)) return;

    const tolerance = 4;
    const prevBottom = ball.lastY + B.BALL_RADIUS;
    const currBottom = ball.y + B.BALL_RADIUS;
    const currLeft = ball.x - B.BALL_RADIUS;
    const currRight = ball.x + B.BALL_RADIUS;
    const horizontalOverlap = currRight >= pLeft && currLeft <= pRight;

    // Top-face hit: ball moving down, was above paddle top last frame, horizontal overlap
    const cameFromAbove = ball.vy > 0 && prevBottom <= pTop + tolerance && currBottom >= pTop && horizontalOverlap;

    if (cameFromAbove) {
      // §14: Contact-point aiming with curve power
      let t = (ball.x - this.paddleX) / (this.paddleWidth * 0.5);
      t = clamp(t, -1, 1);

      const shapedT = Math.sign(t) * Math.pow(Math.abs(t), B.PADDLE_CURVE_POWER);
      const maxAngle = degToRad(B.PADDLE_MAX_BOUNCE_ANGLE_DEG);
      const outAngle = shapedT * maxAngle;

      const speed = ball.speed;
      let vx = speed * Math.sin(outAngle);
      let vy = -speed * Math.cos(outAngle);

      // §14.5: Paddle velocity influence
      vx += this.paddleVx * B.PADDLE_VELOCITY_INFLUENCE;

      // §14.6: Renormalize to preserve speed
      const len = Math.hypot(vx, vy) || 1;
      vx = (vx / len) * speed;
      vy = (vy / len) * speed;

      // §14.7: Safety clamp — enforce minimum vertical
      const minVyMag = speed * B.BALL_MIN_VERTICAL_RATIO;
      if (Math.abs(vy) < minVyMag) {
        vy = -minVyMag;
        const remainingVx = Math.sqrt(Math.max(0, speed * speed - vy * vy));
        vx = Math.sign(vx || t || 1) * remainingVx;
      }

      // §14.8: Positional correction
      ball.y = pTop - B.BALL_RADIUS - 0.5;
      ball.vx = vx;
      ball.vy = vy;

      this.r.burst(ball.x, ball.y, 0x44ddff, 6);
      audio.paddleHit();
      return;
    }

    // Side/bottom fallback: use penetration-based resolution
    const penLeft = Math.abs(currRight - pLeft);
    const penRight = Math.abs(pRight - currLeft);
    const penTop = Math.abs(currBottom - pTop);
    const penBottom = Math.abs(pBottom - (ball.y - B.BALL_RADIUS));
    const minPenX = Math.min(penLeft, penRight);
    const minPenY = Math.min(penTop, penBottom);

    if (minPenX < minPenY) {
      if (ball.x < this.paddleX) {
        ball.x = pLeft - B.BALL_RADIUS - 0.5;
        ball.vx = -Math.abs(ball.vx);
      } else {
        ball.x = pRight + B.BALL_RADIUS + 0.5;
        ball.vx = Math.abs(ball.vx);
      }
    } else {
      if (ball.y < GAME_HEIGHT - B.PADDLE_Y_OFFSET) {
        ball.y = pTop - B.BALL_RADIUS - 0.5;
        ball.vy = -Math.abs(ball.vy);
      } else {
        ball.y = pBottom + B.BALL_RADIUS + 0.5;
        ball.vy = Math.abs(ball.vy);
      }
    }
  }

  // ── Spatial grid lookup: return nearby bricks for collision ──
  private getBrickCandidates(bx: number, by: number): BrickInst[] {
    this.brickCandidates.length = 0;
    const cellW = B.BRICK_WIDTH + B.BRICK_PADDING;
    const cellH = B.BRICK_HEIGHT + B.BRICK_PADDING;
    const col = Math.floor((bx - B.BRICK_OFFSET_X) / cellW);
    const row = Math.floor((by - B.BRICK_OFFSET_Y) / cellH);
    const gridRows = this.brickGrid.length;
    const gridCols = gridRows > 0 ? this.brickGrid[0].length : 0;

    for (let dr = -1; dr <= 1; dr++) {
      const r = row + dr;
      if (r < 0 || r >= gridRows) continue;
      for (let dc = -1; dc <= 1; dc++) {
        const c = col + dc;
        if (c < 0 || c >= gridCols) continue;
        const brick = this.brickGrid[r][c];
        if (brick && brick.alive) {
          this.brickCandidates.push(brick);
        }
      }
    }

    // Always include loose bricks (boss-spawned, event bricks at arbitrary positions)
    for (let i = 0; i < this.looseBricks.length; i++) {
      const brick = this.looseBricks[i];
      if (brick.alive) {
        this.brickCandidates.push(brick);
      }
    }

    return this.brickCandidates;
  }

  // ── Brick collision (spec §16-18): single best brick per substep ──
  private resolveBallBricks(ball: Ball) {
    let bestBrick: BrickInst | null = null;
    let bestPen = Infinity;
    let bestAxis: 'x' | 'y' = 'y';

    for (const brick of this.getBrickCandidates(ball.x, ball.y)) {
      if (!brick.alive) continue;
      if (!this.circleRect(ball.x, ball.y, B.BALL_RADIUS, brick.x, brick.y, B.BRICK_WIDTH, B.BRICK_HEIGHT)) continue;

      const dx = ball.x - brick.x;
      const dy = ball.y - brick.y;
      const penX = B.BRICK_WIDTH / 2 + B.BALL_RADIUS - Math.abs(dx);
      const penY = B.BRICK_HEIGHT / 2 + B.BALL_RADIUS - Math.abs(dy);
      const axis: 'x' | 'y' = penX < penY ? 'x' : 'y';
      const pen = Math.min(penX, penY);

      if (pen < bestPen) {
        bestPen = pen;
        bestBrick = brick;
        bestAxis = axis;
      }
    }

    if (!bestBrick) return;

    // Resolve collision (skip reflection if piercing)
    if (!this.piercing) {
      const dx = ball.x - bestBrick.x;
      const dy = ball.y - bestBrick.y;
      if (bestAxis === 'x') {
        ball.vx = Math.abs(ball.vx) * Math.sign(dx || 1);
        ball.x = bestBrick.x + Math.sign(dx || 1) * (B.BRICK_WIDTH / 2 + B.BALL_RADIUS + 0.5);
      } else {
        ball.vy = Math.abs(ball.vy) * Math.sign(dy || 1);
        ball.y = bestBrick.y + Math.sign(dy || 1) * (B.BRICK_HEIGHT / 2 + B.BALL_RADIUS + 0.5);
      }
    }

    this.hitBrick(bestBrick);

    // Speed tier progression (spec §19.2)
    ball.brickHits++;
    const tiers = Math.floor(ball.brickHits / B.BALL_SPEED_TIER_EVERY_HITS);
    const baseSpeed = B.BALL_BASE_SPEED * this.getLevelSpeedMult();
    ball.speed = clamp(baseSpeed + tiers * B.BALL_SPEED_TIER_ADD, B.BALL_MIN_SPEED, B.BALL_SPEED_CAP);
  }

  private hitBrick(brick: BrickInst) {
    if (!brick.alive) return;

    // Stable bricks bounce the ball when not depegged
    if (brick.def.stable && !brick.depegged) {
      this.r.burst(brick.x, brick.y, 0x22cc88, 4);
      audio.brickHit();
      return; // no damage
    }

    brick.hp--;
    this.r.burst(brick.x, brick.y, brick.def.color, 8);
    audio.brickHit();

    // Leverage brick: survived a hit — double score, spawn hazard
    if (brick.def.leverage && brick.alive && brick.hp > 0) {
      brick.scoreValue = (brick.scoreValue ?? brick.def.score) * 2;
      this.r.showCallout(brick.x, brick.y - 15,
        `${brick.scoreValue / brick.def.score}x LEVERAGE!`, '#ff8800', 14, true);
      // Spawn a hazard as the cost of leverage
      const hMesh = this.r.makeHazard();
      this.r.scene.add(hMesh);
      this.hazards.push({ x: brick.x, y: brick.y + 20, vy: 100 + Math.random() * 40, mesh: hMesh });
      this.r.setPos(hMesh, brick.x, brick.y + 20);
    }

    if (brick.hp <= 0 && (brick.def.destructible || brick.depegged)) {
      brick.alive = false;
      this.r.remove(brick.mesh);
      this.r.shards(brick.x, brick.y, brick.def.color);
      audio.brickDestroy();

      // Score - now uses market modifiers
      const marketMult = this.currentModifiers?.scoreMultiplier ?? 1.0;
      const multiplier = marketMult + this.comboCount * B.SCORE_COMBO_MULTIPLIER;
      const baseScore = brick.scoreValue ?? brick.def.score;
      this.score += Math.floor(baseScore * multiplier * this.riskProfile.modifiers.scoreMult);

      // Combo
      this.comboCount++;
      const comboGrace = this.currentModifiers?.comboGraceMultiplier ?? 1.0;
      this.comboTimer = (B.COMBO_WINDOW_MS / 1000) * comboGrace;
      if (this.comboCount >= 3 && this.comboCount % 3 === 0) {
        audio.comboHit(this.comboCount);
      }

      // Crypto callouts
      if (this.comboCount === 3) {
        this.r.showCallout(brick.x, brick.y - 20, 'PUMP IT!', '#ffaa00', 16, true);
      } else if (this.comboCount === 5) {
        this.r.showCallout(brick.x, brick.y - 20, 'TO THE MOON!', '#00ff88', 18, true);
      } else if (this.comboCount === 8) {
        this.r.showCallout(brick.x, brick.y - 20, 'WHALE ALERT!', '#44ddff', 20, true);
      } else if (this.comboCount === 10) {
        this.r.showCallout(brick.x, brick.y - 20, 'HODL!', '#88eeff', 20, true);
      } else if (this.comboCount === 12) {
        this.r.showCallout(brick.x, brick.y - 20, 'DIAMOND HANDS!', '#88eeff', 22, true);
      } else if (this.comboCount === 15) {
        this.r.showCallout(brick.x, brick.y - 20, 'NEW PARADIGM!', '#ffaa00', 24, true);
      } else if (this.comboCount >= 20 && this.comboCount % 5 === 0) {
        this.r.showCallout(brick.x, brick.y - 20, 'PARABOLIC!', '#ff44ff', 26, true);
      }

      // Sentiment
      if (brick.def.sentimentDelta !== 0) this.adjustSentiment(brick.def.sentimentDelta);
      if (this.comboCount >= 3) this.adjustSentiment(B.SENTIMENT_COMBO_BOOST);

      // Powerup drop - uses market modifiers for bias
      const dropChance = brick.def.dropChance * this.riskProfile.modifiers.powerupDropMult;
      if (chance(dropChance)) this.spawnPowerup(brick.x, brick.y);

      // Explosive
      if (brick.def.explosive) {
        this.r.explosion(brick.x, brick.y, brick.def.color);
        audio.explosion();
        for (const other of this.bricks) {
          if (!other.alive || other === brick || !other.def.destructible) continue;
          if (other.def.diamond) continue; // diamonds are explosion-proof
          const dist = Math.sqrt((other.x - brick.x) ** 2 + (other.y - brick.y) ** 2);
          if (dist < 70) {
            setTimeout(() => this.hitBrick(other), 100);
          }
        }
      }

      // FOMO bonus — destroyed before timer expired
      if (brick.def.fomo && brick.fomoTimer !== undefined && brick.fomoTimer > 0) {
        const bonus = Math.floor(brick.def.score * 2 * multiplier);
        this.score += bonus;
        this.r.showCallout(brick.x, brick.y - 25, 'FOMO BONUS!', '#44ff44', 16, true);
        this.r.burst(brick.x, brick.y, 0x44ff44, 12);
        this.adjustSentiment(5);
      }

      // Leverage bonus callout
      if (brick.def.leverage && brick.scoreValue && brick.scoreValue > brick.def.score) {
        const mult = brick.scoreValue / brick.def.score;
        this.r.showCallout(brick.x, brick.y - 25, `${mult}x PAYOUT!`, '#ff8800', 16, true);
      }

      // Rug pull — nearby bricks become unstable, then fall
      if (brick.def.rug) {
        this.r.flash(0x9933ff, 0.25);
        audio.explosion();
        this.r.showCallout(brick.x, brick.y - 15, 'RUG PULLED!', '#9933ff', 18, true);
        const stageMeta = STAGE_META[this.currentLevel];
        const radius = stageMeta?.mechanics?.rugCollapseRadius ?? B.RUG_DEFAULT_RADIUS;
        const currentFalling = this.bricks.filter(b => b.alive && b.falling).length;
        let madeUnstable = 0;
        for (const other of this.bricks) {
          if (!other.alive || other === brick || other.falling || other.unstable) continue;
          if (other.def.id === 'indestructible') continue;
          if (currentFalling + madeUnstable >= B.RUG_MAX_FALLING) break;
          const dist = Math.sqrt((other.x - brick.x) ** 2 + (other.y - brick.y) ** 2);
          if (dist < radius) {
            other.unstable = true;
            other.unstableTimer = B.RUG_UNSTABLE_DURATION + Math.random() * 0.15;
            madeUnstable++;
          }
        }
        this.adjustSentiment(-10);
      }

      // Whale — drops multiple powerups on destroy
      if (brick.def.whale) {
        this.r.showCallout(brick.x, brick.y - 20, 'WHALE DOWN!', '#0066cc', 18, true);
        this.r.burst(brick.x, brick.y, 0x0066cc, 20);
        // Drop 2 extra powerups
        this.spawnPowerup(brick.x - 20, brick.y);
        this.spawnPowerup(brick.x + 20, brick.y);
      }

      // Influencer — converts adjacent same-type bricks to standard
      if (brick.def.influencer) {
        this.r.showCallout(brick.x, brick.y - 15, 'FADED!', '#ff44cc', 16, true);
        this.r.burst(brick.x, brick.y, 0xff44cc, 15);
        const stdDef = BRICK_TYPES['standard'];
        for (const other of this.bricks) {
          if (!other.alive || other === brick) continue;
          const dist = Math.sqrt((other.x - brick.x) ** 2 + (other.y - brick.y) ** 2);
          if (dist < 80 && other.def.id !== 'indestructible' && other.def.id !== 'standard') {
            // Convert to standard
            other.def = stdDef;
            other.hp = 1;
            const otherCore = other.mesh.children[0] as THREE.LineSegments;
            (otherCore.material as THREE.LineBasicMaterial).color.setHex(stdDef.color);
            const otherGlow = other.mesh.children[2] as THREE.LineSegments;
            (otherGlow.material as THREE.LineBasicMaterial).color.setHex(stdDef.color);
            this.r.burst(other.x, other.y, stdDef.color, 4);
          }
        }
      }

      // Diamond — guaranteed positive powerup + extra score
      if (brick.def.diamond) {
        this.r.showCallout(brick.x, brick.y - 20, 'DIAMOND!', '#88eeff', 18, true);
        this.r.burst(brick.x, brick.y, 0x88eeff, 18);
        this.r.flash(0x88eeff, 0.15);
        // Extra score bonus
        this.score += Math.floor(brick.def.score * 2 * multiplier);
      }
    } else if (brick.alive) {
      this.r.updateBrickDamage(brick.mesh, brick.hp, brick.def.hp);
    }
  }

  // ── Powerups ──
  private spawnPowerup(x: number, y: number) {
    // Use market modifiers for drop bias
    const positiveBias = this.currentModifiers?.positiveDropBias ?? 1.0;
    const negativeBias = this.currentModifiers?.negativeDropBias ?? 1.0;

    // Also consider stage meta drop bias
    const stageMeta = STAGE_META[this.currentLevel];
    const stagePosBias = stageMeta?.dropBias.positive ?? 1.0;
    const stageNegBias = stageMeta?.dropBias.negative ?? 1.0;

    const positiveChance = 0.65 * positiveBias * stagePosBias;
    const negativeChance = 0.35 * negativeBias * stageNegBias;
    const total = positiveChance + negativeChance;
    const usePositive = chance(positiveChance / total);

    const pool = usePositive ? POSITIVE_POWERUPS : NEGATIVE_POWERUPS;
    const def = pool[Math.floor(Math.random() * pool.length)];

    const mesh = this.r.makePowerup(def.color);
    this.r.scene.add(mesh);
    this.r.setPos(mesh, x, y);

    const fallSpeed = B.POWERUP_FALL_SPEED * (this.currentModifiers?.pickupFallSpeedMultiplier ?? 1.0);
    this.powerups.push({ def, x, y, vy: fallSpeed, alive: true, mesh });
  }

  private updatePowerups(dt: number) {
    for (let i = this.powerups.length - 1; i >= 0; i--) {
      const pu = this.powerups[i];
      if (!pu.alive) {
        this.r.remove(pu.mesh);
        this.powerups.splice(i, 1);
        continue;
      }
      pu.y += pu.vy * dt;
      this.r.setPos(pu.mesh, pu.x, pu.y);
      pu.mesh.rotation.y += dt * 2;
      pu.mesh.rotation.z += dt * 1.5;

      if (pu.y > GAME_HEIGHT + 30) {
        this.r.remove(pu.mesh);
        this.powerups.splice(i, 1);
      }
    }
  }

  private catchPowerup(pu: PowerupInst) {
    if (!pu.alive) return;
    pu.alive = false;
    this.r.burst(this.paddleX, GAME_HEIGHT - B.PADDLE_Y_OFFSET, pu.def.color, 10);
    if (pu.def.positive) audio.powerupCatch(); else audio.powerupBad();
    const colorStr = '#' + pu.def.color.toString(16).padStart(6, '0');
    this.r.showCallout(this.paddleX, GAME_HEIGHT - B.PADDLE_Y_OFFSET - 30,
      pu.def.name.toUpperCase(), colorStr, pu.def.positive ? 18 : 14, true);
    this.applyPowerup(pu.def);
  }

  private applyPowerup(def: PowerupDefinition) {
    switch (def.id) {
      case 'diamondHands':
        this.paddleWidth = B.PADDLE_WIDTH_EXPANDED;
        this.rebuildPaddle();
        this.addTimedEffect(def.id, def.duration / 1000, () => {
          this.paddleWidth = B.PADDLE_WIDTH;
          this.rebuildPaddle();
        });
        break;

      case 'paperHands':
        this.paddleWidth = B.PADDLE_WIDTH_SHRUNK;
        this.rebuildPaddle();
        this.addTimedEffect(def.id, def.duration / 1000, () => {
          this.paddleWidth = B.PADDLE_WIDTH;
          this.rebuildPaddle();
        });
        break;

      case 'airdrop':
        this.spawnExtraBall();
        this.spawnExtraBall();
        break;

      case 'shield':
        this.activateShield();
        break;

      case 'whaleMode':
        this.piercing = true;
        this.addTimedEffect(def.id, def.duration / 1000, () => { this.piercing = false; });
        break;

      case 'bullRun':
        this.adjustSentiment(20);
        this.addTimedEffect(def.id, def.duration / 1000, () => {});
        break;

      case 'laserEyes':
        this.laserActive = true;
        this.addTimedEffect(def.id, def.duration / 1000, () => { this.laserActive = false; });
        break;

      case 'liquidityBoost':
        if (this.lives < B.MAX_LIVES) {
          this.lives++;
          this.r.flash(0x00ff88, 0.3);
        }
        break;

      case 'chainHalt':
        for (const ball of this.balls) {
          ball.speed = Math.max(ball.speed * 0.6, B.BALL_MIN_SPEED * this.getLevelSpeedMult());
          const norm = normalize(ball.vx, ball.vy, ball.speed);
          ball.vx = norm.vx;
          ball.vy = norm.vy;
        }
        this.addTimedEffect(def.id, def.duration / 1000, () => {});
        break;

      case 'gasSpike':
        for (const ball of this.balls) {
          ball.speed = Math.min(ball.speed * 1.4, B.BALL_SPEED_CAP);
          const norm = normalize(ball.vx, ball.vy, ball.speed);
          ball.vx = norm.vx;
          ball.vy = norm.vy;
        }
        this.addTimedEffect(def.id, def.duration / 1000, () => {});
        break;
    }
  }

  private addTimedEffect(id: string, durationSec: number, onExpire: () => void) {
    this.activeEffects = this.activeEffects.filter(e => e.id !== id);
    this.activeEffects.push({ id, expiresAt: this.gameTime + durationSec, onExpire });
  }

  private updateEffects() {
    for (let i = this.activeEffects.length - 1; i >= 0; i--) {
      if (this.gameTime >= this.activeEffects[i].expiresAt) {
        this.activeEffects[i].onExpire();
        this.activeEffects.splice(i, 1);
      }
    }
  }

  // ── Extra balls ──
  private spawnExtraBall() {
    const ball = this.createBall();
    const speed = B.BALL_BASE_SPEED * this.getLevelSpeedMult();
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * 1.2;
    ball.vx = Math.cos(angle) * speed;
    ball.vy = Math.sin(angle) * speed;
    ball.x = this.paddleX;
    ball.y = GAME_HEIGHT - B.PADDLE_Y_OFFSET - 30;
    this.ballLaunched = true;
  }

  // ── Shield ──
  private activateShield() {
    this.removeShield();
    this.shieldMesh = this.r.makeShield();
    this.r.scene.add(this.shieldMesh);
    this.r.setPos(this.shieldMesh, GAME_WIDTH / 2, GAME_HEIGHT - B.PADDLE_Y_OFFSET + B.PADDLE_HEIGHT + 15);
    this.shieldActive = true;

    this.addTimedEffect('shield_active', B.SHIELD_DURATION / 1000, () => {
      this.removeShield();
    });
  }

  private removeShield() {
    if (this.shieldMesh) {
      this.r.remove(this.shieldMesh);
      this.shieldMesh = null;
    }
    this.shieldActive = false;
  }

  // ── Lasers ──
  private updateLasers(dt: number) {
    if (this.laserActive && this.ballLaunched) {
      this.lastLaserTime += dt;
      if (this.lastLaserTime > B.LASER_FIRE_RATE / 1000) {
        this.fireLaser();
        this.lastLaserTime = 0;
      }
    }

    for (let i = this.lasers.length - 1; i >= 0; i--) {
      const laser = this.lasers[i];
      laser.y -= B.LASER_SPEED * dt;
      this.r.setPos(laser.mesh, laser.x, laser.y);

      if (laser.y < -10) {
        this.r.remove(laser.mesh);
        this.lasers.splice(i, 1);
      }
    }
  }

  private fireLaser() {
    const mesh = this.r.makeLaser();
    this.r.scene.add(mesh);
    const laser: Laser = {
      x: this.paddleX,
      y: GAME_HEIGHT - B.PADDLE_Y_OFFSET - B.PADDLE_HEIGHT / 2,
      mesh,
    };
    this.r.setPos(mesh, laser.x, laser.y);
    this.lasers.push(laser);
    audio.laserFire();
  }

  // ── Hazards ──
  private updateHazards(dt: number) {
    const hazardBias = (this.currentModifiers?.hazardBias ?? 1.0) * this.eventHazardBias * this.riskProfile.modifiers.hazardFreqMult;

    const spawnChance = this.sentimentState === SentimentState.Bear
      ? (0.003 + this.currentLevel * 0.001) * 60 * dt * hazardBias
      : this.currentLevel >= 5 ? 0.001 * 60 * dt * hazardBias : 0;

    if (this.ballLaunched && chance(spawnChance) && this.hazards.length < 3) {
      this.spawnHazard();
    }

    for (let i = this.hazards.length - 1; i >= 0; i--) {
      const h = this.hazards[i];
      h.y += h.vy * dt;
      this.r.setPos(h.mesh, h.x, h.y);

      // Check paddle collision
      if (this.rectRect(h.x, h.y, 12, 28, this.paddleX, GAME_HEIGHT - B.PADDLE_Y_OFFSET, this.paddleWidth, B.PADDLE_HEIGHT)) {
        this.applyHazardHit();
        this.r.remove(h.mesh);
        this.hazards.splice(i, 1);
        continue;
      }

      // Check ball collision
      for (const ball of this.balls) {
        if (this.circleRect(ball.x, ball.y, B.BALL_RADIUS, h.x, h.y, 12, 28)) {
          this.r.burst(h.x, h.y, 0xff2222, 10);
          this.score += 5;
          this.r.remove(h.mesh);
          this.hazards.splice(i, 1);
          break;
        }
      }

      // Off screen
      if (h.y > GAME_HEIGHT + 30) {
        this.r.remove(h.mesh);
        this.hazards.splice(i, 1);
      }
    }
  }

  private spawnHazard() {
    const x = 60 + Math.random() * (GAME_WIDTH - 120);
    const mesh = this.r.makeHazard();
    this.r.scene.add(mesh);
    const vy = 80 + this.currentLevel * 15 + Math.random() * 40;
    this.hazards.push({ x, y: -20, vy, mesh });
    this.r.setPos(mesh, x, -20);
  }

  private applyHazardHit() {
    audio.hazardHit();
    this.r.flash(0xff2222, 0.4);
    this.r.burst(this.paddleX, GAME_HEIGHT - B.PADDLE_Y_OFFSET, 0xff2222, 20);

    // More varied callouts
    const phrases = ['REKT!', 'EXIT LIQUIDITY!', 'MAX PAIN!', 'RUGGED!', 'STOP LOSS HIT!'];
    this.r.showCallout(this.paddleX, GAME_HEIGHT - B.PADDLE_Y_OFFSET - 30,
      phrases[Math.floor(Math.random() * phrases.length)], '#ff2222', 18, true);

    this.adjustSentiment(-8);
    for (const ball of this.balls) {
      ball.speed = Math.min(ball.speed * 1.2, B.BALL_SPEED_CAP);
      const norm = normalize(ball.vx, ball.vy, ball.speed);
      ball.vx = norm.vx;
      ball.vy = norm.vy;
    }
  }

  // ── Combo ──
  private updateBricks(dt: number) {
    for (let i = this.bricks.length - 1; i >= 0; i--) {
      const brick = this.bricks[i];
      if (!brick.alive) continue;

      // FOMO countdown
      if (brick.def.fomo && brick.fomoTimer !== undefined) {
        brick.fomoTimer -= dt;

        // Color shift: green → yellow → red as timer runs out
        const maxTimer = 6.0 * this.riskProfile.modifiers.fomoTimerMult;
        const t = Math.max(0, brick.fomoTimer / maxTimer); // 0=expired, 1=fresh
        const core = brick.mesh.children[0] as THREE.LineSegments;
        const coreMat = core.material as THREE.LineBasicMaterial;
        const glow = brick.mesh.children[2] as THREE.LineSegments;
        const glowMat = glow.material as THREE.LineBasicMaterial;
        if (t > 0.5) {
          coreMat.color.setHex(0x44ff44); // green
        } else if (t > 0.2) {
          coreMat.color.setHex(0xffcc00); // yellow
        } else {
          coreMat.color.setHex(0xff2222); // red - urgent!
          // Pulse glow when critical
          glowMat.opacity = 0.15 + Math.sin(performance.now() * 0.015) * 0.1;
        }
        glowMat.color.copy(coreMat.color);

        // Timer expired — explode!
        if (brick.fomoTimer <= 0) {
          brick.alive = false;
          this.r.remove(brick.mesh);
          this.r.explosion(brick.x, brick.y, 0xff2222);
          audio.explosion();
          this.r.showCallout(brick.x, brick.y - 15, 'FOMO EXPIRED!', '#ff2222', 16, true);
          this.adjustSentiment(-8);
          // Damage paddle if close
          if (Math.abs(brick.x - this.paddleX) < this.paddleWidth / 2 + 40 &&
              Math.abs(brick.y - (GAME_HEIGHT - B.PADDLE_Y_OFFSET)) < 80) {
            this.applyHazardHit();
          }
        }
      }

      // Stable brick depegging
      if (brick.def.stable) {
        const wasDepegged = brick.depegged;
        brick.depegged = this.sentimentValue < 40 || this.sentimentValue > 60;
        if (brick.depegged !== wasDepegged) {
          const core = brick.mesh.children[0] as THREE.LineSegments;
          const coreMat = core.material as THREE.LineBasicMaterial;
          const glow = brick.mesh.children[2] as THREE.LineSegments;
          const glowMat = glow.material as THREE.LineBasicMaterial;
          const fill = brick.mesh.children[1] as THREE.Mesh;
          const fillMat = fill.material as THREE.MeshBasicMaterial;
          if (brick.depegged) {
            coreMat.color.setHex(0xff4444);
            glowMat.color.setHex(0xff4444);
            fillMat.color.setHex(0xff4444);
            glowMat.opacity = 0.18;
            this.r.burst(brick.x, brick.y, 0xff4444, 6);
          } else {
            coreMat.color.setHex(0x22cc88);
            glowMat.color.setHex(0x22cc88);
            fillMat.color.setHex(0x22cc88);
            glowMat.opacity = 0.07;
          }
        }
      }

      // Unstable bricks — wobble warning, then transition to falling
      if (brick.unstable && brick.unstableTimer !== undefined) {
        brick.unstableTimer -= dt;
        // Visual wobble + purple tint
        const wobble = Math.sin(performance.now() * 0.025) * 3;
        this.r.setPos(brick.mesh, brick.x + wobble, brick.y);
        const core = brick.mesh.children[0] as THREE.LineSegments;
        const coreMat = core.material as THREE.LineBasicMaterial;
        // Pulse between original color and purple warning
        const pulse = 0.5 + 0.5 * Math.sin(performance.now() * 0.015);
        const origR = (brick.def.color >> 16) & 0xff;
        const origG = (brick.def.color >> 8) & 0xff;
        const origB = brick.def.color & 0xff;
        const warnR = Math.round(origR * (1 - pulse) + 0x99 * pulse);
        const warnG = Math.round(origG * (1 - pulse) + 0x33 * pulse);
        const warnB = Math.round(origB * (1 - pulse) + 0xff * pulse);
        coreMat.color.setRGB(warnR / 255, warnG / 255, warnB / 255);

        if (brick.unstableTimer <= 0) {
          brick.unstable = false;
          brick.unstableTimer = undefined;
          brick.falling = true;
          brick.fallingVy = 30 + Math.random() * 50;
          coreMat.color.setHex(0x9933ff);
          // Move from spatial grid to loose bricks since position will change
          if (brick.row != null && brick.col != null &&
              this.brickGrid[brick.row]?.[brick.col] === brick) {
            this.brickGrid[brick.row][brick.col] = null;
          }
          this.looseBricks.push(brick);
        }
      }

      // Falling bricks (from rug pull or collapse)
      if (brick.falling && brick.fallingVy !== undefined) {
        brick.y += brick.fallingVy * dt;
        brick.fallingVy += 300 * dt; // gravity
        this.r.setPos(brick.mesh, brick.x, brick.y);

        // Damage paddle on collision
        if (this.rectRect(brick.x, brick.y, B.BRICK_WIDTH, B.BRICK_HEIGHT,
            this.paddleX, GAME_HEIGHT - B.PADDLE_Y_OFFSET, this.paddleWidth, B.PADDLE_HEIGHT)) {
          this.applyHazardHit();
          brick.alive = false;
          this.r.remove(brick.mesh);
          this.r.burst(brick.x, brick.y, brick.def.color, 10);
        }

        // Off screen
        if (brick.y > GAME_HEIGHT + 40) {
          brick.alive = false;
          this.r.remove(brick.mesh);
          this.score += Math.floor(brick.def.score * 0.5); // partial score for fallen bricks
        }
      }
    }
  }

  // ── Liquidation Lanes ──
  private updateLiqLanes(dt: number) {
    if (!this.ballLaunched || this.bossMode) return;
    const stageMeta = STAGE_META[this.currentLevel];
    const cfg = stageMeta?.mechanics?.liqLanes;
    if (!cfg?.enabled) return;

    // Spawn new lane strikes on timer
    this.liqLaneTimer -= dt;
    if (this.liqLaneTimer <= 0 && this.liqLanes.length < cfg.maxConcurrent) {
      // Pick a random column-aligned x position
      const col = Math.floor(Math.random() * B.BRICK_COLS);
      const x = B.BRICK_OFFSET_X + col * (B.BRICK_WIDTH + B.BRICK_PADDING) + B.BRICK_WIDTH / 2;
      this.liqLanes.push({
        x,
        width: B.LIQ_LANE_WIDTH,
        telegraphTimer: B.LIQ_LANE_TELEGRAPH_MS / 1000,
        strikeTimer: B.LIQ_LANE_STRIKE_MS / 1000,
        phase: 'telegraph',
      });
      this.r.showCallout(x, 100, 'LIQUIDATION!', '#ff4400', 14, true);
      // Reset timer
      this.liqLaneTimer = cfg.intervalMin + Math.random() * (cfg.intervalMax - cfg.intervalMin);
    }

    // Update active lanes
    for (let i = this.liqLanes.length - 1; i >= 0; i--) {
      const lane = this.liqLanes[i];

      if (lane.phase === 'telegraph') {
        lane.telegraphTimer -= dt;
        // Draw telegraph column warning
        const progress = 1 - (lane.telegraphTimer / (B.LIQ_LANE_TELEGRAPH_MS / 1000));
        this.r.drawColumnWarning(lane.x, lane.width, progress, 0xff4400);

        if (lane.telegraphTimer <= 0) {
          lane.phase = 'strike';
          audio.explosion();
          this.r.flash(0xff4400, 0.15);
        }
      } else if (lane.phase === 'strike') {
        lane.strikeTimer -= dt;
        // Draw active strike beam
        this.r.drawLiqLaneStrike(lane.x, lane.width, 1 - lane.strikeTimer / (B.LIQ_LANE_STRIKE_MS / 1000));

        // Check paddle collision during strike
        const halfW = lane.width / 2;
        if (this.paddleX + this.paddleWidth / 2 > lane.x - halfW &&
            this.paddleX - this.paddleWidth / 2 < lane.x + halfW) {
          // Paddle is in the lane — apply hazard hit
          this.applyHazardHit();
          lane.phase = 'done';
        }

        if (lane.strikeTimer <= 0) {
          lane.phase = 'done';
        }
      }

      if (lane.phase === 'done') {
        this.liqLanes.splice(i, 1);
      }
    }
  }

  // ── Descending Sell Walls ──
  private updateSellWalls(dt: number) {
    if (!this.ballLaunched || this.bossMode) return;
    const stageMeta = STAGE_META[this.currentLevel];
    const cfg = stageMeta?.mechanics?.sellWalls;
    if (!cfg?.enabled) return;

    // Spawn new sell wall on timer
    this.sellWallTimer -= dt;
    if (this.sellWallTimer <= 0 && this.sellWalls.filter(w => w.phase !== 'done').length === 0) {
      this.spawnSellWall(cfg);
      this.sellWallTimer = cfg.intervalMin + Math.random() * (cfg.intervalMax - cfg.intervalMin);
      if (this.sellWallAccelerated) this.sellWallTimer *= 0.5;
    }

    // Update active sell walls
    for (let i = this.sellWalls.length - 1; i >= 0; i--) {
      const wall = this.sellWalls[i];

      if (wall.phase === 'telegraph') {
        wall.telegraphTimer -= dt;
        // Flash affected bricks with warning color
        const progress = 1 - wall.telegraphTimer / (B.SELL_WALL_TELEGRAPH_MS / 1000);
        for (const idx of wall.brickIndices) {
          const brick = this.bricks[idx];
          if (!brick || !brick.alive || brick.falling || brick.unstable) continue;
          // Wobble during telegraph
          const wobble = Math.sin(performance.now() * 0.02 + idx) * 2;
          this.r.setPos(brick.mesh, brick.x + wobble, brick.y);
          // Flash red overlay
          const core = brick.mesh.children[0] as THREE.LineSegments;
          const mat = core.material as THREE.LineBasicMaterial;
          const flash = 0.5 + 0.5 * Math.sin(progress * Math.PI * 6);
          const origR = (brick.def.color >> 16) & 0xff;
          const origG = (brick.def.color >> 8) & 0xff;
          const origB = brick.def.color & 0xff;
          mat.color.setRGB(
            (origR * (1 - flash * 0.6) + 0xff * flash * 0.6) / 255,
            (origG * (1 - flash * 0.6)) / 255,
            (origB * (1 - flash * 0.6)) / 255,
          );
        }

        if (wall.telegraphTimer <= 0) {
          wall.phase = 'dropping';
          this.executeSellWallDrop(wall);
        }
      } else if (wall.phase === 'paused') {
        wall.pauseTimer -= dt;
        if (wall.pauseTimer <= 0) {
          if (wall.dropsRemaining <= 0) {
            wall.phase = 'done';
          } else {
            wall.phase = 'telegraph';
            wall.telegraphTimer = B.SELL_WALL_TELEGRAPH_MS / 1000;
            if (this.sellWallAccelerated) wall.telegraphTimer *= 0.6;
          }
        }
      }

      if (wall.phase === 'done') {
        this.sellWalls.splice(i, 1);
      }
    }
  }

  private spawnSellWall(cfg: NonNullable<NonNullable<import('./types/StageMeta').StageMechanics>['sellWalls']>) {
    // Find a row with bricks to form a sell wall
    const aliveBricks = this.bricks.filter(b => b.alive && !b.falling && !b.unstable &&
      b.def.id !== 'indestructible' && b.row !== undefined && b.col !== undefined);
    if (aliveBricks.length === 0) return;

    // Pick a row that has enough bricks
    const rowCounts = new Map<number, number>();
    for (const b of aliveBricks) {
      rowCounts.set(b.row!, (rowCounts.get(b.row!) ?? 0) + 1);
    }
    // Prefer upper rows (lower row numbers) for more dramatic descent
    const eligibleRows = [...rowCounts.entries()]
      .filter(([, count]) => count >= cfg.widthMin)
      .sort(([a], [b]) => a - b);
    if (eligibleRows.length === 0) return;

    const [row] = eligibleRows[Math.floor(Math.random() * Math.min(3, eligibleRows.length))];

    // Pick column span
    const rowBricks = aliveBricks.filter(b => b.row === row);
    const cols = rowBricks.map(b => b.col!).sort((a, b) => a - b);
    const width = cfg.widthMin + Math.floor(Math.random() * (cfg.widthMax - cfg.widthMin + 1));
    const startIdx = Math.floor(Math.random() * Math.max(1, cols.length - width + 1));
    const selectedCols = cols.slice(startIdx, startIdx + width);
    if (selectedCols.length < cfg.widthMin) return;

    const colStart = selectedCols[0];
    const colEnd = selectedCols[selectedCols.length - 1];

    // Collect brick indices
    const brickIndices: number[] = [];
    for (let bi = 0; bi < this.bricks.length; bi++) {
      const b = this.bricks[bi];
      if (b.alive && b.row === row && b.col !== undefined &&
          b.col >= colStart && b.col <= colEnd &&
          !b.falling && !b.unstable && b.def.id !== 'indestructible') {
        brickIndices.push(bi);
      }
    }
    if (brickIndices.length === 0) return;

    const wallId = this.sellWallIdCounter++;
    for (const idx of brickIndices) {
      this.bricks[idx].sellWallId = wallId;
    }

    this.sellWalls.push({
      id: wallId,
      brickIndices,
      colStart, colEnd,
      currentRow: row,
      dropsRemaining: cfg.maxDrops,
      telegraphTimer: B.SELL_WALL_TELEGRAPH_MS / 1000,
      pauseTimer: 0,
      phase: 'telegraph',
    });

    this.r.showCallout(GAME_WIDTH / 2, 60, 'SELL WALL!', '#ff2244', 16, true);
  }

  private executeSellWallDrop(wall: SellWall) {
    const rowStep = B.BRICK_HEIGHT + B.BRICK_PADDING;

    // Move each brick down by one row step
    for (const idx of wall.brickIndices) {
      const brick = this.bricks[idx];
      if (!brick || !brick.alive || brick.falling || brick.unstable) continue;

      brick.y += rowStep;
      brick.row = (brick.row ?? 0) + 1;
      this.r.setPos(brick.mesh, brick.x, brick.y);
      // Restore original color
      const core = brick.mesh.children[0] as THREE.LineSegments;
      (core.material as THREE.LineBasicMaterial).color.setHex(brick.def.color);
    }

    wall.currentRow++;
    wall.dropsRemaining--;

    // Small screen shake / feedback
    this.r.flash(0xff2244, 0.08);
    audio.brickHit();

    // Check if wall has reached danger zone
    const maxY = Math.max(...wall.brickIndices.map(idx => this.bricks[idx]?.y ?? 0));
    if (maxY >= B.SELL_WALL_DANGER_Y) {
      // Wall reached paddle zone — punish player and dissolve
      this.r.showCallout(GAME_WIDTH / 2, GAME_HEIGHT - 200, 'WALL BREACHED!', '#ff2244', 18, true);
      this.r.flash(0xff2244, 0.3);
      this.applyHazardHit();
      this.adjustSentiment(-8);
      wall.phase = 'done';
      return;
    }

    // Set up pause before next drop
    wall.pauseTimer = B.SELL_WALL_DROP_PAUSE_MS / 1000;
    if (this.sellWallAccelerated) wall.pauseTimer *= 0.5;
    wall.phase = 'paused';
  }

  private updateCombo(dt: number) {
    if (this.comboTimer > 0) {
      this.comboTimer -= dt;
      if (this.comboTimer <= 0) {
        this.comboCount = 0;
        this.comboTimer = 0;
      }
    }
  }

  // ── Sentiment ──
  private adjustSentiment(delta: number) {
    this.sentimentValue = clamp(this.sentimentValue + delta, 0, B.SENTIMENT_MAX);
    // Market state transitions are handled by updateMarketState() each frame
  }

  // ── Life loss ──
  private loseLife() {
    this.lives--;
    this.comboCount = 0;
    this.comboTimer = 0;
    this.piercing = false;
    this.laserActive = false;

    const rektPhrases = ['LIQUIDATED!', 'REKT!', 'STOP LOSS HIT!', 'MARGIN CALL!', 'RUGGED!'];
    this.r.showCallout(GAME_WIDTH / 2, GAME_HEIGHT / 2,
      rektPhrases[Math.floor(Math.random() * rektPhrases.length)], '#ff2222', 28);

    if (this.lives <= 0) {
      this.gameOver();
      return;
    }

    this.createBall();
    this.ballLaunched = false;
    this.paddleWidth = B.PADDLE_WIDTH;
    this.rebuildPaddle();
    this.activeEffects.forEach(e => e.onExpire());
    this.activeEffects = [];
    this.removeShield();
    this.r.flash(0xff2222, 0.35);
    audio.lifeLost();
  }

  // ── Level progression ──
  private checkLevelClear() {
    if (this.levelClearing) return;

    // If boss is active, level clears when boss is defeated (handled by onBossDefeatComplete)
    if (this.bossMode) return;

    const remaining = this.bricks.filter(b => b.alive && (b.def.destructible || b.def.stable) && !b.falling && !b.unstable);
    if (remaining.length === 0 && this.bricks.length > 0) {
      // Check if this stage has a boss
      const stageMeta = STAGE_META[this.currentLevel];
      if (stageMeta?.bossId && !this.bossSystem.isBossDefeated()) {
        // Start boss fight instead of clearing
        this.startBossFight();
        return;
      }

      this.levelClearing = true;
      this.score += B.SCORE_LEVEL_CLEAR_BONUS;
      this.score += this.lives * B.SCORE_LIFE_PRESERVATION_BONUS;
      this.r.flash(0xffaa00, 0.4);
      audio.levelClear();

      // End any active event
      if (this.eventSystem.isEventActive()) {
        this.eventSystem.forceEnd(this.makeEventContext());
      }

      this.r.showCallout(GAME_WIDTH / 2, GAME_HEIGHT / 2, 'POSITION CLOSED', '#00ff88', 28);

      this.currentLevel++;
      if (this.currentLevel >= LEVEL_ORDER.length) {
        setTimeout(() => this.victory(), 1500);
      } else {
        setTimeout(() => {
          this.cleanupLevel();
          this.setupLevel();
          this.levelClearing = false;
        }, 1500);
      }
    }
  }

  private cleanupLevel() {
    // Remove bricks
    for (const b of this.bricks) {
      if (b.mesh.parent) this.r.remove(b.mesh);
    }
    this.bricks = [];
    this.brickGrid = [];
    this.looseBricks = [];

    // Remove powerups
    for (const pu of this.powerups) this.r.remove(pu.mesh);
    this.powerups = [];

    // Remove extra balls (keep creating fresh)
    for (const ball of this.balls) {
      this.r.remove(ball.mesh);
      this.r.remove(ball.trail);
    }
    this.balls = [];

    // Remove lasers
    for (const l of this.lasers) this.r.remove(l.mesh);
    this.lasers = [];

    // Remove hazards
    for (const h of this.hazards) this.r.remove(h.mesh);
    this.hazards = [];

    // Reset effects
    this.activeEffects.forEach(e => e.onExpire());
    this.activeEffects = [];
    this.laserActive = false;
    this.piercing = false;
    this.removeShield();

    // Clean up boss
    this.bossMode = false;
    this.removeBossVisual();
    this.bossSystem.reset();

    // Reset event overrides
    this.eventHazardBias = 1.0;
    this.eventBallSpeedMult = 1.0;
  }

  private clearAll() {
    this.cleanupLevel();
    if (this.paddleMesh) {
      this.r.remove(this.paddleMesh);
      this.paddleMesh = null;
    }
    this.r.clearBackground();
    this.r.hideOverlay();
  }

  // ── HUD ──
  private updateHUD() {
    const marketState = this.marketDirector.getCurrentState();
    const stateLabel = this.marketDirector.getStateLabel(marketState);
    const stateColor = this.marketDirector.getStateColor(marketState);

    const effectLabels = this.activeEffects
      .map(e => {
        const def = POWERUP_TYPES[e.id];
        const remaining = Math.ceil(e.expiresAt - this.gameTime);
        return `${def?.label || e.id}:${remaining}s`;
      });

    const level = LEVEL_ORDER[this.currentLevel];

    // Active event info
    const activeEvent = this.eventSystem.getActiveEventDefinition();
    const eventLabel = activeEvent ? activeEvent.label : '';

    // Boss info
    const boss = this.bossSystem.getBoss();

    this.r.updateHUD({
      score: this.score,
      lives: this.lives,
      combo: this.comboCount,
      sentiment: stateLabel,
      sentimentColor: stateColor,
      stage: level?.name || '',
      effects: effectLabels.join('  '),
      eventLabel,
      bossName: boss?.label ?? null,
      bossHp: boss ? boss.hp / boss.maxHp : null,
      riskLabel: this.riskProfile.label,
      riskColor: this.riskProfile.color,
    });
  }

  // ── Debug helpers ──
  private debugJumpToLevel() {
    this.cleanupLevel();
    this.levelClearing = false;
    this.setupLevel();
  }

  private debugTriggerBoss() {
    // Kill all bricks to trigger boss if stage has one
    const stageMeta = STAGE_META[this.currentLevel];
    if (!stageMeta?.bossId) {
      this.r.showCallout(GAME_WIDTH / 2, GAME_HEIGHT / 2, 'NO BOSS ON THIS STAGE', '#888888', 20);
      return;
    }
    // Kill all destructible bricks
    for (const brick of this.bricks) {
      if (brick.alive && brick.def.destructible) {
        brick.alive = false;
        this.r.remove(brick.mesh);
      }
    }
  }

  // ── Helpers ──
  private getLevelSpeedMult(): number {
    const level = LEVEL_ORDER[this.currentLevel];
    const base = level ? level.speedMultiplier : 1;
    return base * this.riskProfile.modifiers.ballSpeedMult;
  }
}
