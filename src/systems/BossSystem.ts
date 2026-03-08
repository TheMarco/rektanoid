import type { BossId, BossDefinition, BossInstance, BossAttackDefinition } from '../types/BossTypes';
import { weightedRandomPick } from '../utils/weightedRandom';
import { GAME_WIDTH } from '../constants';

export interface BossContext {
  nowMs: number;
  paddleX: number;
  paddleY: number;
  paddleWidth: number;
  ballPositions: Array<{ x: number; y: number }>;
  addCallout: (x: number, y: number, text: string, color: string, size: number) => void;
  flashScreen: (color: number, intensity: number) => void;
  playSound: (sound: string) => void;
  spawnHazard: (x: number) => void;
  adjustSentiment: (delta: number) => void;
}

export class BossSystem {
  private definitions: BossDefinition[];
  private boss: BossInstance | null = null;
  private currentDef: BossDefinition | null = null;
  private attackCooldowns: Map<string, number> = new Map();
  private introTimer: number = 0;
  private defeatTimer: number = 0;

  constructor(definitions: BossDefinition[]) {
    this.definitions = definitions;
  }

  reset(): void {
    this.boss = null;
    this.currentDef = null;
    this.attackCooldowns.clear();
    this.introTimer = 0;
    this.defeatTimer = 0;
  }

  getBossForStage(stageNumber: number): BossDefinition | null {
    return this.definitions.find(d => d.stageNumber === stageNumber) ?? null;
  }

  spawnBoss(bossId: BossId, nowMs: number): BossInstance {
    const def = this.definitions.find(d => d.id === bossId);
    if (!def) throw new Error(`Unknown boss: ${bossId}`);

    this.currentDef = def;
    this.attackCooldowns.clear();

    this.boss = {
      id: def.id,
      label: def.label,
      hp: def.maxHp,
      maxHp: def.maxHp,
      phaseIndex: 0,
      elapsedMs: 0,
      phaseElapsedMs: 0,
      attackCooldownMs: 2000, // initial delay before first attack
      activeAttackId: null,
      activeAttackElapsedMs: 0,
      activeAttackDurationMs: 0,
      telegraphRemainingMs: 0,
      weakPointOpen: false,
      weakPointTimerMs: 0,
      x: GAME_WIDTH / 2,
      y: 80,
      width: def.width,
      height: def.height,
      vx: def.moveSpeed,
      vy: 0,
      flags: {
        introduced: false,
        defeated: false,
        invulnerable: true,
      },
    };

    this.introTimer = 2000; // 2 second intro
    return this.boss;
  }

  update(ctx: BossContext, dt: number): void {
    if (!this.boss || !this.currentDef) return;
    const dtMs = dt * 1000;

    // Handle intro
    if (!this.boss.flags.introduced) {
      this.introTimer -= dtMs;
      if (this.introTimer <= 0) {
        this.boss.flags.introduced = true;
        this.boss.flags.invulnerable = false;
        ctx.addCallout(this.boss.x, this.boss.y + 60, 'FIGHT!', '#ff4444', 36);
        ctx.playSound('bossIntro');
      }
      return;
    }

    // Handle defeat animation
    if (this.boss.flags.defeated) {
      this.defeatTimer -= dtMs;
      return;
    }

    this.boss.elapsedMs += dtMs;
    this.boss.phaseElapsedMs += dtMs;

    // Movement - horizontal patrol
    this.updateMovement(dt);

    // Phase transitions
    this.checkPhaseTransition(ctx);

    // Attack logic
    this.updateAttacks(ctx, dt);

    // Weak point cycling
    this.updateWeakPoint(dtMs);
  }

  private updateMovement(dt: number): void {
    if (!this.boss || !this.currentDef) return;

    const padding = this.currentDef.arenaPadding + this.boss.width / 2;
    this.boss.x += this.boss.vx * dt;

    if (this.boss.x >= GAME_WIDTH - padding) {
      this.boss.x = GAME_WIDTH - padding;
      this.boss.vx = -Math.abs(this.boss.vx);
    } else if (this.boss.x <= padding) {
      this.boss.x = padding;
      this.boss.vx = Math.abs(this.boss.vx);
    }
  }

  private checkPhaseTransition(ctx: BossContext): void {
    if (!this.boss || !this.currentDef) return;

    const hpRatio = this.boss.hp / this.boss.maxHp;
    const phases = this.currentDef.phases;

    // Find the appropriate phase based on HP threshold
    let newPhaseIndex = 0;
    for (let i = phases.length - 1; i >= 0; i--) {
      if (hpRatio <= phases[i].hpThreshold) {
        newPhaseIndex = i;
      }
    }

    if (newPhaseIndex !== this.boss.phaseIndex) {
      const newPhase = phases[newPhaseIndex];
      this.boss.phaseIndex = newPhaseIndex;
      this.boss.phaseElapsedMs = 0;

      // Phase change effects
      ctx.addCallout(this.boss.x, this.boss.y + 50, newPhase.label, '#ff8800', 28);
      ctx.flashScreen(this.currentDef.color, 0.5);
      ctx.playSound('bossPhaseChange');

      // Brief invulnerability on phase change
      this.boss.flags.invulnerable = true;
      setTimeout(() => {
        if (this.boss) this.boss.flags.invulnerable = false;
      }, 500);

      // Speed up movement
      const aggMult = newPhase.modifiers?.aggressionMultiplier ?? 1.0;
      this.boss.vx = Math.sign(this.boss.vx) * this.currentDef.moveSpeed * aggMult;
    }
  }

