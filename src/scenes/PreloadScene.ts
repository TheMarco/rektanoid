import Phaser from 'phaser';
import { initRetroDisplay } from '../rendering/retrozoneAdapter';

export class PreloadScene extends Phaser.Scene {
  constructor() {
    super('PreloadScene');
  }

  create() {
    // Initialize RetroZone overlay on top of the game canvas
    const canvas = this.game.canvas;
    initRetroDisplay(canvas, 'vector');

    this.scene.start('MenuScene');
  }
}
