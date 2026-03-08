import type { MarketStateId } from '../types/MarketState';
import type { MarketModifiers } from '../types/MarketModifiers';
import { MARKET_STATES, MARKET_MODIFIERS, TICKER_MESSAGES } from '../data/marketStates';

export class MarketDirector {
  private previousState: MarketStateId = 'neutral';
  private stateEnteredAtMs: number = 0;
  private tickerMessageIndex: Record<MarketStateId, number> = {
    bear: 0, neutral: 0, bull: 0, euphoria: 0,
  };

  getState(sentiment: number): MarketStateId {
    for (const cfg of MARKET_STATES) {
      if (sentiment >= cfg.minSentiment && sentiment <= cfg.maxSentiment) {
        return cfg.id;
      }
    }
    return 'neutral';
  }

  getStateLabel(state: MarketStateId): string {
    const cfg = MARKET_STATES.find(s => s.id === state);
    return cfg?.label ?? 'NEUTRAL';
  }

  getModifiers(sentiment: number): MarketModifiers {
    const state = this.getState(sentiment);
    return MARKET_MODIFIERS[state];
  }

  /**
   * Check for state transition. Returns the new state if changed, null otherwise.
   */
  checkTransition(sentiment: number, nowMs: number): { from: MarketStateId; to: MarketStateId } | null {
    const newState = this.getState(sentiment);
    if (newState !== this.previousState) {
      const result = { from: this.previousState, to: newState };
      this.previousState = newState;
      this.stateEnteredAtMs = nowMs;
      return result;
    }
    return null;
  }

  getCurrentState(): MarketStateId {
    return this.previousState;
  }

  getTimeInState(nowMs: number): number {
    return nowMs - this.stateEnteredAtMs;
  }

  /**
   * Get the next ticker message for the current market state.
   * Cycles through available messages round-robin.
   */
  getNextTickerMessage(state: MarketStateId): string {
    const messages = TICKER_MESSAGES[state];
    if (!messages || messages.length === 0) return '';
    const idx = this.tickerMessageIndex[state] % messages.length;
    this.tickerMessageIndex[state] = idx + 1;
    return messages[idx];
  }

  /**
   * Get the sentiment color for the current state.
   */
  getStateColor(state: MarketStateId): string {
    switch (state) {
      case 'bear': return '#ff2222';
      case 'neutral': return '#888888';
      case 'bull': return '#00ff44';
      case 'euphoria': return '#ffaa00';
    }
  }

  /**
   * Get the sentiment color as a hex number.
   */
  getStateColorHex(state: MarketStateId): number {
    switch (state) {
      case 'bear': return 0xff2222;
      case 'neutral': return 0x888888;
      case 'bull': return 0x00ff44;
      case 'euphoria': return 0xffaa00;
    }
  }

  reset() {
    this.previousState = 'neutral';
    this.stateEnteredAtMs = 0;
    this.tickerMessageIndex = { bear: 0, neutral: 0, bull: 0, euphoria: 0 };
  }
}
