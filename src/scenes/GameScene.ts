import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT } from '../gameConfig';
import { buildBackgroundLayer } from '../rendering/builders/buildBackgroundLayer';
import { buildPaddleVisual } from '../rendering/builders/buildPaddleVisual';
import { buildBallVisual } from '../rendering/builders/buildBallVisual';
import { buildBrickVisual } from '../rendering/builders/buildBrickVisual';
import { buildPowerupVisual } from '../rendering/builders/buildPowerupVisual';
import { buildSentimentMeter } from '../rendering/builders/buildSentimentMeter';
import { createImpactBurst } from '../rendering/effects/createImpactBurst';
import { createBrickShards } from '../rendering/effects/createBrickShards';
import { createBallTrail } from '../rendering/effects/createBallTrail';
import { createGlowFlash } from '../rendering/effects/createGlowFlash';
import { createComboBurst } from '../rendering/effects/createComboBurst';
import { createWarningPulse } from '../rendering/effects/createWarningPulse';
import { COL_GREEN, COL_RED, COL_GOLD, COL_CYAN, COL_GRAY } from '../rendering/colorTokens';
import { SentimentState } from '../types/SentimentState';
import { BRICK_TYPES } from '../data/brickTypes';
import { POWERUP_TYPES, POSITIVE_POWERUPS, NEGATIVE_POWERUPS } from '../data/powerups';
import { LEVEL_ORDER } from '../data/levelOrder';
import type { BrickDefinition } from '../types/BrickDefinition';
import type { PowerupDefinition } from '../types/PowerupDefinition';
import type { LevelDefinition } from '../types/LevelDefinition';
import { clamp, enforceMinVertical, normalize, degToRad } from '../utils/math';
import { chance, weightedPick } from '../utils/random';
import { saveValue, loadValue } from '../utils/storage';
import * as B from '../data/balance';
import { audio } from '../systems/AudioSystem';

// ── Brick Instance ──
interface BrickInstance {
  def: BrickDefinition;
  hp: number;
  x: number;
  y: number;
  graphics: Phaser.GameObjects.Graphics;
  zone: Phaser.GameObjects.Zone;
  alive: boolean;
}

// ── Powerup Instance ──
interface PowerupInstance {
  def: PowerupDefinition;
  graphics: Phaser.GameObjects.Graphics;
  label: Phaser.GameObjects.Text;
  zone: Phaser.GameObjects.Zone;
  alive: boolean;
}

// ── Active Effect ──
interface ActiveEffect {
  id: string;
  expiresAt: number;
}

export class GameScene extends Phaser.Scene {
  // ── Input ──
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private keyA!: Phaser.Input.Keyboard.Key;
  private keyD!: Phaser.Input.Keyboard.Key;

  // ── Paddle ──
  private paddleContainer!: Phaser.GameObjects.Container;
  private paddleGraphics!: Phaser.GameObjects.Graphics;
  private paddleWidth = B.PADDLE_WIDTH;
  private paddleBody!: Phaser.Physics.Arcade.Body;

  // ── Ball ──
  private balls: Phaser.GameObjects.Container[] = [];
  private ballTrails: ReturnType<typeof createBallTrail>[] = [];
  private ballLaunched = false;

  // ── Bricks ──
  private bricks: BrickInstance[] = [];

  // ── Powerups ──
  private activePowerups: PowerupInstance[] = [];
  private activeEffects: ActiveEffect[] = [];

  // ── Shield ──
  private shieldGraphics: Phaser.GameObjects.Graphics | null = null;

  // ── Laser ──
  private laserActive = false;
  private lastLaserTime = 0;
  private laserProjectiles: Phaser.GameObjects.Container[] = [];

  // ── Mouse ──
  private useMouseControl = false;

  // ── Hazards ──
  private hazardObjects: { graphics: Phaser.GameObjects.Graphics; zone: Phaser.GameObjects.Zone; vy: number }[] = [];

  // ── State ──
  private score = 0;
  private lives = B.STARTING_LIVES;
  private comboCount = 0;
  private comboTimer = 0;
  private currentLevel = 0;
  private sentimentValue = B.SENTIMENT_START;
  private sentimentState = SentimentState.Neutral;
  private piercing = false;

  // ── Background ──
  private bgGraphics: Phaser.GameObjects.Graphics | null = null;

  // ── HUD ──
  private scoreText!: Phaser.GameObjects.Text;
  private livesText!: Phaser.GameObjects.Text;
  private comboText!: Phaser.GameObjects.Text;
  private sentimentText!: Phaser.GameObjects.Text;
  private sentimentMeterGraphics: Phaser.GameObjects.Graphics | null = null;
  private stageText!: Phaser.GameObjects.Text;
  private effectsText!: Phaser.GameObjects.Text;

  constructor() {
    super('GameScene');
  }

