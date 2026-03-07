/**
 * Procedural Audio System for Rektanoid
 *
 * Generates all game sounds synthetically using the Web Audio API.
 * No audio files required - everything is created with oscillators,
 * gain envelopes, and noise buffers.
 */

class AudioSystem {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private _muted = false;
  private _volume = 0.5;
  private noiseBuffer: AudioBuffer | null = null;
  private initialized = false;

  // ---- public state ---------------------------------------------------

  get muted(): boolean {
    return this._muted;
  }

  set muted(value: boolean) {
    this._muted = value;
    this.applyVolume();
  }

  /** Toggle mute on/off. Returns the new muted state. */
  toggleMute(): boolean {
    this.muted = !this._muted;
    return this._muted;
  }

  /** Set master volume (0 - 1). */
  setVolume(v: number): void {
    this._volume = Math.max(0, Math.min(1, v));
    this.applyVolume();
  }

  getVolume(): number {
    return this._volume;
  }

  // ---- initialisation -------------------------------------------------

  /**
   * Must be called from a user-gesture handler (click / keydown / touch)
   * the very first time, per browser autoplay-policy requirements.
   */
  init(): void {
    if (this.initialized) return;
    try {
      this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      this.masterGain = this.ctx.createGain();
      this.masterGain.connect(this.ctx.destination);
      this.applyVolume();
      this.noiseBuffer = this.createNoiseBuffer();
      this.initialized = true;
    } catch (e) {
      console.warn('AudioSystem: Web Audio API not available', e);
    }
  }

  /** Resume a suspended context (browsers suspend until gesture). */
  resume(): void {
    if (this.ctx?.state === 'suspended') {
      this.ctx.resume();
    }
  }

  // ---- noise buffer ---------------------------------------------------

