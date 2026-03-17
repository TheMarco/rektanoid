/**
 * Play.fun Browser SDK wrapper.
 *
 * The SDK script is loaded conditionally in index.html (only inside play.fun iframes).
 * This module provides a safe wrapper that no-ops when the SDK isn't available.
 */

declare class OpenGameSDK {
  constructor(opts: { ui: { usePointsWidget: boolean } });
  init(opts: { gameId: string }): Promise<void>;
  addPoints(points: number): void;
  endGame(): Promise<void>;
  on(event: string, cb: (...args: unknown[]) => void): void;
}

const GAME_ID = '4b1c3d97-bb66-4fc2-9f20-a1e0dc8b34e7';

class PlayFunSDKWrapper {
  private sdk: OpenGameSDK | null = null;
  private ready = false;

  async init(): Promise<void> {
    // Only init if the SDK script was loaded (i.e. we're inside play.fun)
    if (typeof (window as any).OpenGameSDK === 'undefined') return;

    try {
      this.sdk = new (window as any).OpenGameSDK({
        ui: { usePointsWidget: true },
      });

      this.sdk!.on('OnReady', () => {
        this.ready = true;
      });

      await this.sdk!.init({ gameId: GAME_ID });
    } catch (e) {
      console.warn('[PlayFun] SDK init failed:', e);
      this.sdk = null;
    }
  }

  addPoints(points: number): void {
    if (!this.sdk) return;
    this.sdk.addPoints(points);
  }

  async endGame(): Promise<void> {
    if (!this.sdk) return;
    try {
      await this.sdk.endGame();
    } catch (e) {
      console.warn('[PlayFun] endGame failed:', e);
    }
  }
}

export const playFun = new PlayFunSDKWrapper();
