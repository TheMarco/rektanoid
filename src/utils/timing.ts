/** Simple cooldown tracker */
export class Cooldown {
  private lastTime = 0;

  constructor(private intervalMs: number) {}

  ready(now: number): boolean {
    if (now - this.lastTime >= this.intervalMs) {
      this.lastTime = now;
      return true;
    }
    return false;
  }

  reset() {
    this.lastTime = 0;
  }
}
