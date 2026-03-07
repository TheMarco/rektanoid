import * as THREE from 'three';
import { Renderer } from './Renderer';
import { animateBackground as animateBackgroundFx, buildBackground } from './Background';
import { GAME_WIDTH, GAME_HEIGHT } from './constants';
import { BRICK_TYPES } from './data/brickTypes';
import { POWERUP_TYPES, POSITIVE_POWERUPS, NEGATIVE_POWERUPS } from './data/powerups';
import { LEVEL_ORDER } from './data/levelOrder';
import { SentimentState } from './types/SentimentState';
import type { BrickDefinition } from './types/BrickDefinition';
import type { PowerupDefinition } from './types/PowerupDefinition';
import { clamp, enforceMinVertical, normalize, degToRad } from './utils/math';
import { chance } from './utils/random';
import * as B from './data/balance';
import { audio } from './systems/AudioSystem';

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
          this.setupLevel();
        }
        if (e.code === 'BracketLeft') {
          this.currentLevel = (this.currentLevel - 1 + LEVEL_ORDER.length) % LEVEL_ORDER.length;
          this.setupLevel();
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
        <h1 style="color:#00ff88;font-size:52px;font-family:monospace;text-shadow:0 0 30px #00ff88, 0 0 60px #00ff88;margin-bottom:8px;letter-spacing:6px">REKTANOID</h1>
        <p style="color:#44ddff;font-size:14px;font-family:monospace;margin-bottom:4px">BREAK BLOCKS. PUMP BAGS. GET REKT.</p>
        <p style="color:#334455;font-size:11px;font-family:monospace;margin-bottom:30px">NFA &bull; DYOR &bull; WAGMI</p>
        <p style="color:#888;font-size:12px;font-family:monospace;margin-bottom:20px">Arrow keys / Mouse to move &bull; Space / Click to launch</p>
        <p style="color:#ffaa00;font-size:16px;font-family:monospace;animation:pulse 1.5s infinite">APE IN (SPACE / CLICK)</p>
      </div>
    `);
  }

  private startGame() {
    this.clearAll();
    this.score = 0;
    this.lives = B.STARTING_LIVES;
    this.comboCount = 0;
    this.comboTimer = 0;
    this.currentLevel = 0;
    this.sentimentValue = B.SENTIMENT_START;
    this.sentimentState = SentimentState.Neutral;
    this.piercing = false;
    this.laserActive = false;
    this.levelClearing = false;
    this.gameTime = 0;

    this.r.hideOverlay();
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

    // Bricks
    this.loadLevel(this.currentLevel);

    // Stage intro
    this.showStageIntro();
  }

  private showStageIntro() {
    const level = LEVEL_ORDER[this.currentLevel];
    if (!level) return;

    this.state = 'stage-intro';
    this.r.showOverlay(`
      <div style="text-align:center;pointer-events:none">
        <h2 style="color:#00ff88;font-size:28px;font-family:monospace;text-shadow:0 0 30px #00ff88, 0 0 60px #00ff88">${level.name.toUpperCase()}</h2>
        <p style="color:#44ddff;font-size:14px;font-family:monospace;margin-top:8px;text-shadow:0 0 15px #44ddff">${level.flavorText}</p>
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
    audio.gameOver();
    const bagVal = (this.score * 100 + 10000).toLocaleString();
    this.r.showOverlay(`
      <div style="text-align:center;background:radial-gradient(ellipse at center, rgba(10,0,0,0.85) 0%, rgba(4,0,2,0.95) 100%);width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center">
        <h2 style="color:#ff2222;font-size:42px;font-family:monospace;text-shadow:0 0 30px #ff2222, 0 0 60px #ff2222">REKT</h2>
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
    audio.levelClear();
    const moonVal = (this.score * 100 + 10000).toLocaleString();
    const returnPct = (this.score * 0.8).toFixed(0);
    this.r.showOverlay(`
      <div style="text-align:center;background:radial-gradient(ellipse at center, rgba(10,8,0,0.85) 0%, rgba(4,3,0,0.95) 100%);width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center">
        <h2 style="color:#ffaa00;font-size:42px;font-family:monospace;text-shadow:0 0 30px #ffaa00, 0 0 60px #ffaa00">WE'RE ALL GONNA MAKE IT</h2>
        <p style="color:#00ff88;font-size:14px;font-family:monospace;margin:8px 0">BAGS MOONED</p>
        <p style="color:#00ff88;font-size:26px;font-family:monospace;margin:8px 0">$${moonVal}</p>
        <p style="color:#00ff88;font-size:14px;font-family:monospace">+${returnPct}% UNREALIZED GAINS</p>
        <p style="color:#44ddff;font-size:14px;font-family:monospace;margin-top:20px;animation:pulse 1.5s infinite">PRESS SPACE TO APE BACK IN</p>
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
    this.ballLaunched = false;
    return ball;
  }

  private launchBall() {
    if (this.ballLaunched) return;
    this.ballLaunched = true;
    const ball = this.balls[0];
    if (!ball) return;
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

        this.bricks.push({ def, hp: def.hp, x, y, alive: true, mesh });
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
      this.updatePaddle(dt);
      this.updateBalls(dt);
      this.updateCollisions();
      this.updatePowerups(dt);
      this.updateLasers(dt);
      this.updateHazards(dt);
      this.updateCombo(dt);
      this.updateEffects();
      this.updateHUD();
      this.checkLevelClear();
    }

    // Animate background models
    this.animateBackground(now);

    // Update particles
    this.r.updateParticles(dt);

    // Render
    this.r.render();
  };

  private animateBackground(now: number) {
    for (const child of this.r.bgGroup.children) {
      if (child instanceof THREE.Group) {
        animateBackgroundFx(child, now);
      }
    }
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

    // Keep docked ball following paddle
    if (!this.ballLaunched && this.balls.length > 0) {
      this.balls[0].x = this.paddleX;
    }
  }

  // ── Ball update ──
  private updateBalls(dt: number) {
    const paddleY = GAME_HEIGHT - B.PADDLE_Y_OFFSET;

    for (let i = this.balls.length - 1; i >= 0; i--) {
      const ball = this.balls[i];

      if (this.ballLaunched) {
        ball.x += ball.vx * dt;
        ball.y += ball.vy * dt;

        // Wall bouncing (left, right, top)
        if (ball.x - B.BALL_RADIUS < 0) { ball.x = B.BALL_RADIUS; ball.vx = Math.abs(ball.vx); }
        if (ball.x + B.BALL_RADIUS > GAME_WIDTH) { ball.x = GAME_WIDTH - B.BALL_RADIUS; ball.vx = -Math.abs(ball.vx); }
        if (ball.y - B.BALL_RADIUS < 0) { ball.y = B.BALL_RADIUS; ball.vy = Math.abs(ball.vy); }

        // Enforce min vertical
        const speed = Math.sqrt(ball.vx * ball.vx + ball.vy * ball.vy);
        if (speed > 0) {
          const fixed = enforceMinVertical(ball.vx, ball.vy, B.BALL_MIN_VERTICAL_RATIO, speed);
          ball.vx = fixed.vx;
          ball.vy = fixed.vy;
        }
      }

      // Update visual
      this.r.setPos(ball.mesh, ball.x, ball.y);

      // Update trail
      const wp = this.r.toWorld(ball.x, ball.y);
      ball.trailPositions.push(wp.x, wp.y, wp.z);
      if (ball.trailPositions.length > 60 * 3) {
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

      // Ball vs shield
      if (this.shieldActive && ball.y > GAME_HEIGHT - 15 && ball.vy > 0) {
        ball.vy = -Math.abs(ball.vy);
        ball.y = GAME_HEIGHT - 15 - B.BALL_RADIUS;
        this.r.burst(ball.x, GAME_HEIGHT - 10, 0x44ddff, 8);
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
    brick.hp--;
    this.r.burst(brick.x, brick.y, brick.def.color, 8);
    audio.brickHit();

    if (brick.hp <= 0 && brick.def.destructible) {
      brick.alive = false;
      this.r.remove(brick.mesh);
      this.r.shards(brick.x, brick.y, brick.def.color);
      audio.brickDestroy();

      // Score
      const multiplier = 1 + this.comboCount * B.SCORE_COMBO_MULTIPLIER +
        (this.sentimentState === SentimentState.Bull ? B.SENTIMENT_BULL_SCORE_BONUS - 1 : 0);
      this.score += Math.floor(brick.def.score * multiplier);

      // Combo
      this.comboCount++;
      this.comboTimer = B.COMBO_WINDOW_MS / 1000;
      if (this.comboCount >= 3 && this.comboCount % 3 === 0) {
        audio.comboHit(this.comboCount);
      }

      // Crypto callouts
      if (this.comboCount === 3) {
        this.r.showCallout(brick.x, brick.y - 20, 'PUMP IT!', '#ffaa00', 20);
      } else if (this.comboCount === 5) {
        this.r.showCallout(brick.x, brick.y - 20, 'TO THE MOON!', '#00ff88', 24);
      } else if (this.comboCount === 8) {
        this.r.showCallout(brick.x, brick.y - 20, 'WHALE ALERT!', '#44ddff', 28);
      } else if (this.comboCount === 12) {
        this.r.showCallout(brick.x, brick.y - 20, 'DIAMOND HANDS!', '#88eeff', 32);
      } else if (this.comboCount >= 15 && this.comboCount % 5 === 0) {
        this.r.showCallout(brick.x, brick.y - 20, 'UNSTOPPABLE!', '#ff44ff', 36);
      }

      // Sentiment
      if (brick.def.sentimentDelta !== 0) this.adjustSentiment(brick.def.sentimentDelta);
      if (this.comboCount >= 3) this.adjustSentiment(B.SENTIMENT_COMBO_BOOST);

      // Powerup drop
      if (chance(brick.def.dropChance)) this.spawnPowerup(brick.x, brick.y);

      // Explosive
      if (brick.def.explosive) {
        this.r.flash(0xff4400, 0.5);
        audio.explosion();
        for (const other of this.bricks) {
          if (!other.alive || other === brick || !other.def.destructible) continue;
          const dist = Math.sqrt((other.x - brick.x) ** 2 + (other.y - brick.y) ** 2);
          if (dist < 70) {
            setTimeout(() => this.hitBrick(other), 100);
          }
        }
      }
    } else if (brick.alive) {
      this.r.updateBrickDamage(brick.mesh, brick.hp, brick.def.hp);
    }
  }

  // ── Powerups ──
  private spawnPowerup(x: number, y: number) {
    const usePositive = this.sentimentState === SentimentState.Bull ? chance(0.8) :
                        this.sentimentState === SentimentState.Bear ? chance(0.4) : chance(0.65);
    const pool = usePositive ? POSITIVE_POWERUPS : NEGATIVE_POWERUPS;
    const def = pool[Math.floor(Math.random() * pool.length)];

    const mesh = this.r.makePowerup(def.color);
    this.r.scene.add(mesh);
    this.r.setPos(mesh, x, y);

    this.powerups.push({ def, x, y, vy: B.POWERUP_FALL_SPEED, alive: true, mesh });
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
      pu.def.name.toUpperCase(), colorStr, pu.def.positive ? 22 : 18);
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
          this.r.flash(0x00ff88, 0.6);
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
    this.r.setPos(this.shieldMesh, GAME_WIDTH / 2, GAME_HEIGHT - 10);
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
    const spawnChance = this.sentimentState === SentimentState.Bear
      ? (0.003 + this.currentLevel * 0.001) * 60 * dt
      : this.currentLevel >= 5 ? 0.001 * 60 * dt : 0;

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
    this.r.flash(0xff2222, 0.4);
    this.r.burst(this.paddleX, GAME_HEIGHT - B.PADDLE_Y_OFFSET, 0xff2222, 10);
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
    const prev = this.sentimentState;
    if (this.sentimentValue >= B.SENTIMENT_BULL_THRESHOLD) this.sentimentState = SentimentState.Bull;
    else if (this.sentimentValue <= B.SENTIMENT_BEAR_THRESHOLD) this.sentimentState = SentimentState.Bear;
    else this.sentimentState = SentimentState.Neutral;

    if (prev !== this.sentimentState) {
      const color = this.sentimentState === SentimentState.Bull ? 0x00ff88 :
                    this.sentimentState === SentimentState.Bear ? 0xff2222 : 0xffaa00;
      this.r.flash(color, 0.4);
      audio.sentimentShift(this.sentimentState === SentimentState.Bull ? 'bull' : 'bear');
      if (this.sentimentState === SentimentState.Bull) {
        this.r.showCallout(GAME_WIDTH / 2, GAME_HEIGHT / 2, 'BULL MARKET!', '#00ff88', 30);
      } else if (this.sentimentState === SentimentState.Bear) {
        this.r.showCallout(GAME_WIDTH / 2, GAME_HEIGHT / 2, 'BEAR MARKET!', '#ff2222', 30);
      }
    }
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
    this.r.flash(0xff2222, 0.6);
    audio.lifeLost();
  }

  // ── Level progression ──
  private checkLevelClear() {
    if (this.levelClearing) return;
    const remaining = this.bricks.filter(b => b.alive && b.def.destructible);
    if (remaining.length === 0 && this.bricks.length > 0) {
      this.levelClearing = true;
      this.score += B.SCORE_LEVEL_CLEAR_BONUS;
      this.score += this.lives * B.SCORE_LIFE_PRESERVATION_BONUS;
      this.r.flash(0xffaa00, 0.8);
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
    const sentLabels: Record<SentimentState, string> = {
      [SentimentState.Bull]: 'BULL',
      [SentimentState.Neutral]: 'NEUTRAL',
      [SentimentState.Bear]: 'BEAR',
    };
    const sentColors: Record<SentimentState, string> = {
      [SentimentState.Bull]: '#00ff44',
      [SentimentState.Neutral]: '#888888',
      [SentimentState.Bear]: '#ff2222',
    };

    const effectLabels = this.activeEffects
      .map(e => {
        const def = POWERUP_TYPES[e.id];
        const remaining = Math.ceil(e.expiresAt - this.gameTime);
        return `${def?.label || e.id}:${remaining}s`;
      });

    const level = LEVEL_ORDER[this.currentLevel];
    this.r.updateHUD({
      score: this.score,
      lives: this.lives,
      combo: this.comboCount,
      sentiment: sentLabels[this.sentimentState],
      sentimentColor: sentColors[this.sentimentState],
      stage: level?.name || '',
      effects: effectLabels.join('  '),
    });
  }

  // ── Helpers ──
  private getLevelSpeedMult(): number {
    const level = LEVEL_ORDER[this.currentLevel];
    return level ? level.speedMultiplier : 1;
  }
}
