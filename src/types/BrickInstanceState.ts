export type BrickRuntimeState =
  | 'idle'
  | 'armed'
  | 'unstable'
  | 'buffed'
  | 'depegged'
  | 'expiring'
  | 'broken';

export interface BrickInstanceState {
  typeId: string;
  row: number;
  col: number;
  hp: number;
  maxHp: number;
  scoreValue: number;
  state: BrickRuntimeState;
  stateEnteredAtMs: number;
  timers: Record<string, number>;
  flags: {
    isBossSupport?: boolean;
    hasDroppedLoot?: boolean;
    spawnedFromEvent?: boolean;
  };
  visualVariant?: string;
}
