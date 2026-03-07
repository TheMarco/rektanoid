import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT } from '../gameConfig';
import { buildBackgroundLayer } from '../rendering/builders/buildBackgroundLayer';
import { COL_GREEN, COL_CYAN, COL_GOLD, COL_GRAY } from '../rendering/colorTokens';
import { loadValue } from '../utils/storage';
import { audio } from '../systems/AudioSystem';

export class MenuScene extends Phaser.Scene {
  constructor() {
    super('MenuScene');
  }

  create() {
    buildBackgroundLayer(this);

    // Title
    const title = this.add.text(GAME_WIDTH / 2, 140, 'REKTANOID', {
      fontFamily: 'monospace',
      fontSize: '48px',
      color: '#00ff88',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    // Subtitle
    this.add.text(GAME_WIDTH / 2, 190, 'break bricks. break markets.', {
      fontFamily: 'monospace',
      fontSize: '14px',
      color: '#44ddff',
    }).setOrigin(0.5);

    // Pulsing title glow
    this.tweens.add({
      targets: title,
      alpha: { from: 0.8, to: 1 },
      duration: 1500,
      yoyo: true,
      repeat: -1,
    });

    // Menu options
    const startText = this.add.text(GAME_WIDTH / 2, 320, '[ START GAME ]', {
      fontFamily: 'monospace',
      fontSize: '20px',
      color: '#00ff88',
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });

    const howToText = this.add.text(GAME_WIDTH / 2, 370, '[ HOW TO PLAY ]', {
      fontFamily: 'monospace',
      fontSize: '20px',
      color: '#44ddff',
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });

    // Best score
    const bestScore = loadValue<number>('bestScore', 0);
    if (bestScore > 0) {
      this.add.text(GAME_WIDTH / 2, 440, `BEST: ${bestScore.toLocaleString()}`, {
        fontFamily: 'monospace',
        fontSize: '16px',
        color: '#ffaa00',
      }).setOrigin(0.5);
    }

    // Footer
    this.add.text(GAME_WIDTH / 2, GAME_HEIGHT - 30, 'Not financial advice.', {
      fontFamily: 'monospace',
      fontSize: '10px',
      color: '#333333',
    }).setOrigin(0.5);

    // Interactions
    startText.on('pointerover', () => { startText.setColor('#ffffff'); audio.menuSelect(); });
    startText.on('pointerout', () => startText.setColor('#00ff88'));
    startText.on('pointerup', () => { audio.menuSelect(); this.scene.start('GameScene'); });

    howToText.on('pointerover', () => { howToText.setColor('#ffffff'); audio.menuSelect(); });
    howToText.on('pointerout', () => howToText.setColor('#44ddff'));
    howToText.on('pointerup', () => { audio.menuSelect(); this.scene.start('HowToPlayScene'); });

    // Keyboard
    this.input.keyboard!.once('keydown-SPACE', () => { audio.menuSelect(); this.scene.start('GameScene'); });
    this.input.keyboard!.once('keydown-ENTER', () => { audio.menuSelect(); this.scene.start('GameScene'); });
  }
}