  private updateAttacks(ctx: BossContext, dt: number): void {
    if (!this.boss || !this.currentDef) return;
    const dtMs = dt * 1000;

    // Update per-attack cooldowns
    for (const [id, cd] of this.attackCooldowns.entries()) {
      const newCd = cd - dtMs;
      if (newCd <= 0) this.attackCooldowns.delete(id);
      else this.attackCooldowns.set(id, newCd);
    }

    // Currently attacking
    if (this.boss.activeAttackId) {
      // Still telegraphing
      if (this.boss.telegraphRemainingMs > 0) {
        this.boss.telegraphRemainingMs -= dtMs;
        return;
      }

      this.boss.activeAttackElapsedMs += dtMs;
      if (this.boss.activeAttackElapsedMs >= this.boss.activeAttackDurationMs) {
        // Attack finished
        const atk = this.currentDef.attacks.find(a => a.id === this.boss!.activeAttackId);
        if (atk) {
          this.attackCooldowns.set(atk.id, atk.cooldownMs);
        }
        this.boss.activeAttackId = null;
        this.boss.activeAttackElapsedMs = 0;
        this.boss.activeAttackDurationMs = 0;
      }
      return;
    }

    // Cooldown between attacks
    this.boss.attackCooldownMs -= dtMs;
    if (this.boss.attackCooldownMs > 0) return;

    // Pick next attack
    const phase = this.currentDef.phases[this.boss.phaseIndex];
    if (!phase) return;

    const available = this.currentDef.attacks.filter(a =>
      phase.allowedAttackIds.includes(a.id) && !this.attackCooldowns.has(a.id)
    );

    if (available.length === 0) {
      this.boss.attackCooldownMs = 1000; // retry soon
      return;
    }

    const picked = weightedRandomPick(available, a => a.weight);
    if (!picked) return;

    this.boss.activeAttackId = picked.id;
    this.boss.activeAttackElapsedMs = 0;
    this.boss.activeAttackDurationMs = picked.durationMs;
    this.boss.telegraphRemainingMs = picked.telegraphMs;
    this.boss.attackCooldownMs = 1500; // base delay after attack ends

    ctx.addCallout(this.boss.x, this.boss.y - 40, picked.label.toUpperCase(), '#ffaa00', 20);
  }

  private updateWeakPoint(dtMs: number): void {
    if (!this.boss) return;

    this.boss.weakPointTimerMs -= dtMs;
    if (this.boss.weakPointTimerMs <= 0) {
      this.boss.weakPointOpen = !this.boss.weakPointOpen;
      this.boss.weakPointTimerMs = this.boss.weakPointOpen ? 3000 : 2000;
    }
  }

  damageBoss(amount: number, ctx: BossContext): boolean {
    if (!this.boss || this.boss.flags.invulnerable || this.boss.flags.defeated) return false;

    // Extra damage when weak point is open
    const dmg = this.boss.weakPointOpen ? amount * 2 : amount;
    this.boss.hp = Math.max(0, this.boss.hp - dmg);

    if (this.boss.hp <= 0) {
      this.boss.flags.defeated = true;
      this.boss.flags.invulnerable = true;
      this.defeatTimer = 2000;
      ctx.addCallout(this.boss.x, this.boss.y, this.currentDef!.defeatCallout, '#ffaa00', 32);
      ctx.flashScreen(0xffaa00, 0.8);
      ctx.playSound('bossDefeat');
      return true;
    }

    return false;
  }

  getBoss(): BossInstance | null {
    return this.boss;
  }

  getDefinition(): BossDefinition | null {
    return this.currentDef;
  }

  isBossActive(): boolean {
    return this.boss !== null && !this.boss.flags.defeated;
  }

  isBossDefeated(): boolean {
    return this.boss?.flags.defeated ?? false;
  }

  isDefeatAnimationDone(): boolean {
    return this.boss?.flags.defeated === true && this.defeatTimer <= 0;
  }

  isBossIntroPlaying(): boolean {
    return this.boss !== null && !this.boss.flags.introduced;
  }

  /** Get current attack info for rendering telegraphs */
  getActiveAttack(): { id: string; elapsed: number; duration: number; telegraphing: boolean } | null {
    if (!this.boss?.activeAttackId) return null;
    return {
      id: this.boss.activeAttackId,
      elapsed: this.boss.activeAttackElapsedMs,
      duration: this.boss.activeAttackDurationMs,
      telegraphing: this.boss.telegraphRemainingMs > 0,
    };
  }
}
