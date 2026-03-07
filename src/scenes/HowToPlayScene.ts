import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT } from '../gameConfig';

const INSTRUCTIONS = [
  'CONTROLS',
  '',
  'Arrow Keys / A,D  -  Move paddle',
  'Space              -  Launch ball',
  'Escape             -  Pause',
  '',
  'OBJECTIVE',
  '',
  'Break all destructible bricks to clear the stage.',
  'Catch power-ups to gain advantages.',
  'Avoid negative drops.',
  '',
  'MARKET SENTIMENT',
  '',
  'Green bricks push sentiment bullish.',
  'Red bricks push sentiment bearish.',
  'Bull market = better drops + score bonus.',
  'Bear market = more danger + negative drops.',
  '',
  'Press any key to return.',
];

export class HowToPlayScene extends Phaser.Scene {
  constructor() {
    super('HowToPlayScene');
  }

  create() {
    this.add.text(GAME_WIDTH / 2, 40, 'HOW TO PLAY', {
      fontFamily: 'monospace',
      fontSize: '24px',
      color: '#00ff88',
    }).setOrigin(0.5);

    const text = INSTRUCTIONS.join('\n');
    this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 20, text, {
      fontFamily: 'monospace',
      fontSize: '13px',
      color: '#aaaaaa',
      align: 'center',
      lineSpacing: 4,
    }).setOrigin(0.5);

    this.input.keyboard!.once('keydown', () => this.scene.start('MenuScene'));
    this.input.once('pointerup', () => this.scene.start('MenuScene'));
  }
}