  private createNoiseBuffer(): AudioBuffer {
    const length = this.ctx!.sampleRate * 0.5; // 0.5 s of noise
    const buf = this.ctx!.createBuffer(1, length, this.ctx!.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < length; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    return buf;
  }

  // ---- internal helpers -----------------------------------------------

  private applyVolume(): void {
    if (this.masterGain) {
      this.masterGain.gain.value = this._muted ? 0 : this._volume;
    }
  }

  private now(): number {
    return this.ctx!.currentTime;
  }

  /** Create an oscillator already connected to a gain node -> master. */
  private osc(
    type: OscillatorType,
    freq: number,
    gainValue: number,
    start: number,
    stop: number,
  ): { osc: OscillatorNode; gain: GainNode } {
    const o = this.ctx!.createOscillator();
    const g = this.ctx!.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.value = gainValue;
    o.connect(g);
    g.connect(this.masterGain!);
    o.start(start);
    o.stop(stop);
    return { osc: o, gain: g };
  }

  /** Play a burst of white noise through a bandpass filter. */
  private noiseBurst(
    freq: number,
    q: number,
    gainValue: number,
    start: number,
    duration: number,
  ): { gain: GainNode } {
    const src = this.ctx!.createBufferSource();
    src.buffer = this.noiseBuffer!;
    const bp = this.ctx!.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = freq;
    bp.Q.value = q;
    const g = this.ctx!.createGain();
    g.gain.value = gainValue;
    src.connect(bp);
    bp.connect(g);
    g.connect(this.masterGain!);
    src.start(start);
    src.stop(start + duration);
    return { gain: g };
  }

  private canPlay(): boolean {
    if (!this.initialized) this.init();
    if (!this.ctx || !this.masterGain) return false;
    this.resume();
    return true;
  }

  // ---- sound definitions ----------------------------------------------

  /** Short bright blip - paddle bounce. */
  paddleHit(): void {
    if (!this.canPlay()) return;
    const t = this.now();
    const { gain } = this.osc('square', 880, 0.25, t, t + 0.06);
    gain.gain.setValueAtTime(0.25, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
  }

  /** Satisfying click/knock - brick takes a hit. */
  brickHit(): void {
    if (!this.canPlay()) return;
    const t = this.now();
    const { gain } = this.osc('triangle', 440, 0.3, t, t + 0.08);
    gain.gain.setValueAtTime(0.3, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);

    const { gain: ng } = this.noiseBurst(3000, 2, 0.08, t, 0.04);
    ng.gain.setValueAtTime(0.08, t);
    ng.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
  }

  /** Crunchier destruction sound - brick destroyed. */
  brickDestroy(): void {
    if (!this.canPlay()) return;
    const t = this.now();

    // tone sweep down
    const { osc: o, gain: g } = this.osc('sawtooth', 600, 0.25, t, t + 0.12);
    o.frequency.exponentialRampToValueAtTime(100, t + 0.12);
    g.gain.setValueAtTime(0.25, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);

    // noise crunch
    const { gain: ng } = this.noiseBurst(2000, 1, 0.2, t, 0.1);
    ng.gain.setValueAtTime(0.2, t);
    ng.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
  }

  /** Pleasant ascending arp - good powerup collected. */
  powerupCatch(): void {
    if (!this.canPlay()) return;
    const t = this.now();
    const notes = [523.25, 659.25, 783.99]; // C5, E5, G5
    notes.forEach((freq, i) => {
      const start = t + i * 0.06;
      const { gain } = this.osc('sine', freq, 0.2, start, start + 0.1);
      gain.gain.setValueAtTime(0.2, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.1);
    });
  }

  /** Descending ominous tone - bad powerup. */
  powerupBad(): void {
    if (!this.canPlay()) return;
    const t = this.now();
    const notes = [440, 349.23, 261.63]; // A4, F4, C4
    notes.forEach((freq, i) => {
      const start = t + i * 0.08;
      const { gain } = this.osc('sawtooth', freq, 0.15, start, start + 0.12);
      gain.gain.setValueAtTime(0.15, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.12);
    });
  }

  /** Low rumble burst - explosion. */
  explosion(): void {
    if (!this.canPlay()) return;
    const t = this.now();

    // low rumble
    const { osc: o, gain: g } = this.osc('sine', 80, 0.35, t, t + 0.3);
    o.frequency.exponentialRampToValueAtTime(30, t + 0.3);
    g.gain.setValueAtTime(0.35, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);

    // noise blast
    const { gain: ng } = this.noiseBurst(400, 0.5, 0.3, t, 0.25);
    ng.gain.setValueAtTime(0.3, t);
    ng.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
  }

  /** Sad descending tone - life lost. */
  lifeLost(): void {
    if (!this.canPlay()) return;
    const t = this.now();
    const { osc: o, gain: g } = this.osc('sine', 660, 0.25, t, t + 0.4);
    o.frequency.exponentialRampToValueAtTime(165, t + 0.4);
    g.gain.setValueAtTime(0.25, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
  }

  /** Triumphant ascending arpeggio - level cleared. */
  levelClear(): void {
    if (!this.canPlay()) return;
    const t = this.now();
    // C5 E5 G5 C6
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((freq, i) => {
      const start = t + i * 0.1;
      const { gain } = this.osc('square', freq, 0.18, start, start + 0.18);
      gain.gain.setValueAtTime(0.18, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.18);
    });
    // add a shimmery noise on the last note
    const shimmer = t + 0.3;
    const { gain: ng } = this.noiseBurst(6000, 5, 0.06, shimmer, 0.2);
    ng.gain.setValueAtTime(0.06, shimmer);
    ng.gain.exponentialRampToValueAtTime(0.001, shimmer + 0.2);
  }

  /** Quick zap - laser fire. */
  laserFire(): void {
    if (!this.canPlay()) return;
    const t = this.now();
    const { osc: o, gain: g } = this.osc('sawtooth', 1800, 0.15, t, t + 0.08);
    o.frequency.exponentialRampToValueAtTime(200, t + 0.08);
    g.gain.setValueAtTime(0.15, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
  }

  /** Combo hit - pitch rises with combo level (1-based). */
  comboHit(comboLevel: number = 1): void {
    if (!this.canPlay()) return;
    const t = this.now();
    const baseFreq = 440 + Math.min(comboLevel, 12) * 80;
    const { gain } = this.osc('square', baseFreq, 0.2, t, t + 0.07);
    gain.gain.setValueAtTime(0.2, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.07);

    // add a tiny upper harmonic for sparkle
    const { gain: g2 } = this.osc('sine', baseFreq * 1.5, 0.08, t, t + 0.05);
    g2.gain.setValueAtTime(0.08, t);
    g2.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
  }

  /** Metallic ping - shield hit. */
  shieldHit(): void {
    if (!this.canPlay()) return;
    const t = this.now();
    // metallic = two detuned sines
    const { gain: g1 } = this.osc('sine', 1200, 0.2, t, t + 0.15);
    g1.gain.setValueAtTime(0.2, t);
    g1.gain.exponentialRampToValueAtTime(0.001, t + 0.15);

    const { gain: g2 } = this.osc('sine', 1207, 0.2, t, t + 0.15);
    g2.gain.setValueAtTime(0.2, t);
    g2.gain.exponentialRampToValueAtTime(0.001, t + 0.15);

    const { gain: g3 } = this.osc('sine', 2400, 0.08, t, t + 0.1);
    g3.gain.setValueAtTime(0.08, t);
    g3.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
  }

  /**
   * Subtle mood tone for sentiment shifts.
   * @param mood 'bull' for major / optimistic, 'bear' for minor / ominous
   */
  sentimentShift(mood: 'bull' | 'bear'): void {
    if (!this.canPlay()) return;
    const t = this.now();

    if (mood === 'bull') {
      // major third - warm & hopeful
      const { gain: g1 } = this.osc('sine', 330, 0.1, t, t + 0.25);
      g1.gain.setValueAtTime(0.1, t);
      g1.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
      const { gain: g2 } = this.osc('sine', 415.3, 0.1, t, t + 0.25); // E4
      g2.gain.setValueAtTime(0.1, t);
      g2.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
    } else {
      // minor third - tense
      const { gain: g1 } = this.osc('sine', 330, 0.1, t, t + 0.25);
      g1.gain.setValueAtTime(0.1, t);
      g1.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
      const { gain: g2 } = this.osc('sine', 392, 0.1, t, t + 0.25); // Eb4
      g2.gain.setValueAtTime(0.1, t);
      g2.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
    }
  }

  /** UI click - menu selection. */
  menuSelect(): void {
    if (!this.canPlay()) return;
    const t = this.now();
    const { gain } = this.osc('square', 1000, 0.15, t, t + 0.04);
    gain.gain.setValueAtTime(0.15, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
  }

  /** Dramatic descending sequence - game over. */
  gameOver(): void {
    if (!this.canPlay()) return;
    const t = this.now();
    // E4 D4 C4 ... low rumble
    const notes = [329.63, 293.66, 261.63, 220, 164.81];
    notes.forEach((freq, i) => {
      const start = t + i * 0.15;
      const dur = 0.2;
      const { gain } = this.osc('sawtooth', freq, 0.2, start, start + dur);
      gain.gain.setValueAtTime(0.2, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + dur);
    });
    // trailing rumble
    const rumbleStart = t + notes.length * 0.15;
    const { osc: ro, gain: rg } = this.osc('sine', 80, 0.2, rumbleStart, rumbleStart + 0.5);
    ro.frequency.exponentialRampToValueAtTime(30, rumbleStart + 0.5);
    rg.gain.setValueAtTime(0.2, rumbleStart);
    rg.gain.exponentialRampToValueAtTime(0.001, rumbleStart + 0.5);
  }
}

export const audio = new AudioSystem();
