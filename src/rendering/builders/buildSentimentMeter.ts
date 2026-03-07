import Phaser from 'phaser';
import { COL_RED, COL_GREEN, COL_GRAY, COL_GOLD } from '../colorTokens';
import { SENTIMENT_MAX, SENTIMENT_BEAR_THRESHOLD, SENTIMENT_BULL_THRESHOLD } from '../../data/balance';
import { SentimentState } from '../../types/SentimentState';

const METER_W = 120;
const METER_H = 8;

export function buildSentimentMeter(
  scene: Phaser.Scene,
  value: number,
  state: SentimentState,
): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics();

  // Background
  g.fillStyle(0x111111, 0.8);
  g.fillRect(0, 0, METER_W, METER_H);

  // Bear zone
  const bearW = (SENTIMENT_BEAR_THRESHOLD / SENTIMENT_MAX) * METER_W;
  g.fillStyle(COL_RED, 0.15);
  g.fillRect(0, 0, bearW, METER_H);

  // Bull zone
  const bullX = (SENTIMENT_BULL_THRESHOLD / SENTIMENT_MAX) * METER_W;
  g.fillStyle(COL_GREEN, 0.15);
  g.fillRect(bullX, 0, METER_W - bullX, METER_H);

  // Current value fill
  const fillW = (value / SENTIMENT_MAX) * METER_W;
  const fillColor = state === SentimentState.Bull ? COL_GREEN :
                    state === SentimentState.Bear ? COL_RED : COL_GOLD;
  g.fillStyle(fillColor, 0.6);
  g.fillRect(0, 0, fillW, METER_H);

  // Border
  g.lineStyle(1, COL_GRAY, 0.5);
  g.strokeRect(0, 0, METER_W, METER_H);

  // Threshold markers
  g.lineStyle(1, COL_GRAY, 0.3);
  g.lineBetween(bearW, 0, bearW, METER_H);
  g.lineBetween(bullX, 0, bullX, METER_H);

  return g;
}
