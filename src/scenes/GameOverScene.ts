import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT } from '../gameConfig';
import { loadValue, saveValue } from '../utils/storage';

export class GameOverScene extends Phaser.Scene {
  constructor() {
    super('GameOverScene');
  }

  create(data: { score: number; stage: number }) {
    const { score, stage } = data;

    const bestScore = loadValue<number>('bestScore', 0);
    const isNewBest = score > bestScore;
    if (isNewBest) {
      saveValue('bestScore', score);
    }

    this.add.text(GAME_WIDTH / 2, 140, 'REKT', {
      fontFamily: 'monospace',
      fontSize: '48px',
      color: '#ff2222',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    this.add.text(GAME_WIDTH / 2, 200, 'bags liquidated.', {
      fontFamily: 'monospace',
      fontSize: '14px',
      color: '#ff4444',
    }).setOrigin(0.5);

    this.add.text(GAME_WIDTH / 2, 280, `SCORE: ${score.toLocaleString()}`, {
      fontFamily: 'monospace',
      fontSize: '22px',
      color: '#ffaa00',
    }).setOrigin(0.5);

    this.add.text(GAME_WIDTH / 2, 310, `STAGE: ${stage}`, {
      fontFamily: 'monospace',
      fontSize: '16px',
      color: '#888888',
    }).setOrigin(0.5);

    if (isNewBest) {
      this.add.text(GAME_WIDTH / 2, 350, 'NEW ALL-TIME HIGH!', {
        fontFamily: 'monospace',
        fontSize: '18px',
        color: '#00ff88',
      }).setOrigin(0.5);
    }

    const retryText = this.add.text(GAME_WIDTH / 2, 420, '[ RETRY ]', {
      fontFamily: 'monospace',
      fontSize: '20px',
      color: '#00ff88',
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });

    const menuText = this.add.text(GAME_WIDTH / 2, 460, '[ MENU ]', {
      fontFamily: 'monospace',
      fontSize: '20px',
      color: '#44ddff',
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });

    retryText.on('pointerup', () => this.scene.start('GameScene'));
    menuText.on('pointerup', () => this.scene.start('MenuScene'));

    this.input.keyboard!.once('keydown-SPACE', () => this.scene.start('GameScene'));
  }
}
