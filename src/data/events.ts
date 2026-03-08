import type { EventDefinition } from '../types/EventDefinition';
import { GAME_WIDTH, GAME_HEIGHT } from '../constants';

const CX = GAME_WIDTH / 2;
const CY = GAME_HEIGHT / 2;

export const EVENT_DEFINITIONS: EventDefinition[] = [
  {
    id: 'flashCrash',
    label: 'FLASH CRASH',
    durationMs: 6000,
    cooldownMs: 25000,
    baseWeight: 1.0,
    allowedStages: [2, 3, 4, 5, 6, 7, 8, 9, 10],
    allowedStates: ['bear', 'neutral'],
    startCallout: 'FLASH CRASH!',
    tickerMessages: [
      'FLASH CRASH SHAKES WEAK HANDS',
      'CASCADING LIQUIDATIONS',
      'CIRCUIT BREAKERS FAILING',
    ],
    applyStart: (ctx) => {
      ctx.flashScreen(0xff2222, 0.35);
      ctx.adjustSentiment(-12);
      ctx.setHazardBias(2.0);
      ctx.addTickerMessage('FLASH CRASH IN PROGRESS');
    },
    applyTick: (_ctx, _dt, elapsed) => {
      // Hazard bias already set, just let it run
      if (elapsed > 4000) {
        _ctx.setHazardBias(1.5); // ease off near end
      }
    },
    applyEnd: (ctx) => {
      ctx.setHazardBias(1.0);
      ctx.addCallout(CX, CY, 'CRASH OVER', '#ffaa00', 24);
      ctx.addTickerMessage('FLASH CRASH SUBSIDES');
    },
  },
  {
    id: 'shortSqueeze',
    label: 'SHORT SQUEEZE',
    durationMs: 5000,
    cooldownMs: 20000,
    baseWeight: 0.8,
    allowedStages: [3, 4, 5, 6, 7, 8, 9, 10],
    allowedStates: ['bull', 'euphoria'],
    startCallout: 'SHORT SQUEEZE!',
    tickerMessages: [
      'SHORT SQUEEZE RIPS THROUGH LATE BEARS',
      'SHORTS LIQUIDATED EN MASSE',
      'BEARS IN SHAMBLES',
    ],
    applyStart: (ctx) => {
      ctx.flashScreen(0x00ff88, 0.3);
      ctx.adjustSentiment(15);
      ctx.setBallSpeedMultiplier(1.15);
      ctx.addTickerMessage('SHORT SQUEEZE INITIATED');
    },
    applyEnd: (ctx) => {
      ctx.setBallSpeedMultiplier(1.0);
      ctx.addCallout(CX, CY, 'SQUEEZE COMPLETE', '#00ff88', 24);
    },
  },
  {
    id: 'exchangeOutage',
    label: 'EXCHANGE OUTAGE',
    durationMs: 3000,
    cooldownMs: 30000,
    baseWeight: 0.5,
    allowedStages: [4, 5, 6, 7, 8, 9, 10],
    startCallout: 'EXCHANGE DOWN!',
    tickerMessages: [
      'EXCHANGE OUTAGE REPORTED',
      'SERVERS UNRESPONSIVE',
      'MAINTENANCE MODE ACTIVATED',
    ],
    applyStart: (ctx) => {
      ctx.flashScreen(0x888888, 0.25);
      ctx.addTickerMessage('EXCHANGE EXPERIENCING ISSUES');
    },
    applyEnd: (ctx) => {
      ctx.addCallout(CX, CY, 'SYSTEMS RESTORED', '#44ddff', 22);
    },
  },
  {
    id: 'gasWar',
    label: 'GAS WAR',
    durationMs: 5000,
    cooldownMs: 22000,
    baseWeight: 0.7,
    allowedStages: [3, 4, 5, 6, 7, 8, 9, 10],
    startCallout: 'GAS WAR!',
    tickerMessages: [
      'GAS FEES SPIKE TO RECORD HIGHS',
      'MEMPOOL CONGESTED',
      'TRANSACTIONS STUCK',
    ],
    applyStart: (ctx) => {
      ctx.flashScreen(0xff6600, 0.25);
      ctx.addTickerMessage('GAS WAR ERUPTS');
    },
    applyEnd: (ctx) => {
      ctx.addCallout(CX, CY, 'GAS NORMALIZING', '#ffaa00', 22);
    },
  },
  {
    id: 'secProbe',
    label: 'SEC PROBE',
    durationMs: 5000,
    cooldownMs: 30000,
    baseWeight: 0.6,
    allowedStages: [5, 6, 7, 8, 9, 10],
    allowedStates: ['bull', 'euphoria', 'neutral'],
    startCallout: 'SEC INVESTIGATION!',
    tickerMessages: [
      'REGULATORY FEAR STRIKES RISK ASSETS',
      'SEC SUBPOENAS ISSUED',
      'COMPLIANCE CONCERNS MOUNT',
    ],
    applyStart: (ctx) => {
      ctx.flashScreen(0xff4444, 0.3);
      ctx.adjustSentiment(-10);
      ctx.addTickerMessage('SEC PROBE ANNOUNCED');
    },
    applyEnd: (ctx) => {
      ctx.addCallout(CX, CY, 'PROBE INCONCLUSIVE', '#888888', 22);
      ctx.adjustSentiment(5);
    },
  },
  {
    id: 'deadCatBounce',
    label: 'DEAD CAT BOUNCE',
    durationMs: 5000,
    cooldownMs: 25000,
    baseWeight: 0.9,
    allowedStages: [3, 4, 5, 6, 7, 8, 9, 10],
    allowedStates: ['bear'],
    startCallout: 'DEAD CAT BOUNCE!',
    tickerMessages: [
      'DEAD CAT BOUNCE DRAWS DIP BUYERS',
      'RELIEF RALLY OR TRAP?',
      'TEMPORARY REPRIEVE',
    ],
    applyStart: (ctx) => {
      ctx.flashScreen(0x44ff44, 0.25);
      ctx.adjustSentiment(10);
      ctx.setHazardBias(0.3);
      ctx.addTickerMessage('BRIEF RECOVERY UNDERWAY');
    },
    applyEnd: (ctx) => {
      ctx.setHazardBias(1.0);
      ctx.addCallout(CX, CY, 'BOUNCE FADING', '#ff6600', 22);
      ctx.adjustSentiment(-5);
    },
  },
];
