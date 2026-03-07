import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT } from '../gameConfig';
import { loadValue, saveValue } from '../utils/storage';

export class VictoryScene extends Phaser.Scene {
  constructor() {
    super('VictoryScene');
  }

  create(data: { score: number; stage: number }) {
    const { score } = data;

    const bestScore = loadValue<number>('bestScore', 0);
    if (score > bestScore) {
      saveValue('bestScore', score);
    }

    this.add.text(GAME_WIDTH / 2, 140, 'TO THE MOON', {
      fontFamily: 'monospace',
      fontSize: '40px',
      color: '#00ff88',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    this.add.text(GAME_WIDTH / 2, 195, 'all stages cleared. ngmi? you gmi.', {
      fontFamily: 'monospace',
      fontSize: '14px',
      color: '#44ddff',
    }).setOrigin(0.5);

    this.add.text(GAME_WIDTH / 2, 280, `FINAL SCORE: ${score.toLocaleString()}`, {
      fontFamily: 'monospace',
      fontSize: '24px',
      color: '#ffaa00',
    }).setOrigin(0.5);

    const replayText = this.add.text(GAME_WIDTH / 2, 380, '[ PLAY AGAIN ]', {
      fontFamily: 'monospace',
      fontSize: '20px',
      color: '#00ff88',
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });

    const menuText = this.add.text(GAME_WIDTH / 2, 420, '[ MENU ]', {
      fontFamily: 'monospace',
      fontSize: '20px',
      color: '#44ddff',
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });

    replayText.on('pointerup', () => this.scene.start('GameScene'));
    menuText.on('pointerup', () => this.scene.start('MenuScene'));

    this.input.keyboard!.once('keydown-SPACE', () => this.scene.start('GameScene'));
  }
}
