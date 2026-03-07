import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT } from '../gameConfig';

export class PauseOverlay extends Phaser.Scene {
  constructor() {
    super('PauseOverlay');
  }

  create() {
    // Dim overlay
    const overlay = this.add.graphics();
    overlay.fillStyle(0x000000, 0.7);
    overlay.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

    this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 40, 'PAUSED', {
      fontFamily: 'monospace',
      fontSize: '32px',
      color: '#00ff88',
    }).setOrigin(0.5);

    const resumeText = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 20, '[ RESUME ]', {
      fontFamily: 'monospace',
      fontSize: '18px',
      color: '#44ddff',
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });

    const menuText = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 60, '[ QUIT TO MENU ]', {
      fontFamily: 'monospace',
      fontSize: '18px',
      color: '#ff4444',
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });

    resumeText.on('pointerup', () => this.resumeGame());
    menuText.on('pointerup', () => {
      this.scene.stop('GameScene');
      this.scene.start('MenuScene');
    });

    this.input.keyboard!.on('keydown-ESC', () => this.resumeGame());
  }

  private resumeGame() {
    this.scene.resume('GameScene');
    this.scene.stop();
  }
}
