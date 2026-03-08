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

// ── Game ──

export class Game {
  private r: Renderer;
  private state: GameState = 'menu';

  // Paddle
  private paddleX = GAME_WIDTH / 2;
  private paddleWidth = B.PADDLE_WIDTH;
  private paddleMesh: THREE.Group | null = null;

  // Balls
  private balls: Ball[] = [];
  private ballLaunched = false;

  // Bricks
  private bricks: BrickInst[] = [];

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

      // Any key during menu starts the game
      if (this.state === 'menu' && (e.code === 'Space' || e.code === 'Enter')) {
        audio.init();
        audio.resume();
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

    window.addEventListener('mousedown', () => {
      if (this.state === 'menu') {
        audio.init();
        audio.resume();
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
        const [gx] = this.r.screenToGame(touch.clientX, touch.clientY);
        this.mouseX = gx;
        this.useMouseControl = true;
      }
      if (this.state === 'menu') {
        audio.init();
        audio.resume();
        audio.menuSelect();
        this.startGame();
      } else if (this.state === 'playing') {
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
    this.r.showOverlay(`
      <div style="text-align:center;background:radial-gradient(ellipse at center, rgba(0,10,8,0.9) 0%, rgba(0,4,6,0.95) 100%);width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center">
        <h1 style="color:#00ff88;font-size:42px;font-family:monospace;text-shadow:0 0 30px #00ff88, 0 0 60px #00ff88;margin-bottom:6px;letter-spacing:4px">REKTANOID</h1>
        <p style="color:#44ddff;font-size:12px;font-family:monospace;margin-bottom:2px">BREAK BLOCKS. PUMP BAGS. GET REKT.</p>
        <p style="color:#334455;font-size:10px;font-family:monospace;margin-bottom:20px">NFA &bull; DYOR &bull; WAGMI</p>
        <p style="color:#888;font-size:10px;font-family:monospace;margin-bottom:12px">Arrow keys / Mouse to move &bull; Space / Click to launch</p>
        <p style="color:#666;font-size:11px;font-family:monospace;margin-bottom:10px">SELECT LEVERAGE:</p>
        <div style="display:flex;gap:10px;justify-content:center;margin-bottom:16px">
          ${RISK_PROFILES.map(p => `
            <button data-risk="${p.id}" style="
              background:transparent;border:1px solid ${p.color};color:${p.color};
              font-family:monospace;font-size:13px;padding:8px 14px;cursor:pointer;
              text-shadow:0 0 10px ${p.color};box-shadow:0 0 8px ${p.color}40;
              transition:all 0.2s;
            " onmouseover="this.style.background='${p.color}20'" onmouseout="this.style.background='transparent'">
              <div style="font-size:16px;font-weight:bold">${p.label}</div>
              <div style="font-size:9px;opacity:0.7">${p.name}</div>
            </button>
          `).join('')}
        </div>
        <p style="color:#888;font-size:10px;font-family:monospace;margin-bottom:14px" id="risk-desc">${RISK_PROFILES[1].description}</p>
        <p style="color:#ffaa00;font-size:14px;font-family:monospace;animation:pulse 1.5s infinite">APE IN (SPACE / CLICK)</p>
      </div>
    `);

    // Attach risk button listeners
    setTimeout(() => {
      const buttons = document.querySelectorAll('[data-risk]');
      buttons.forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const riskId = (btn as HTMLElement).dataset.risk;
          const profile = RISK_PROFILES.find(p => p.id === riskId);
          if (profile) {
            this.riskProfile = profile;
            const desc = document.getElementById('risk-desc');
            if (desc) desc.textContent = profile.description;
            // Highlight selected
            buttons.forEach(b => {
              (b as HTMLElement).style.borderWidth = '1px';
              (b as HTMLElement).style.transform = 'scale(1)';
            });
            (btn as HTMLElement).style.borderWidth = '2px';
            (btn as HTMLElement).style.transform = 'scale(1.1)';
          }
          audio.menuSelect();
        });
      });
      // Default select middle
      const defaultBtn = document.querySelector('[data-risk="margin"]') as HTMLElement;
      if (defaultBtn) {
        defaultBtn.style.borderWidth = '2px';
        defaultBtn.style.transform = 'scale(1.1)';
      }
    }, 50);
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
    const bossInfo = stageMeta?.bossId ? ` // BOSS: ${stageMeta.bossId.toUpperCase()}` : '';

