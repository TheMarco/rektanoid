export type BossId = 'whale' | 'liquidator' | 'flippening';

export interface BossAttackDefinition {
  id: string;
  label: string;
  telegraphMs: number;
  durationMs: number;
  cooldownMs: number;
  weight: number;
}

export interface BossPhaseDefinition {
  id: string;
  hpThreshold: number;
  label: string;
  allowedAttackIds: string[];
  modifiers?: {
    aggressionMultiplier?: number;
    spawnSupportBricks?: boolean;
    hazardBias?: number;
  };
}

export interface BossDefinition {
  id: BossId;
  label: string;
  stageNumber: number;
  maxHp: number;
  contactDamage: number;
  arenaPadding: number;
  introCallout: string;
  defeatCallout: string;
  attacks: BossAttackDefinition[];
  phases: BossPhaseDefinition[];
  width: number;
  height: number;
  color: number;
  moveSpeed: number;
}

export interface BossInstance {
  id: BossId;
  label: string;
  hp: number;
  maxHp: number;
  phaseIndex: number;
  elapsedMs: number;
  phaseElapsedMs: number;
  attackCooldownMs: number;
  activeAttackId: string | null;
  activeAttackElapsedMs: number;
  activeAttackDurationMs: number;
  telegraphRemainingMs: number;
  weakPointOpen: boolean;
  weakPointTimerMs: number;
  x: number;
  y: number;
  width: number;
  height: number;
  vx: number;
  vy: number;
  flags: {
    introduced: boolean;
    defeated: boolean;
    invulnerable: boolean;
  };
}
