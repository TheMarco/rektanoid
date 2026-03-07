import { Game } from './Game';

const container = document.getElementById('game-container')!;
const game = new Game(container);
game.start();