    this.state = 'stage-intro';
    this.r.showOverlay(`
      <div style="text-align:center;pointer-events:none">
        <h2 style="color:#00ff88;font-size:28px;font-family:monospace;text-shadow:0 0 30px #00ff88, 0 0 60px #00ff88">${level.name.toUpperCase()}</h2>
        <p style="color:#44ddff;font-size:14px;font-family:monospace;margin-top:8px;text-shadow:0 0 15px #44ddff">${level.flavorText}</p>
        ${bossInfo ? `<p style="color:#ff4444;font-size:12px;font-family:monospace;margin-top:12px;text-shadow:0 0 10px #ff4444">${bossInfo}</p>` : ''}
      </div>
    `);

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
      this.r.showOverlay(`
        <div style="text-align:center;background:rgba(0,4,6,0.8);width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center">
          <h2 style="color:#44ddff;font-size:28px;font-family:monospace;text-shadow:0 0 20px #44ddff">PAUSED</h2>
          <p style="color:#888;font-size:14px;font-family:monospace;margin-top:12px">Press ESC to resume</p>
        </div>
      `);
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
    this.r.showOverlay(`
      <div style="text-align:center;background:radial-gradient(ellipse at center, rgba(10,0,0,0.85) 0%, rgba(4,0,2,0.95) 100%);width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center">
        <h2 style="color:#ff2222;font-size:42px;font-family:monospace;text-shadow:0 0 30px #ff2222, 0 0 60px #ff2222">LIQUIDATED</h2>
        <p style="color:#ff4444;font-size:14px;font-family:monospace;margin:8px 0">BAGS LIQUIDATED</p>
        <p style="color:#ffaa00;font-size:22px;font-family:monospace;margin:8px 0">$${bagVal}</p>
        <p style="color:#ff4444;font-size:12px;font-family:monospace">-99.7% NGMI</p>
        <p style="color:#555;font-size:12px;font-family:monospace;margin-top:8px">Stage ${this.currentLevel + 1} of ${LEVEL_ORDER.length}</p>
        <p style="color:#44ddff;font-size:14px;font-family:monospace;margin-top:20px;animation:pulse 1.5s infinite">PRESS SPACE TO APE BACK IN</p>
      </div>
    `);
  }

  private victory() {
    this.state = 'victory';
    audio.stopAmbient();
    audio.stopMusic();
    audio.levelClear();
    const moonVal = (this.score * 100 + 10000).toLocaleString();
    const returnPct = (this.score * 0.8).toFixed(0);
    const rp = this.riskProfile;
    this.r.showOverlay(`
      <div style="text-align:center;background:radial-gradient(ellipse at center, rgba(10,8,0,0.85) 0%, rgba(4,3,0,0.95) 100%);width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center">
        <h2 style="color:#ffaa00;font-size:42px;font-family:monospace;text-shadow:0 0 30px #ffaa00, 0 0 60px #ffaa00">CYCLE TOP CALLED</h2>
        <p style="color:#00ff88;font-size:14px;font-family:monospace;margin:8px 0">BAGS MOONED</p>
        <p style="color:#00ff88;font-size:26px;font-family:monospace;margin:8px 0">$${moonVal}</p>
        <p style="color:#00ff88;font-size:14px;font-family:monospace">+${returnPct}% UNREALIZED GAINS</p>
        <p style="color:${rp.color};font-size:12px;font-family:monospace;margin-top:8px">${rp.label} ${rp.name} MODE</p>
        <p style="color:#44ddff;font-size:14px;font-family:monospace;margin-top:16px;animation:pulse 1.5s infinite">PRESS SPACE TO APE BACK IN</p>
      </div>
    `);
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

    const ball: Ball = {
      x: this.paddleX,
      y: GAME_HEIGHT - B.PADDLE_Y_OFFSET - B.PADDLE_HEIGHT / 2 - B.BALL_RADIUS - 2,
      vx: 0, vy: 0,
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
    // Only set ballLaunched AFTER confirming a ball exists
    this.ballLaunched = true;
    const speed = B.BALL_BASE_SPEED * this.getLevelSpeedMult();
    const angle = degToRad(B.BALL_LAUNCH_ANGLE_DEG);
    ball.vx = Math.cos(angle) * speed;
    ball.vy = Math.sin(angle) * speed;
  }

  // ── Bricks ──
  private loadLevel(index: number) {
    const level = LEVEL_ORDER[index];
    if (!level) return;

    const layout = level.layout;
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
      }
    }
  }

  // ── Game loop ──
  private loop = (now: number) => {
    this.animId = requestAnimationFrame(this.loop);
    const dt = Math.min((now - this.lastTime) / 1000, 0.05); // cap at 50ms
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
        // Spawn a row of tough bricks in front of the boss (once at start of attack)
        if (attack.elapsed < 100 && !this.bricks.some(b => b.alive && b.isBossSupport && Math.abs(b.y - (boss.y + boss.height / 2 + 30)) < 5)) {
          const shieldY = boss.y + boss.height / 2 + 30;
          const count = 4;
          const spacing = boss.width / count;
          const startX = boss.x - (boss.width / 2) + spacing / 2;
          for (let i = 0; i < count; i++) {
            const bx = startX + i * spacing;
            const def = BRICK_TYPES['tough'];
            if (!def) continue;
            const mesh = this.r.makeBrick(def, B.BRICK_WIDTH * 0.7, B.BRICK_HEIGHT * 0.8);
            this.r.scene.add(mesh);
            this.r.setPos(mesh, bx, shieldY);
            this.bricks.push({ def, hp: def.hp, x: bx, y: shieldY, alive: true, mesh, isBossSupport: true });
          }
          this.r.burst(boss.x, shieldY, 0x00aaff, 15);
          audio.brickHit();
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
            const speed = Math.sqrt(ball.vx * ball.vx + ball.vy * ball.vy);
            const newSpeed = Math.min(speed * 1.15, B.BALL_SPEED_CAP);
            const norm = normalize(ball.vx, ball.vy, newSpeed);
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
    if (this.keys['ArrowLeft'] || this.keys['KeyA'] || this.keys['ArrowRight'] || this.keys['KeyD']) {
      this.useMouseControl = false;
    }

    if (this.useMouseControl) {
      const target = clamp(this.mouseX, this.paddleWidth / 2, GAME_WIDTH - this.paddleWidth / 2);
      const dx = target - this.paddleX;
      const speed = Math.min(Math.abs(dx) * 10, B.PADDLE_SPEED * 1.5);
      this.paddleX += Math.sign(dx) * Math.min(speed * dt, Math.abs(dx));
    } else {
      let vx = 0;
      if (this.keys['ArrowLeft'] || this.keys['KeyA']) vx = -B.PADDLE_SPEED;
      if (this.keys['ArrowRight'] || this.keys['KeyD']) vx = B.PADDLE_SPEED;
      this.paddleX += vx * dt;
    }

    this.paddleX = clamp(this.paddleX, this.paddleWidth / 2, GAME_WIDTH - this.paddleWidth / 2);

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

  // ── Ball update ──
  private updateBalls(dt: number) {
    for (let i = this.balls.length - 1; i >= 0; i--) {
      const ball = this.balls[i];

      if (this.ballLaunched) {
        // Safety valve: if ball has near-zero speed, re-launch it
        const speed = Math.sqrt(ball.vx * ball.vx + ball.vy * ball.vy);
        if (speed < 1) {
          const reSpeed = B.BALL_BASE_SPEED * this.getLevelSpeedMult();
          const reAngle = degToRad(B.BALL_LAUNCH_ANGLE_DEG);
          ball.vx = Math.cos(reAngle) * reSpeed;
          ball.vy = Math.sin(reAngle) * reSpeed;
        }

        ball.x += ball.vx * dt;
        ball.y += ball.vy * dt;

        // Wall bouncing (left, right, top)
        if (ball.x - B.BALL_RADIUS < 0) { ball.x = B.BALL_RADIUS; ball.vx = Math.abs(ball.vx); }
        if (ball.x + B.BALL_RADIUS > GAME_WIDTH) { ball.x = GAME_WIDTH - B.BALL_RADIUS; ball.vx = -Math.abs(ball.vx); }
        if (ball.y - B.BALL_RADIUS < 0) { ball.y = B.BALL_RADIUS; ball.vy = Math.abs(ball.vy); }

        // Enforce min vertical
        const curSpeed = Math.sqrt(ball.vx * ball.vx + ball.vy * ball.vy);
        if (curSpeed > 0) {
          const fixed = enforceMinVertical(ball.vx, ball.vy, B.BALL_MIN_VERTICAL_RATIO, curSpeed);
          ball.vx = fixed.vx;
          ball.vy = fixed.vy;
        }
      }

      // Update visual
      this.r.setPos(ball.mesh, ball.x, ball.y);

      // Update trail
      const wp = this.r.toWorld(ball.x, ball.y);
      ball.trailPositions.push(wp.x, wp.y, wp.z);
      if (ball.trailPositions.length > 20 * 3) {
        ball.trailPositions.splice(0, 3);
      }
      this.r.updateBallTrail(ball.trail, ball.trailPositions);

      // Ball lost
      if (ball.y > GAME_HEIGHT + 20) {
        this.removeBall(i);
        if (this.balls.length === 0) {
          this.loseLife();
        }
      }
    }
  }

  private removeBall(index: number) {
    const ball = this.balls[index];
    this.r.remove(ball.mesh);
    this.r.remove(ball.trail);
    this.balls.splice(index, 1);
  }

  // ── Collisions ──
  private updateCollisions() {
    if (!this.ballLaunched) return;

    const paddleY = GAME_HEIGHT - B.PADDLE_Y_OFFSET;

    for (const ball of this.balls) {
      // Ball vs paddle
      if (this.circleRect(ball.x, ball.y, B.BALL_RADIUS,
          this.paddleX, paddleY, this.paddleWidth, B.PADDLE_HEIGHT) && ball.vy > 0) {
        this.handleBallPaddle(ball);
      }

      // Ball vs bricks
      for (const brick of this.bricks) {
        if (!brick.alive) continue;
        if (this.circleRect(ball.x, ball.y, B.BALL_RADIUS,
            brick.x, brick.y, B.BRICK_WIDTH, B.BRICK_HEIGHT)) {
          this.handleBallBrick(ball, brick);
        }
      }

      // Ball vs shield (just below paddle area)
      const shieldY = GAME_HEIGHT - B.PADDLE_Y_OFFSET + B.PADDLE_HEIGHT + 15;
      if (this.shieldActive && ball.y > shieldY && ball.vy > 0) {
        ball.vy = -Math.abs(ball.vy);
        ball.y = shieldY - B.BALL_RADIUS;
        this.r.burst(ball.x, shieldY, 0x44ddff, 8);
        audio.shieldHit();
        this.removeShield();
      }
    }

    // Powerups vs paddle
    for (const pu of this.powerups) {
      if (!pu.alive) continue;
      if (this.rectRect(pu.x, pu.y, 20, 20,
          this.paddleX, paddleY, this.paddleWidth, B.PADDLE_HEIGHT)) {
        this.catchPowerup(pu);
      }
    }

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

  private handleBallPaddle(ball: Ball) {
    const speed = Math.sqrt(ball.vx * ball.vx + ball.vy * ball.vy) || B.BALL_BASE_SPEED;
    const hitPos = clamp((ball.x - this.paddleX) / (this.paddleWidth / 2), -1, 1);
    const angle = degToRad(-90 + hitPos * 55);
    const vel = normalize(Math.cos(angle) * speed, Math.sin(angle) * speed, speed);
    ball.vx = vel.vx;
    ball.vy = vel.vy;

    if (ball.vy > 0) ball.vy = -Math.abs(ball.vy);
    ball.y = GAME_HEIGHT - B.PADDLE_Y_OFFSET - B.PADDLE_HEIGHT / 2 - B.BALL_RADIUS - 1;

    this.r.burst(ball.x, ball.y, 0x44ddff, 6);
    audio.paddleHit();
  }

  private handleBallBrick(ball: Ball, brick: BrickInst) {
    const dx = ball.x - brick.x;
    const dy = ball.y - brick.y;
    const overlapX = B.BRICK_WIDTH / 2 + B.BALL_RADIUS - Math.abs(dx);
    const overlapY = B.BRICK_HEIGHT / 2 + B.BALL_RADIUS - Math.abs(dy);

    if (!this.piercing) {
      if (overlapX < overlapY) {
        ball.vx = Math.abs(ball.vx) * Math.sign(dx);
        ball.x = brick.x + Math.sign(dx) * (B.BRICK_WIDTH / 2 + B.BALL_RADIUS + 1);
      } else {
        ball.vy = Math.abs(ball.vy) * Math.sign(dy);
        ball.y = brick.y + Math.sign(dy) * (B.BRICK_HEIGHT / 2 + B.BALL_RADIUS + 1);
      }
    }

    this.hitBrick(brick);

    // Speed increase
    const speed = Math.sqrt(ball.vx * ball.vx + ball.vy * ball.vy);
    if (speed < B.BALL_SPEED_CAP) {
      const newSpeed = Math.min(speed + B.BALL_SPEED_INCREMENT, B.BALL_SPEED_CAP);
      const norm = normalize(ball.vx, ball.vy, newSpeed);
      ball.vx = norm.vx;
      ball.vy = norm.vy;
    }
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

      // Rug pull — nearby bricks start falling
      if (brick.def.rug) {
        this.r.flash(0x9933ff, 0.25);
        audio.explosion();
        this.r.showCallout(brick.x, brick.y - 15, 'RUG PULLED!', '#9933ff', 18, true);
        for (const other of this.bricks) {
          if (!other.alive || other === brick || other.falling) continue;
          if (other.def.id === 'indestructible') continue;
          const dist = Math.sqrt((other.x - brick.x) ** 2 + (other.y - brick.y) ** 2);
          if (dist < 90) {
            other.falling = true;
            other.fallingVy = 30 + Math.random() * 50;
            const otherCore = other.mesh.children[0] as THREE.LineSegments;
            (otherCore.material as THREE.LineBasicMaterial).color.setHex(0x9933ff);
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
          ball.vx *= 0.6;
          ball.vy *= 0.6;
        }
        this.addTimedEffect(def.id, def.duration / 1000, () => {});
        break;

      case 'gasSpike':
        for (const ball of this.balls) {
          const speed = Math.sqrt(ball.vx * ball.vx + ball.vy * ball.vy);
          const newSpeed = Math.min(speed * 1.4, B.BALL_SPEED_CAP);
          const norm = normalize(ball.vx, ball.vy, newSpeed);
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
      const speed = Math.sqrt(ball.vx * ball.vx + ball.vy * ball.vy);
      const newSpeed = Math.min(speed * 1.2, B.BALL_SPEED_CAP);
      const norm = normalize(ball.vx, ball.vy, newSpeed);
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

      // Falling bricks (from rug pull)
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

    const remaining = this.bricks.filter(b => b.alive && (b.def.destructible || b.def.stable) && !b.falling);
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