  create() {
    // Reset state
    this.score = 0;
    this.lives = B.STARTING_LIVES;
    this.comboCount = 0;
    this.comboTimer = 0;
    this.currentLevel = 0;
    this.sentimentValue = B.SENTIMENT_START;
    this.sentimentState = SentimentState.Neutral;
    this.activeEffects = [];
    this.laserActive = false;
    this.piercing = false;
    this.bricks = [];
    this.activePowerups = [];
    this.balls = [];
    this.ballTrails = [];
    this.laserProjectiles = [];
    this.shieldGraphics = null;
    this.levelClearing = false;
    this.useMouseControl = false;
    this.hazardObjects = [];

    // Background
    this.bgGraphics = buildBackgroundLayer(this, this.currentLevel);

    // Disable bottom world bounds so balls can fall out
    this.physics.world.setBoundsCollision(true, true, true, false);

    // Input
    this.cursors = this.input.keyboard!.createCursorKeys();
    this.keyA = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.A);
    this.keyD = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.D);
    this.input.keyboard!.on('keydown-ESC', () => {
      this.scene.pause();
      this.scene.launch('PauseOverlay');
    });
    this.input.keyboard!.on('keydown-SPACE', () => this.launchBall());

    // Mouse/pointer input
    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      this.useMouseControl = true;
    });
    this.input.on('pointerdown', () => {
      this.launchBall();
    });

    // Create paddle
    this.createPaddle();

    // Create ball
    this.createBall();

    // Create HUD
    this.createHud();

    // Load level
    this.loadLevel(this.currentLevel);

    // Show stage intro
    this.showStageIntro(LEVEL_ORDER[this.currentLevel]);
  }

  // ── Paddle ──
  private createPaddle() {
    this.paddleWidth = B.PADDLE_WIDTH;
    this.paddleGraphics = buildPaddleVisual(this, this.paddleWidth);
    this.paddleContainer = this.add.container(
      GAME_WIDTH / 2,
      GAME_HEIGHT - B.PADDLE_Y_OFFSET,
      [this.paddleGraphics],
    );
    this.physics.world.enable(this.paddleContainer);
    this.paddleBody = this.paddleContainer.body as Phaser.Physics.Arcade.Body;
    this.paddleBody.setImmovable(true);
    this.paddleBody.setSize(this.paddleWidth, B.PADDLE_HEIGHT);
    this.paddleBody.setOffset(-this.paddleWidth / 2, -B.PADDLE_HEIGHT / 2);
    this.paddleBody.setCollideWorldBounds(true);
  }

  private rebuildPaddle() {
    this.paddleGraphics.destroy();
    this.paddleGraphics = buildPaddleVisual(this, this.paddleWidth);
    this.paddleContainer.add(this.paddleGraphics);
    this.paddleBody.setSize(this.paddleWidth, B.PADDLE_HEIGHT);
    this.paddleBody.setOffset(-this.paddleWidth / 2, -B.PADDLE_HEIGHT / 2);
  }

  // ── Ball ──
  private createBall(): Phaser.GameObjects.Container {
    const ballG = buildBallVisual(this);
    const ball = this.add.container(0, 0, [ballG]);
    ball.setDepth(5);
    this.physics.world.enable(ball);
    const body = ball.body as Phaser.Physics.Arcade.Body;
    body.setCircle(B.BALL_RADIUS);
    body.setOffset(-B.BALL_RADIUS, -B.BALL_RADIUS);
    body.setBounce(1, 1);
    body.setCollideWorldBounds(true);
    body.onWorldBounds = true;

    // Dock to paddle
    this.dockBallToPaddle(ball);

    this.balls.push(ball);
    const trail = createBallTrail(this);
    this.ballTrails.push(trail);

    return ball;
  }

  private dockBallToPaddle(ball: Phaser.GameObjects.Container) {
    ball.setPosition(
      this.paddleContainer.x,
      this.paddleContainer.y - B.PADDLE_HEIGHT / 2 - B.BALL_RADIUS - 2,
    );
    const body = ball.body as Phaser.Physics.Arcade.Body;
    body.setVelocity(0, 0);
    this.ballLaunched = false;
  }

  private launchBall() {
    if (this.ballLaunched) return;
    this.ballLaunched = true;
    const ball = this.balls[0];
    if (!ball) return;
    const speed = B.BALL_BASE_SPEED * this.getLevelSpeedMult();
    const angle = degToRad(B.BALL_LAUNCH_ANGLE_DEG);
    const body = ball.body as Phaser.Physics.Arcade.Body;
    body.setVelocity(
      Math.cos(angle) * speed,
      Math.sin(angle) * speed,
    );
  }

  // ── Bricks ──
  private loadLevel(index: number) {
    // Clean up old bricks
    for (const b of this.bricks) {
      b.graphics.destroy();
      b.zone.destroy();
    }
    this.bricks = [];

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

        const graphics = buildBrickVisual(this, def, def.hp);
        graphics.setPosition(x, y);
        graphics.setDepth(2);

        const zone = this.add.zone(x, y, B.BRICK_WIDTH, B.BRICK_HEIGHT);
        this.physics.world.enable(zone, Phaser.Physics.Arcade.STATIC_BODY);

        this.bricks.push({
          def,
          hp: def.hp,
          x,
          y,
          graphics,
          zone,
          alive: true,
        });
      }
    }
  }

  // ── HUD ──
  private createHud() {
    const hudY = GAME_HEIGHT - 22;
    const style: Phaser.Types.GameObjects.Text.TextStyle = {
      fontFamily: 'monospace',
      fontSize: '13px',
      color: '#00ff88',
    };

    this.scoreText = this.add.text(10, hudY, 'SCORE: 0', style).setDepth(20);
    this.livesText = this.add.text(200, hudY, `LIVES: ${this.lives}`, { ...style, color: '#44ddff' }).setDepth(20);
    this.comboText = this.add.text(320, hudY, '', { ...style, color: '#ffaa00' }).setDepth(20);
    this.stageText = this.add.text(GAME_WIDTH - 10, hudY, '', { ...style, color: '#888888' }).setOrigin(1, 0).setDepth(20);
    this.sentimentText = this.add.text(450, hudY, 'MKT: NEUTRAL', { ...style, color: '#888888' }).setDepth(20);
    this.effectsText = this.add.text(10, GAME_HEIGHT - 40, '', { ...style, fontSize: '10px', color: '#44ddff' }).setDepth(20);

    // Sentiment meter
    this.updateSentimentMeter();
    this.updateStageText();
  }

  private updateHud() {
    this.scoreText.setText(`SCORE: ${this.score.toLocaleString()}`);
    this.livesText.setText(`LIVES: ${this.lives}`);

    if (this.comboCount > 1) {
      this.comboText.setText(`COMBO x${this.comboCount}`);
      this.comboText.setAlpha(1);
    } else {
      this.comboText.setAlpha(0);
    }

    const sentColors: Record<SentimentState, string> = {
      [SentimentState.Bull]: '#00ff44',
      [SentimentState.Neutral]: '#888888',
      [SentimentState.Bear]: '#ff2222',
    };
    const sentLabels: Record<SentimentState, string> = {
      [SentimentState.Bull]: 'BULL',
      [SentimentState.Neutral]: 'NEUTRAL',
      [SentimentState.Bear]: 'BEAR',
    };
    this.sentimentText.setText(`MKT: ${sentLabels[this.sentimentState]}`);
    this.sentimentText.setColor(sentColors[this.sentimentState]);

    // Active effects display
    const now = this.time.now;
    const effectLabels = this.activeEffects
      .filter(e => e.expiresAt > now)
      .map(e => {
        const def = POWERUP_TYPES[e.id];
        const remaining = Math.ceil((e.expiresAt - now) / 1000);
        return `${def?.label || e.id}:${remaining}s`;
      });
    this.effectsText.setText(effectLabels.join('  '));
  }

  private updateSentimentMeter() {
    if (this.sentimentMeterGraphics) this.sentimentMeterGraphics.destroy();
    this.sentimentMeterGraphics = buildSentimentMeter(this, this.sentimentValue, this.sentimentState);
    this.sentimentMeterGraphics.setPosition(GAME_WIDTH - 140, 10);
    this.sentimentMeterGraphics.setDepth(20);
  }

  private updateStageText() {
    const level = LEVEL_ORDER[this.currentLevel];
    if (level) {
      this.stageText.setText(`${level.name}`);
    }
  }

  // ── Stage Intro ──
  private showStageIntro(level: LevelDefinition) {
    const nameText = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 30, level.name.toUpperCase(), {
      fontFamily: 'monospace',
      fontSize: '28px',
      color: '#00ff88',
    }).setOrigin(0.5).setDepth(100).setAlpha(0);

    const flavorText = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 10, level.flavorText, {
      fontFamily: 'monospace',
      fontSize: '14px',
      color: '#44ddff',
    }).setOrigin(0.5).setDepth(100).setAlpha(0);

    this.tweens.add({
      targets: [nameText, flavorText],
      alpha: 1,
      duration: 400,
      hold: 1500,
      yoyo: true,
      onComplete: () => {
        nameText.destroy();
        flavorText.destroy();
      },
    });
  }

  // ── Main Update ──
  update(_time: number, delta: number) {
    this.updatePaddle(delta);
    this.updateBalls(delta);
    this.updateCollisions();
    this.updatePowerups(delta);
    this.updateLasers(delta);
    this.updateHazards(delta);
    this.updateCombo(delta);
    this.updateEffects();
    this.updateHud();
    this.checkLevelClear();
  }

  // ── Paddle Movement ──
  private updatePaddle(_delta: number) {
    // Keyboard resets mouse mode
    if (this.cursors.left.isDown || this.cursors.right.isDown || this.keyA.isDown || this.keyD.isDown) {
      this.useMouseControl = false;
    }

    if (this.useMouseControl) {
      const pointer = this.input.activePointer;
      const targetX = clamp(pointer.x, this.paddleWidth / 2, GAME_WIDTH - this.paddleWidth / 2);
      const dx = targetX - this.paddleContainer.x;
      // Smooth follow with high responsiveness
      const speed = Math.min(Math.abs(dx) * 10, B.PADDLE_SPEED * 1.5);
      this.paddleBody.setVelocityX(dx > 1 ? speed : dx < -1 ? -speed : 0);
    } else {
      let vx = 0;
      if (this.cursors.left.isDown || this.keyA.isDown) vx = -B.PADDLE_SPEED;
      if (this.cursors.right.isDown || this.keyD.isDown) vx = B.PADDLE_SPEED;
      this.paddleBody.setVelocityX(vx);
    }

    // Keep docked ball following paddle
    if (!this.ballLaunched && this.balls.length > 0) {
      const ball = this.balls[0];
      ball.x = this.paddleContainer.x;
    }
  }

  // ── Ball Update ──
  private updateBalls(_delta: number) {
    for (let i = this.balls.length - 1; i >= 0; i--) {
      const ball = this.balls[i];
      const body = ball.body as Phaser.Physics.Arcade.Body;

      // Update trail
      if (this.ballTrails[i]) {
        this.ballTrails[i].update(ball.x, ball.y);
      }

      // Enforce minimum vertical component
      if (this.ballLaunched) {
        const speed = Math.sqrt(body.velocity.x ** 2 + body.velocity.y ** 2);
        if (speed > 0) {
          const fixed = enforceMinVertical(body.velocity.x, body.velocity.y, B.BALL_MIN_VERTICAL_RATIO, speed);
          body.setVelocity(fixed.vx, fixed.vy);
        }
      }

      // Check ball lost (fell below screen)
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
    ball.destroy();
    if (this.ballTrails[index]) {
      this.ballTrails[index].destroy();
    }
    this.balls.splice(index, 1);
    this.ballTrails.splice(index, 1);
  }

  // ── Collisions ──
  private updateCollisions() {
    // Ball vs paddle
    for (const ball of this.balls) {
      this.physics.overlap(ball, this.paddleContainer, () => {
        this.handleBallPaddleCollision(ball);
      });
    }

    // Ball vs bricks
    for (const ball of this.balls) {
      for (const brick of this.bricks) {
        if (!brick.alive) continue;
        this.physics.overlap(ball, brick.zone, () => {
          this.handleBallBrickCollision(ball, brick);
        });
      }
    }

    // Powerups vs paddle
    for (const pu of this.activePowerups) {
      if (!pu.alive) continue;
      this.physics.overlap(pu.zone, this.paddleContainer, () => {
        this.catchPowerup(pu);
      });
    }

    // Laser vs bricks
    for (let li = this.laserProjectiles.length - 1; li >= 0; li--) {
      const laser = this.laserProjectiles[li];
      for (const brick of this.bricks) {
        if (!brick.alive) continue;
        this.physics.overlap(laser, brick.zone, () => {
          this.hitBrick(brick);
          laser.destroy();
          this.laserProjectiles.splice(li, 1);
        });
      }
    }
  }

  private handleBallPaddleCollision(ball: Phaser.GameObjects.Container) {
    const body = ball.body as Phaser.Physics.Arcade.Body;
    const speed = Math.sqrt(body.velocity.x ** 2 + body.velocity.y ** 2) || B.BALL_BASE_SPEED;

    // Calculate reflect angle based on where ball hits paddle
    const hitPos = (ball.x - this.paddleContainer.x) / (this.paddleWidth / 2);
    const clamped = clamp(hitPos, -1, 1);

    // Map paddle position to angle: -60 to -120 degrees (left to right spread)
    const angle = degToRad(-90 + clamped * 55);
    const vel = normalize(Math.cos(angle) * speed, Math.sin(angle) * speed, speed);
    body.setVelocity(vel.vx, vel.vy);

    // Ensure ball moves upward
    if (body.velocity.y > 0) {
      body.setVelocityY(-Math.abs(body.velocity.y));
    }

    // Push ball above paddle to prevent sticking
    ball.y = this.paddleContainer.y - B.PADDLE_HEIGHT / 2 - B.BALL_RADIUS - 1;

    createImpactBurst(this, ball.x, ball.y, COL_CYAN, 0.5);
    audio.paddleHit();
  }

  private handleBallBrickCollision(ball: Phaser.GameObjects.Container, brick: BrickInstance) {
    const body = ball.body as Phaser.Physics.Arcade.Body;

    // Reflect ball (simple: invert Y)
    // Determine which side was hit for better reflection
    const dx = ball.x - brick.x;
    const dy = ball.y - brick.y;
    const overlapX = B.BRICK_WIDTH / 2 + B.BALL_RADIUS - Math.abs(dx);
    const overlapY = B.BRICK_HEIGHT / 2 + B.BALL_RADIUS - Math.abs(dy);

    if (!this.piercing) {
      if (overlapX < overlapY) {
        body.setVelocityX(Math.abs(body.velocity.x) * Math.sign(dx));
        ball.x = brick.x + Math.sign(dx) * (B.BRICK_WIDTH / 2 + B.BALL_RADIUS + 1);
      } else {
        body.setVelocityY(Math.abs(body.velocity.y) * Math.sign(dy));
        ball.y = brick.y + Math.sign(dy) * (B.BRICK_HEIGHT / 2 + B.BALL_RADIUS + 1);
      }
    }

    this.hitBrick(brick);

    // Slight speed increase
    const speed = Math.sqrt(body.velocity.x ** 2 + body.velocity.y ** 2);
    if (speed < B.BALL_SPEED_CAP) {
      const newSpeed = speed + B.BALL_SPEED_INCREMENT;
      const norm = normalize(body.velocity.x, body.velocity.y, Math.min(newSpeed, B.BALL_SPEED_CAP));
      body.setVelocity(norm.vx, norm.vy);
    }
  }

  private hitBrick(brick: BrickInstance) {
    if (!brick.alive) return;

    brick.hp--;
    createImpactBurst(this, brick.x, brick.y, brick.def.color, 0.7);
    audio.brickHit();

    if (brick.hp <= 0 && brick.def.destructible) {
      brick.alive = false;
      brick.graphics.destroy();
      (brick.zone.body as Phaser.Physics.Arcade.StaticBody).enable = false;

      // Effects
      createBrickShards(this, brick.x, brick.y, brick.def.color);
      audio.brickDestroy();

      // Score
      const multiplier = 1 + this.comboCount * B.SCORE_COMBO_MULTIPLIER +
        (this.sentimentState === SentimentState.Bull ? B.SENTIMENT_BULL_SCORE_BONUS - 1 : 0);
      this.score += Math.floor(brick.def.score * multiplier);

      // Combo
      this.comboCount++;
      this.comboTimer = B.COMBO_WINDOW_MS;
      if (this.comboCount >= 3 && this.comboCount % 3 === 0) {
        createComboBurst(this, brick.x, brick.y, this.comboCount);
        audio.comboHit(this.comboCount);
      }

      // Sentiment
      if (brick.def.sentimentDelta !== 0) {
        this.adjustSentiment(brick.def.sentimentDelta);
      }
      // Combo also boosts sentiment slightly
      if (this.comboCount >= 3) {
        this.adjustSentiment(B.SENTIMENT_COMBO_BOOST);
      }

      // Powerup drop
      if (chance(brick.def.dropChance)) {
        this.spawnPowerup(brick.x, brick.y);
      }

      // Explosive chain
      if (brick.def.explosive) {
        createWarningPulse(this, brick.x, brick.y, 50);
        audio.explosion();
        for (const other of this.bricks) {
          if (!other.alive) continue;
          const dist = Math.sqrt((other.x - brick.x) ** 2 + (other.y - brick.y) ** 2);
          if (dist < 70 && other !== brick && other.def.destructible) {
            this.time.delayedCall(100, () => this.hitBrick(other));
          }
        }
      }
    } else if (brick.alive) {
      // Update visual for damage
      brick.graphics.destroy();
      brick.graphics = buildBrickVisual(this, brick.def, brick.hp);
      brick.graphics.setPosition(brick.x, brick.y);
      brick.graphics.setDepth(2);
    }
  }

  // ── Powerup System ──
  private spawnPowerup(x: number, y: number) {
    // Choose powerup based on sentiment
    const usePositive = this.sentimentState === SentimentState.Bull ? chance(0.8) :
                        this.sentimentState === SentimentState.Bear ? chance(0.4) :
                        chance(0.65);
    const pool = usePositive ? POSITIVE_POWERUPS : NEGATIVE_POWERUPS;
    const def = pool[Math.floor(Math.random() * pool.length)];

    const graphics = buildPowerupVisual(this, def);
    graphics.setPosition(x, y);
    graphics.setDepth(4);

    const label = this.add.text(x, y, def.label, {
      fontFamily: 'monospace',
      fontSize: '8px',
      color: def.positive ? '#00ff88' : '#ff4444',
    }).setOrigin(0.5).setDepth(5);

    const zone = this.add.zone(x, y, 36, 16);
    this.physics.world.enable(zone);
    const body = zone.body as Phaser.Physics.Arcade.Body;
    body.setVelocityY(B.POWERUP_FALL_SPEED);

    const pu: PowerupInstance = { def, graphics, label, zone, alive: true };
    this.activePowerups.push(pu);
  }

  private updatePowerups(_delta: number) {
    for (let i = this.activePowerups.length - 1; i >= 0; i--) {
      const pu = this.activePowerups[i];
      if (!pu.alive) {
        this.activePowerups.splice(i, 1);
        continue;
      }

      // Sync graphics to zone
      pu.graphics.setPosition(pu.zone.x, pu.zone.y);
      pu.label.setPosition(pu.zone.x, pu.zone.y);

      // Remove if fell off screen
      if (pu.zone.y > GAME_HEIGHT + 30) {
        pu.graphics.destroy();
        pu.label.destroy();
        pu.zone.destroy();
        this.activePowerups.splice(i, 1);
      }
    }
  }

  private catchPowerup(pu: PowerupInstance) {
    if (!pu.alive) return;
    pu.alive = false;
    pu.graphics.destroy();
    pu.label.destroy();
    pu.zone.destroy();

    createGlowFlash(this, this.paddleContainer.x, this.paddleContainer.y, pu.def.color);
    if (pu.def.positive) {
      audio.powerupCatch();
    } else {
      audio.powerupBad();
    }
    this.applyPowerup(pu.def);
  }

  private applyPowerup(def: PowerupDefinition) {
    switch (def.id) {
      case 'diamondHands':
        this.paddleWidth = B.PADDLE_WIDTH_EXPANDED;
        this.rebuildPaddle();
        this.addTimedEffect(def.id, def.duration, () => {
          this.paddleWidth = B.PADDLE_WIDTH;
          this.rebuildPaddle();
        });
        break;

      case 'paperHands':
        this.paddleWidth = B.PADDLE_WIDTH_SHRUNK;
        this.rebuildPaddle();
        this.addTimedEffect(def.id, def.duration, () => {
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
        this.addTimedEffect(def.id, def.duration, () => {
          this.piercing = false;
        });
        break;

      case 'bullRun':
        this.adjustSentiment(20);
        this.addTimedEffect(def.id, def.duration, () => {});
        break;

      case 'laserEyes':
        this.laserActive = true;
        this.addTimedEffect(def.id, def.duration, () => {
          this.laserActive = false;
        });
        break;

      case 'liquidityBoost':
        if (this.lives < B.MAX_LIVES) {
          this.lives++;
          createGlowFlash(this, GAME_WIDTH / 2, GAME_HEIGHT / 2, COL_GREEN, 60);
        }
        break;

      case 'chainHalt':
        for (const ball of this.balls) {
          const body = ball.body as Phaser.Physics.Arcade.Body;
          body.setVelocity(body.velocity.x * 0.6, body.velocity.y * 0.6);
        }
        this.addTimedEffect(def.id, def.duration, () => {});
        break;

      case 'gasSpike':
        for (const ball of this.balls) {
          const body = ball.body as Phaser.Physics.Arcade.Body;
          const speed = Math.sqrt(body.velocity.x ** 2 + body.velocity.y ** 2);
          const newSpeed = Math.min(speed * 1.4, B.BALL_SPEED_CAP);
          const norm = normalize(body.velocity.x, body.velocity.y, newSpeed);
          body.setVelocity(norm.vx, norm.vy);
        }
        this.addTimedEffect(def.id, def.duration, () => {});
        break;
    }
  }

  private addTimedEffect(id: string, duration: number, onExpire: () => void) {
    // Remove existing same effect
    this.activeEffects = this.activeEffects.filter(e => e.id !== id);
    const expiresAt = this.time.now + duration;
    this.activeEffects.push({ id, expiresAt });
    this.time.delayedCall(duration, onExpire);
  }

  private updateEffects() {
    const now = this.time.now;
    this.activeEffects = this.activeEffects.filter(e => e.expiresAt > now);
  }

  // ── Extra Balls ──
  private spawnExtraBall() {
    const ball = this.createBall();
    const body = ball.body as Phaser.Physics.Arcade.Body;
    const speed = B.BALL_BASE_SPEED * this.getLevelSpeedMult();
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * 1.2;
    body.setVelocity(Math.cos(angle) * speed, Math.sin(angle) * speed);
    ball.setPosition(this.paddleContainer.x, this.paddleContainer.y - 30);
    this.ballLaunched = true;
  }

  // ── Shield ──
  private activateShield() {
    if (this.shieldGraphics) this.shieldGraphics.destroy();
    const shieldY = GAME_HEIGHT - 10;
    this.shieldGraphics = this.add.graphics();
    this.shieldGraphics.setDepth(3);
    this.shieldGraphics.lineStyle(2, COL_CYAN, 0.6);
    this.shieldGraphics.lineBetween(20, shieldY, GAME_WIDTH - 20, shieldY);
    this.shieldGraphics.fillStyle(COL_CYAN, 0.08);
    this.shieldGraphics.fillRect(20, shieldY - 2, GAME_WIDTH - 40, 4);

    // Shield zone
    const shieldZone = this.add.zone(GAME_WIDTH / 2, shieldY, GAME_WIDTH - 40, 8);
    this.physics.world.enable(shieldZone, Phaser.Physics.Arcade.STATIC_BODY);

    const removeShield = () => {
      if (this.shieldGraphics) {
        this.shieldGraphics.destroy();
        this.shieldGraphics = null;
      }
      shieldZone.destroy();
    };

    // Ball bounces off shield
    const checkShield = () => {
      for (const ball of this.balls) {
        this.physics.overlap(ball, shieldZone, () => {
          const body = ball.body as Phaser.Physics.Arcade.Body;
          body.setVelocityY(-Math.abs(body.velocity.y));
          ball.y = shieldY - B.BALL_RADIUS - 2;
          createImpactBurst(this, ball.x, shieldY, COL_CYAN, 0.4);
          audio.shieldHit();
          removeShield();
        });
      }
    };

    // Check on each update for the shield duration
    const timer = this.time.addEvent({
      delay: 16,
      repeat: Math.ceil(B.SHIELD_DURATION / 16),
      callback: checkShield,
    });

    this.time.delayedCall(B.SHIELD_DURATION, () => {
      removeShield();
      timer.destroy();
    });
  }

  // ── Lasers ──
  private updateLasers(_delta: number) {
    if (this.laserActive && this.ballLaunched) {
      const now = this.time.now;
      if (now - this.lastLaserTime > B.LASER_FIRE_RATE) {
        this.fireLaser();
        this.lastLaserTime = now;
      }
    }

    // Clean up off-screen
    for (let i = this.laserProjectiles.length - 1; i >= 0; i--) {
      if (this.laserProjectiles[i].y < -10) {
        this.laserProjectiles[i].destroy();
        this.laserProjectiles.splice(i, 1);
      }
    }
  }

  private fireLaser() {
    const g = this.add.graphics();
    g.lineStyle(2, COL_RED, 0.8);
    g.lineBetween(0, 0, 0, -12);
    g.fillStyle(COL_RED, 0.3);
    g.fillRect(-1, -12, 2, 12);

    const laser = this.add.container(this.paddleContainer.x, this.paddleContainer.y - B.PADDLE_HEIGHT / 2, [g]);
    laser.setDepth(4);
    this.physics.world.enable(laser);
    const body = laser.body as Phaser.Physics.Arcade.Body;
    body.setSize(4, 14);
    body.setOffset(-2, -12);
    body.setVelocityY(-B.LASER_SPEED);

    this.laserProjectiles.push(laser);
    audio.laserFire();
  }

  // ── Hazards ──
  private updateHazards(_delta: number) {
    // Spawn hazards during bear market, more frequently at higher levels
    const spawnChance = this.sentimentState === SentimentState.Bear
      ? 0.003 + this.currentLevel * 0.001
      : this.currentLevel >= 5 ? 0.001 : 0;

    if (this.ballLaunched && chance(spawnChance) && this.hazardObjects.length < 3) {
      this.spawnHazard();
    }

    // Update hazard positions and check collisions
    for (let i = this.hazardObjects.length - 1; i >= 0; i--) {
      const h = this.hazardObjects[i];
      h.zone.y += h.vy * (1 / 60);
      h.graphics.setPosition(h.zone.x, h.zone.y);

      // Check collision with paddle
      this.physics.overlap(h.zone, this.paddleContainer, () => {
        this.applyHazardHit();
        this.destroyHazard(i);
      });

      // Check collision with balls
      for (const ball of this.balls) {
        this.physics.overlap(h.zone, ball, () => {
          // Ball destroys hazard
          createImpactBurst(this, h.zone.x, h.zone.y, COL_RED, 0.8);
          this.score += 5;
          this.destroyHazard(i);
        });
      }

      // Off screen
      if (h.zone.y > GAME_HEIGHT + 30) {
        this.destroyHazard(i);
      }
    }
  }

  private spawnHazard() {
    const x = 60 + Math.random() * (GAME_WIDTH - 120);
    const y = -20;

    const g = this.add.graphics();
    g.setPosition(x, y);
    g.setDepth(6);

    // Red candle visual
    const candleH = 20;
    const bodyW = 8;
    const wickW = 1.5;
    // Wick
    g.lineStyle(wickW, COL_RED, 0.7);
    g.lineBetween(0, -candleH / 2 - 4, 0, -candleH / 2);
    g.lineBetween(0, candleH / 2, 0, candleH / 2 + 4);
    // Body
    g.fillStyle(COL_RED, 0.4);
    g.fillRect(-bodyW / 2, -candleH / 2, bodyW, candleH);
    g.lineStyle(1, COL_RED, 0.8);
    g.strokeRect(-bodyW / 2, -candleH / 2, bodyW, candleH);

    const zone = this.add.zone(x, y, bodyW + 4, candleH + 8);
    this.physics.world.enable(zone);

    const speed = 80 + this.currentLevel * 15 + Math.random() * 40;
    this.hazardObjects.push({ graphics: g, zone, vy: speed });
  }

  private destroyHazard(index: number) {
    if (index < 0 || index >= this.hazardObjects.length) return;
    const h = this.hazardObjects[index];
    h.graphics.destroy();
    h.zone.destroy();
    this.hazardObjects.splice(index, 1);
  }

  private applyHazardHit() {
    // Red flash and sentiment penalty
    createWarningPulse(this, this.paddleContainer.x, this.paddleContainer.y, 30);
    createGlowFlash(this, this.paddleContainer.x, this.paddleContainer.y, COL_RED, 20);
    this.adjustSentiment(-8);

    // Speed up ball briefly
    for (const ball of this.balls) {
      const body = ball.body as Phaser.Physics.Arcade.Body;
      const speed = Math.sqrt(body.velocity.x ** 2 + body.velocity.y ** 2);
      const newSpeed = Math.min(speed * 1.2, B.BALL_SPEED_CAP);
      const norm = normalize(body.velocity.x, body.velocity.y, newSpeed);
      body.setVelocity(norm.vx, norm.vy);
    }
  }

  // ── Combo ──
  private updateCombo(delta: number) {
    if (this.comboTimer > 0) {
      this.comboTimer -= delta;
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
    if (this.sentimentValue >= B.SENTIMENT_BULL_THRESHOLD) {
      this.sentimentState = SentimentState.Bull;
    } else if (this.sentimentValue <= B.SENTIMENT_BEAR_THRESHOLD) {
      this.sentimentState = SentimentState.Bear;
    } else {
      this.sentimentState = SentimentState.Neutral;
    }

    if (prev !== this.sentimentState) {
      this.updateSentimentMeter();
      const color = this.sentimentState === SentimentState.Bull ? COL_GREEN :
                    this.sentimentState === SentimentState.Bear ? COL_RED : COL_GOLD;
      createGlowFlash(this, GAME_WIDTH / 2, 20, color, 40);
      audio.sentimentShift(this.sentimentState === SentimentState.Bull ? 'bull' : 'bear');
    }
  }

  // ── Life Loss ──
  private loseLife() {
    this.lives--;
    this.comboCount = 0;
    this.comboTimer = 0;
    this.piercing = false;
    this.laserActive = false;

    if (this.lives <= 0) {
      audio.gameOver();
      this.scene.start('GameOverScene', {
        score: this.score,
        stage: this.currentLevel + 1,
      });
      return;
    }

    // Reset ball
    const ball = this.createBall();
    this.dockBallToPaddle(ball);
    this.ballLaunched = false;

    // Reset paddle size
    this.paddleWidth = B.PADDLE_WIDTH;
    this.rebuildPaddle();

    // Clear active effects
    this.activeEffects = [];

    // Remove shield
    if (this.shieldGraphics) {
      this.shieldGraphics.destroy();
      this.shieldGraphics = null;
    }

    // Flash warning
    createGlowFlash(this, GAME_WIDTH / 2, GAME_HEIGHT / 2, COL_RED, 80);
    audio.lifeLost();
  }

  // ── Level Progression ──
  private levelClearing = false;

  private checkLevelClear() {
    if (this.levelClearing) return;

    const remaining = this.bricks.filter(b => b.alive && b.def.destructible);
    if (remaining.length === 0 && this.bricks.length > 0) {
      this.levelClearing = true;
      this.score += B.SCORE_LEVEL_CLEAR_BONUS;
      this.score += this.lives * B.SCORE_LIFE_PRESERVATION_BONUS;

      createGlowFlash(this, GAME_WIDTH / 2, GAME_HEIGHT / 2, COL_GOLD, 100);
      audio.levelClear();

      this.currentLevel++;
      if (this.currentLevel >= LEVEL_ORDER.length) {
        this.time.delayedCall(1500, () => {
          this.scene.start('VictoryScene', {
            score: this.score,
            stage: this.currentLevel,
          });
        });
      } else {
        this.time.delayedCall(1500, () => {
          this.cleanupLevel();
          // Rebuild background for new level
          if (this.bgGraphics) this.bgGraphics.destroy();
          this.bgGraphics = buildBackgroundLayer(this, this.currentLevel);
          this.loadLevel(this.currentLevel);
          this.updateStageText();
          this.showStageIntro(LEVEL_ORDER[this.currentLevel]);

          // Reset ball
          this.dockBallToPaddle(this.balls[0]);
          this.ballLaunched = false;
          this.levelClearing = false;
        });
      }
    }
  }

  private cleanupLevel() {
    // Remove old bricks
    for (const b of this.bricks) {
      if (b.graphics && b.graphics.active) b.graphics.destroy();
      if (b.zone && b.zone.active) b.zone.destroy();
    }
    this.bricks = [];

    // Remove active powerups
    for (const pu of this.activePowerups) {
      pu.graphics.destroy();
      pu.label.destroy();
      pu.zone.destroy();
    }
    this.activePowerups = [];

    // Remove extra balls (keep one)
    while (this.balls.length > 1) {
      this.removeBall(this.balls.length - 1);
    }

    // Remove lasers
    for (const l of this.laserProjectiles) l.destroy();
    this.laserProjectiles = [];

    // Remove hazards
    for (let i = this.hazardObjects.length - 1; i >= 0; i--) {
      this.destroyHazard(i);
    }

    // Reset effects
    this.activeEffects = [];
    this.laserActive = false;
    this.piercing = false;
    this.paddleWidth = B.PADDLE_WIDTH;
    this.rebuildPaddle();
  }

  // ── Helpers ──
  private getLevelSpeedMult(): number {
    const level = LEVEL_ORDER[this.currentLevel];
    return level ? level.speedMultiplier : 1;
  }
}
