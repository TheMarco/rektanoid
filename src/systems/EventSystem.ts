import type { EventId, EventDefinition, ActiveEvent, EventContext } from '../types/EventDefinition';
import type { MarketStateId } from '../types/MarketState';
import { weightedRandomPick } from '../utils/weightedRandom';
import { GAME_WIDTH, GAME_HEIGHT } from '../constants';

export class EventSystem {
  private definitions: EventDefinition[];
  private activeEvent: ActiveEvent | null = null;
  private cooldowns: Map<EventId, number> = new Map();
  private timeSinceLastEvent: number = 0;
  private minTimeBetweenEvents: number = 8000; // ms before first event can trigger
  private eventCheckInterval: number = 3000; // check every 3 seconds
  private timeSinceLastCheck: number = 0;

  constructor(definitions: EventDefinition[]) {
    this.definitions = definitions;
  }

  reset(): void {
    this.activeEvent = null;
    this.cooldowns.clear();
    this.timeSinceLastEvent = 0;
    this.timeSinceLastCheck = 0;
  }

  update(ctx: EventContext, dt: number): void {
    const dtMs = dt * 1000;

    // Update cooldowns
    for (const [id, remaining] of this.cooldowns.entries()) {
      const newVal = remaining - dtMs;
      if (newVal <= 0) {
        this.cooldowns.delete(id);
      } else {
        this.cooldowns.set(id, newVal);
      }
    }

    // Update active event
    if (this.activeEvent) {
      this.activeEvent.elapsedMs += dtMs;

      // Tick the active event
      const def = this.definitions.find(d => d.id === this.activeEvent!.id);
      if (def?.applyTick) {
        def.applyTick(ctx, dt, this.activeEvent.elapsedMs);
      }

      // Check expiry
      if (this.activeEvent.elapsedMs >= this.activeEvent.durationMs) {
        this.endEvent(ctx);
      }
      return;
    }

    // No active event - try to trigger one
    this.timeSinceLastEvent += dtMs;
    this.timeSinceLastCheck += dtMs;

    if (this.timeSinceLastCheck >= this.eventCheckInterval &&
        this.timeSinceLastEvent >= this.minTimeBetweenEvents) {
      this.timeSinceLastCheck = 0;
      this.maybeTrigger(ctx);
    }
  }

  maybeTrigger(ctx: EventContext): ActiveEvent | null {
    if (this.activeEvent) return null;

    const stageNumber = ctx.stageNumber;
    const marketState = ctx.marketState;

    // Filter eligible events
    const eligible = this.definitions.filter(def => {
      // Stage check
      if (!def.allowedStages.includes(stageNumber)) return false;
      // Market state check
      if (def.allowedStates && !def.allowedStates.includes(marketState)) return false;
      // Cooldown check
      if (this.cooldowns.has(def.id)) return false;
      return true;
    });

    if (eligible.length === 0) return null;

    // Weighted random selection - base chance ~15% per check
    if (Math.random() > 0.15) return null;

    const picked = weightedRandomPick(eligible, def => def.baseWeight);
    if (!picked) return null;

    return this.startEvent(picked, ctx);
  }

  private startEvent(def: EventDefinition, ctx: EventContext): ActiveEvent {
    this.activeEvent = {
      id: def.id,
      elapsedMs: 0,
      durationMs: def.durationMs,
      cooldownRemainingMs: def.cooldownMs,
      startedAtMs: ctx.nowMs,
    };

    // Show callout
    ctx.addCallout(GAME_WIDTH / 2, GAME_HEIGHT * 0.25, def.startCallout, '#ff4444', 30);

    // Add ticker message
    if (def.tickerMessages.length > 0) {
      ctx.addTickerMessage(def.tickerMessages[Math.floor(Math.random() * def.tickerMessages.length)]);
    }

    // Apply start effects
    if (def.applyStart) {
      def.applyStart(ctx);
    }

    this.timeSinceLastEvent = 0;
    return this.activeEvent;
  }

  private endEvent(ctx: EventContext): void {
    if (!this.activeEvent) return;

    const def = this.definitions.find(d => d.id === this.activeEvent!.id);
    if (def?.applyEnd) {
      def.applyEnd(ctx);
    }

    // Set cooldown
    this.cooldowns.set(this.activeEvent.id, this.activeEvent.cooldownRemainingMs);
    this.activeEvent = null;
  }

  forceEnd(ctx: EventContext): void {
    if (this.activeEvent) {
      this.endEvent(ctx);
    }
  }

  getActiveEvent(): ActiveEvent | null {
    return this.activeEvent;
  }

  getActiveEventDefinition(): EventDefinition | null {
    if (!this.activeEvent) return null;
    return this.definitions.find(d => d.id === this.activeEvent!.id) ?? null;
  }

  isEventActive(id?: EventId): boolean {
    if (!id) return this.activeEvent !== null;
    return this.activeEvent?.id === id;
  }
}
