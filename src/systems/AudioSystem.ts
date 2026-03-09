/**
 * Procedural Audio System for Rektanoid
 *
 * Upgraded synthesis chain:
 * - Dedicated SFX + ambient buses
 * - Subtle saturation, compression, limiting
 * - Delay + convolution reverb sends
 * - Layered voicing for richer, less "single oscillator" sounds
 */

type AmbientState = 'bear' | 'neutral' | 'bull' | 'euphoria';

interface VoiceRoute {
  bus?: 'sfx' | 'ambient';
  pan?: number;
  delaySend?: number;
  reverbSend?: number;
  filterType?: BiquadFilterType;
  filterFreq?: number;
  filterQ?: number;
  detune?: number;
}

class AudioSystem {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private ambientBus: GainNode | null = null;
  private compressor: DynamicsCompressorNode | null = null;
  private limiter: DynamicsCompressorNode | null = null;
  private saturator: WaveShaperNode | null = null;
  private delayNode: DelayNode | null = null;
  private delayFeedback: GainNode | null = null;
  private delayFilter: BiquadFilterNode | null = null;
  private reverbConvolver: ConvolverNode | null = null;
  private reverbReturn: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private initialized = false;
  private _muted = false;
  private _volume = 0.5;

  // Ambient voice tracking for fades/cleanup
  private ambientOscs: OscillatorNode[] = [];
  private ambientLfos: OscillatorNode[] = [];
  private ambientGains: GainNode[] = [];
  private currentAmbientState: AmbientState | null = null;

  // Background music playlist
  private musicEl: HTMLAudioElement | null = null;
  private musicSource: MediaElementAudioSourceNode | null = null;
  private musicGain: GainNode | null = null;
  private musicPlaying = false;
  private musicPlaylist: string[] = [];
  private musicTrackIndex = 0;

  get muted(): boolean {
    return this._muted;
  }

  set muted(value: boolean) {
    this._muted = value;
    this.applyVolume();
  }

  toggleMute(): boolean {
    this.muted = !this._muted;
    return this._muted;
  }

  setVolume(v: number): void {
    this._volume = Math.max(0, Math.min(1, v));
    this.applyVolume();
  }

  getVolume(): number {
    return this._volume;
  }

  init(): void {
    if (this.initialized) return;
    try {
      const AudioCtx = window.AudioContext
        || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;

      this.ctx = new AudioCtx();
      this.masterGain = this.ctx.createGain();
      this.sfxBus = this.ctx.createGain();
      this.ambientBus = this.ctx.createGain();
      this.compressor = this.ctx.createDynamicsCompressor();
      this.limiter = this.ctx.createDynamicsCompressor();
      this.saturator = this.ctx.createWaveShaper();
      this.delayNode = this.ctx.createDelay(1.0);
      this.delayFeedback = this.ctx.createGain();
      this.delayFilter = this.ctx.createBiquadFilter();
      this.reverbConvolver = this.ctx.createConvolver();
      this.reverbReturn = this.ctx.createGain();

      // Main buses
      this.sfxBus.gain.value = 1;
      this.ambientBus.gain.value = 0.75;

      // Dynamics control
      this.compressor.threshold.value = -22;
      this.compressor.knee.value = 26;
      this.compressor.ratio.value = 4;
      this.compressor.attack.value = 0.004;
      this.compressor.release.value = 0.2;

      this.limiter.threshold.value = -3;
      this.limiter.knee.value = 0;
      this.limiter.ratio.value = 20;
      this.limiter.attack.value = 0.001;
      this.limiter.release.value = 0.06;

      // Subtle grit for SFX only
      this.saturator.curve = this.createDriveCurve(14);
      this.saturator.oversample = '4x';

      // Delay network
      this.delayNode.delayTime.value = 0.24;
      this.delayFeedback.gain.value = 0.33;
      this.delayFilter.type = 'lowpass';
      this.delayFilter.frequency.value = 3200;
      this.delayFilter.Q.value = 0.7;

      // Reverb network
      this.reverbConvolver.buffer = this.createImpulseResponse(2.6, 2.1);
      this.reverbReturn.gain.value = 0.24;

      // Route: SFX -> saturator -> compressor -> limiter -> master -> destination
      this.sfxBus.connect(this.saturator);
      this.saturator.connect(this.compressor);
      this.ambientBus.connect(this.compressor);
      this.compressor.connect(this.limiter);
      this.limiter.connect(this.masterGain);
      this.masterGain.connect(this.ctx.destination);

      // Delay returns into compressor
      this.delayNode.connect(this.delayFilter);
      this.delayFilter.connect(this.delayFeedback);
      this.delayFeedback.connect(this.delayNode);
      this.delayFilter.connect(this.compressor);

      // Reverb returns into compressor
      this.reverbConvolver.connect(this.reverbReturn);
      this.reverbReturn.connect(this.compressor);

      this.noiseBuffer = this.createNoiseBuffer();
      this.applyVolume();
      this.initialized = true;
    } catch (e) {
      console.warn('AudioSystem: Web Audio API not available', e);
    }
  }

  resume(): void {
    if (this.ctx?.state === 'suspended') {
      this.ctx.resume();
    }
  }

  private createNoiseBuffer(): AudioBuffer {
    const length = this.ctx!.sampleRate * 0.7;
    const buf = this.ctx!.createBuffer(1, length, this.ctx!.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < length; i++) {
      const white = Math.random() * 2 - 1;
      const pinkish = white * 0.62 + (i > 0 ? data[i - 1] * 0.38 : 0);
      data[i] = Math.max(-1, Math.min(1, pinkish));
    }
    return buf;
  }

  private createImpulseResponse(seconds: number, decay: number): AudioBuffer {
    const length = Math.floor(this.ctx!.sampleRate * seconds);
    const impulse = this.ctx!.createBuffer(2, length, this.ctx!.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const data = impulse.getChannelData(ch);
      for (let i = 0; i < length; i++) {
        const t = i / length;
        const env = Math.pow(1 - t, decay);
        data[i] = (Math.random() * 2 - 1) * env;
      }
    }
    return impulse;
  }

  private createDriveCurve(amount: number): Float32Array<ArrayBuffer> {
    const n = 8192;
    const curve = new Float32Array(new ArrayBuffer(n * Float32Array.BYTES_PER_ELEMENT)) as Float32Array<ArrayBuffer>;
    for (let i = 0; i < n; i++) {
      const x = (i * 2) / n - 1;
      curve[i] = Math.tanh(x * amount) / Math.tanh(amount);
    }
    return curve;
  }

  private applyVolume(): void {
    if (!this.masterGain || !this.ctx) return;
    const t = this.ctx.currentTime;
    this.masterGain.gain.cancelScheduledValues(t);
    this.masterGain.gain.setValueAtTime(this.masterGain.gain.value, t);
    this.masterGain.gain.linearRampToValueAtTime(this._muted ? 0 : this._volume, t + 0.03);
  }

  private shufflePlaylist(): void {
    const tracks = [
      'music/soundtrack1.mp3',
      'music/soundtrack2.mp3',
      'music/soundtrack3.mp3',
      'music/soundtrack4.mp3',
      'music/soundtrack5.mp3',
      'music/soundtrack6.mp3',
    ];
    // Fisher-Yates shuffle
    for (let i = tracks.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [tracks[i], tracks[j]] = [tracks[j], tracks[i]];
    }
    this.musicPlaylist = tracks;
    this.musicTrackIndex = 0;
  }

  private playCurrentTrack(): void {
    if (!this.musicEl || this.musicPlaylist.length === 0) return;
    this.musicEl.src = this.musicPlaylist[this.musicTrackIndex];
    this.musicEl.play().catch(() => {});
  }

  startMusic(): void {
    if (this.musicPlaying) return;
    if (!this.initialized) this.init();
    if (!this.ctx || !this.masterGain) return;
    this.resume();

    // Shuffle playlist each time music starts
    this.shufflePlaylist();

    if (!this.musicEl) {
      this.musicEl = new Audio();
      this.musicEl.preload = 'auto';
      this.musicEl.addEventListener('ended', () => {
        this.musicTrackIndex = (this.musicTrackIndex + 1) % this.musicPlaylist.length;
        this.playCurrentTrack();
      });
      this.musicSource = this.ctx.createMediaElementSource(this.musicEl);
      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = 0.7;
      this.musicSource.connect(this.musicGain);
      this.musicGain.connect(this.masterGain);
    }

    this.playCurrentTrack();
    this.musicPlaying = true;
  }

  stopMusic(): void {
    if (!this.musicEl || !this.musicPlaying) return;
    this.musicEl.pause();
    this.musicEl.currentTime = 0;
    this.musicPlaying = false;
  }

  private now(): number {
    return this.ctx!.currentTime;
  }

  private randPan(amount = 0.7): number {
    return (Math.random() * 2 - 1) * amount;
  }

  private connectOutput(node: AudioNode, route: VoiceRoute): void {
    const bus = route.bus === 'ambient' ? this.ambientBus : this.sfxBus;
    node.connect(bus!);

    if ((route.delaySend ?? 0) > 0 && this.delayNode && this.ctx) {
      const send = this.ctx.createGain();
      send.gain.value = route.delaySend ?? 0;
      node.connect(send);
      send.connect(this.delayNode);
    }
    if ((route.reverbSend ?? 0) > 0 && this.reverbConvolver && this.ctx) {
      const send = this.ctx.createGain();
      send.gain.value = route.reverbSend ?? 0;
      node.connect(send);
      send.connect(this.reverbConvolver);
    }
  }

  private osc(
    type: OscillatorType,
    freq: number,
    gainValue: number,
    start: number,
    stop: number,
    route: VoiceRoute = {},
  ): { osc: OscillatorNode; gain: GainNode; filter?: BiquadFilterNode } {
    const o = this.ctx!.createOscillator();
    const g = this.ctx!.createGain();
    o.type = type;
    o.frequency.value = freq;
    if (route.detune !== undefined) o.detune.value = route.detune;

    let head: AudioNode = o;
    let filter: BiquadFilterNode | undefined;
    if (route.filterType) {
      filter = this.ctx!.createBiquadFilter();
      filter.type = route.filterType;
      filter.frequency.value = route.filterFreq ?? 1500;
      filter.Q.value = route.filterQ ?? 0.7;
      head.connect(filter);
      head = filter;
    }

    head.connect(g);
    g.gain.value = gainValue;

    let out: AudioNode = g;
    if (route.pan !== undefined) {
      const p = this.ctx!.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, route.pan));
      g.connect(p);
      out = p;
    }

    this.connectOutput(out, route);
    o.start(start);
    o.stop(stop);
    return { osc: o, gain: g, filter };
  }

  private noiseBurst(
    freq: number,
    q: number,
    gainValue: number,
    start: number,
    duration: number,
    route: VoiceRoute = {},
  ): { gain: GainNode; filter: BiquadFilterNode } {
    const src = this.ctx!.createBufferSource();
    src.buffer = this.noiseBuffer!;
    const bp = this.ctx!.createBiquadFilter();
    bp.type = route.filterType ?? 'bandpass';
    bp.frequency.value = route.filterFreq ?? freq;
    bp.Q.value = route.filterQ ?? q;
    const g = this.ctx!.createGain();
    g.gain.value = gainValue;

    src.connect(bp);
    bp.connect(g);

    let out: AudioNode = g;
    if (route.pan !== undefined) {
      const p = this.ctx!.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, route.pan));
      g.connect(p);
      out = p;
    }

    this.connectOutput(out, route);
    src.start(start);
    src.stop(start + duration);
    return { gain: g, filter: bp };
  }

  private canPlay(): boolean {
    if (!this.initialized) this.init();
    if (!this.ctx || !this.masterGain || !this.sfxBus || !this.ambientBus) return false;
    this.resume();
    return true;
  }

  // ---- Sound Definitions ----------------------------------------------

  paddleHit(): void {
    if (!this.canPlay()) return;
    const t = this.now();

    const a = this.osc('triangle', 980, 0.19, t, t + 0.08, {
      pan: this.randPan(0.18),
      delaySend: 0.09,
      reverbSend: 0.05,
      filterType: 'highpass',
      filterFreq: 320,
    });
    a.osc.frequency.exponentialRampToValueAtTime(760, t + 0.08);
    a.gain.gain.setValueAtTime(0.19, t);
    a.gain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);

    const b = this.osc('square', 1960, 0.06, t, t + 0.045, { pan: this.randPan(0.2), reverbSend: 0.03 });
    b.gain.gain.setValueAtTime(0.06, t);
    b.gain.gain.exponentialRampToValueAtTime(0.001, t + 0.045);
  }

  brickHit(): void {
    if (!this.canPlay()) return;
    const t = this.now();

    const low = this.osc('triangle', 320, 0.22, t, t + 0.1, {
      pan: this.randPan(0.3),
      filterType: 'lowpass',
      filterFreq: 2200,
      delaySend: 0.04,
      reverbSend: 0.04,
    });
    low.osc.frequency.exponentialRampToValueAtTime(190, t + 0.1);
    low.gain.gain.setValueAtTime(0.22, t);
    low.gain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);

    const click = this.osc('square', 1300, 0.06, t, t + 0.03, { pan: this.randPan(0.4) });
    click.gain.gain.setValueAtTime(0.06, t);
    click.gain.gain.exponentialRampToValueAtTime(0.001, t + 0.03);

    const noise = this.noiseBurst(2600, 2.2, 0.09, t, 0.05, {
      pan: this.randPan(0.35),
      reverbSend: 0.03,
    });
    noise.gain.gain.setValueAtTime(0.09, t);
    noise.gain.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
  }

  brickDestroy(): void {
    if (!this.canPlay()) return;
    const t = this.now();

    const sweep = this.osc('sawtooth', 740, 0.22, t, t + 0.16, {
      pan: this.randPan(0.45),
      delaySend: 0.11,
      reverbSend: 0.1,
      filterType: 'lowpass',
      filterFreq: 4200,
      filterQ: 0.8,
    });
    sweep.osc.frequency.exponentialRampToValueAtTime(110, t + 0.16);
    sweep.gain.gain.setValueAtTime(0.22, t);
    sweep.gain.gain.exponentialRampToValueAtTime(0.001, t + 0.16);

    const sub = this.osc('sine', 130, 0.13, t, t + 0.19, { reverbSend: 0.04 });
    sub.osc.frequency.exponentialRampToValueAtTime(52, t + 0.19);
    sub.gain.gain.setValueAtTime(0.13, t);
    sub.gain.gain.exponentialRampToValueAtTime(0.001, t + 0.19);

    const crunch = this.noiseBurst(1800, 1.1, 0.15, t, 0.12, {
      pan: this.randPan(0.5),
      delaySend: 0.05,
      reverbSend: 0.06,
    });
    crunch.gain.gain.setValueAtTime(0.15, t);
    crunch.gain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
  }

  powerupCatch(): void {
    if (!this.canPlay()) return;
    const t = this.now();
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((freq, i) => {
      const start = t + i * 0.052;
      const dur = 0.13;
      const v1 = this.osc('triangle', freq, 0.11, start, start + dur, {
        pan: -0.25 + (i / (notes.length - 1)) * 0.5,
        delaySend: 0.2,
        reverbSend: 0.17,
        filterType: 'highpass',
        filterFreq: 380,
      });
      v1.gain.gain.setValueAtTime(0.001, start);
      v1.gain.gain.linearRampToValueAtTime(0.11, start + 0.015);
      v1.gain.gain.exponentialRampToValueAtTime(0.001, start + dur);

      const v2 = this.osc('sine', freq * 2, 0.045, start, start + dur * 0.8, {
        pan: 0.25 - (i / (notes.length - 1)) * 0.5,
        reverbSend: 0.1,
      });
      v2.gain.gain.setValueAtTime(0.045, start);
      v2.gain.gain.exponentialRampToValueAtTime(0.001, start + dur * 0.8);
    });
  }

  powerupBad(): void {
    if (!this.canPlay()) return;
    const t = this.now();
    const notes = [466.16, 349.23, 261.63];
    notes.forEach((freq, i) => {
      const start = t + i * 0.085;
      const dur = 0.16;
      const voice = this.osc('sawtooth', freq, 0.12, start, start + dur, {
        pan: this.randPan(0.35),
        delaySend: 0.06,
        reverbSend: 0.08,
        filterType: 'lowpass',
        filterFreq: 2300,
      });
      voice.osc.frequency.exponentialRampToValueAtTime(freq * 0.85, start + dur);
      voice.gain.gain.setValueAtTime(0.12, start);
      voice.gain.gain.exponentialRampToValueAtTime(0.001, start + dur);
    });
    const hiss = this.noiseBurst(900, 1.3, 0.06, t + 0.05, 0.2, { reverbSend: 0.06 });
    hiss.gain.gain.setValueAtTime(0.06, t + 0.05);
    hiss.gain.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
  }

  explosion(): void {
    if (!this.canPlay()) return;
    const t = this.now();

    const body = this.osc('sine', 96, 0.24, t, t + 0.42, { reverbSend: 0.08 });
    body.osc.frequency.exponentialRampToValueAtTime(34, t + 0.42);
    body.gain.gain.setValueAtTime(0.24, t);
    body.gain.gain.exponentialRampToValueAtTime(0.001, t + 0.42);

    const grit = this.osc('triangle', 170, 0.11, t, t + 0.25, {
      pan: this.randPan(0.4),
      delaySend: 0.05,
      reverbSend: 0.1,
    });
    grit.osc.frequency.exponentialRampToValueAtTime(58, t + 0.25);
    grit.gain.gain.setValueAtTime(0.11, t);
    grit.gain.gain.exponentialRampToValueAtTime(0.001, t + 0.25);

    const blast = this.noiseBurst(460, 0.8, 0.27, t, 0.3, {
      pan: this.randPan(0.5),
      delaySend: 0.06,
      reverbSend: 0.18,
      filterType: 'bandpass',
      filterFreq: 700,
      filterQ: 0.7,
    });
    blast.gain.gain.setValueAtTime(0.27, t);
    blast.gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
  }

  hazardHit(): void {
    if (!this.canPlay()) return;
    const t = this.now();

    const buzzA = this.osc('sawtooth', 170, 0.18, t, t + 0.24, {
      pan: this.randPan(0.4),
      delaySend: 0.06,
      reverbSend: 0.08,
      filterType: 'bandpass',
      filterFreq: 900,
      filterQ: 1.6,
      detune: -6,
    });
    buzzA.osc.frequency.exponentialRampToValueAtTime(78, t + 0.24);
    buzzA.gain.gain.setValueAtTime(0.18, t);
    buzzA.gain.gain.exponentialRampToValueAtTime(0.001, t + 0.24);

    const buzzB = this.osc('sawtooth', 176, 0.12, t, t + 0.2, {
      pan: this.randPan(0.4),
      filterType: 'bandpass',
      filterFreq: 1200,
      filterQ: 1.5,
      detune: 6,
    });
    buzzB.gain.gain.setValueAtTime(0.12, t);
    buzzB.gain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);

    const crack = this.noiseBurst(1200, 2.4, 0.18, t, 0.2, {
      delaySend: 0.03,
      reverbSend: 0.08,
    });
    crack.gain.gain.setValueAtTime(0.18, t);
    crack.gain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
  }

  lifeLost(): void {
    if (!this.canPlay()) return;
    const t = this.now();

    const fall = this.osc('triangle', 760, 0.2, t, t + 0.5, {
      delaySend: 0.11,
      reverbSend: 0.13,
      filterType: 'lowpass',
      filterFreq: 2500,
    });
    fall.osc.frequency.exponentialRampToValueAtTime(140, t + 0.5);
    fall.gain.gain.setValueAtTime(0.2, t);
    fall.gain.gain.exponentialRampToValueAtTime(0.001, t + 0.5);

    const tail = this.noiseBurst(700, 0.8, 0.08, t + 0.12, 0.3, { reverbSend: 0.15 });
    tail.gain.gain.setValueAtTime(0.08, t + 0.12);
    tail.gain.gain.exponentialRampToValueAtTime(0.001, t + 0.42);
  }

  levelClear(): void {
    if (!this.canPlay()) return;
    const t = this.now();
    const notes = [523.25, 659.25, 783.99, 1046.5, 1318.5];
    notes.forEach((freq, i) => {
      const start = t + i * 0.08;
      const dur = 0.2;
      const lead = this.osc('square', freq, 0.1, start, start + dur, {
        pan: -0.35 + (i / (notes.length - 1)) * 0.7,
        delaySend: 0.23,
        reverbSend: 0.2,
        filterType: 'highpass',
        filterFreq: 280,
      });
      lead.gain.gain.setValueAtTime(0.001, start);
      lead.gain.gain.linearRampToValueAtTime(0.1, start + 0.015);
      lead.gain.gain.exponentialRampToValueAtTime(0.001, start + dur);

      const air = this.osc('sine', freq * 2, 0.04, start, start + dur * 0.9, {
        pan: 0.35 - (i / (notes.length - 1)) * 0.7,
        reverbSend: 0.18,
      });
      air.gain.gain.setValueAtTime(0.04, start);
      air.gain.gain.exponentialRampToValueAtTime(0.001, start + dur * 0.9);
    });
    const shimmerStart = t + 0.26;
    const shimmer = this.noiseBurst(6200, 4.5, 0.05, shimmerStart, 0.28, { reverbSend: 0.22 });
    shimmer.gain.gain.setValueAtTime(0.05, shimmerStart);
    shimmer.gain.gain.exponentialRampToValueAtTime(0.001, shimmerStart + 0.28);
  }

  laserFire(): void {
    if (!this.canPlay()) return;
    const t = this.now();
    const pan = this.randPan(0.55);
    const chirp = this.osc('sawtooth', 2200, 0.14, t, t + 0.11, {
      pan,
      delaySend: 0.1,
      reverbSend: 0.05,
      filterType: 'highpass',
      filterFreq: 650,
    });
    chirp.osc.frequency.exponentialRampToValueAtTime(280, t + 0.11);
    chirp.gain.gain.setValueAtTime(0.14, t);
    chirp.gain.gain.exponentialRampToValueAtTime(0.001, t + 0.11);

    const snap = this.osc('square', 3000, 0.05, t, t + 0.03, { pan: -pan, reverbSend: 0.02 });
    snap.gain.gain.setValueAtTime(0.05, t);
    snap.gain.gain.exponentialRampToValueAtTime(0.001, t + 0.03);
  }

  comboHit(comboLevel: number = 1): void {
    if (!this.canPlay()) return;
    const t = this.now();
    const baseFreq = 520 + Math.min(comboLevel, 14) * 72;
    const intensity = Math.min(1.4, 1 + comboLevel * 0.05);

    const lead = this.osc('square', baseFreq, 0.11 * intensity, t, t + 0.1, {
      pan: this.randPan(0.6),
      delaySend: Math.min(0.25, 0.08 + comboLevel * 0.01),
      reverbSend: 0.08,
      filterType: 'highpass',
      filterFreq: 330,
    });
    lead.gain.gain.setValueAtTime(0.11 * intensity, t);
    lead.gain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);

    const sparkle = this.osc('sine', baseFreq * 1.98, 0.045 * intensity, t, t + 0.07, {
      pan: this.randPan(0.8),
      reverbSend: 0.1,
    });
    sparkle.gain.gain.setValueAtTime(0.045 * intensity, t);
    sparkle.gain.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
  }

  shieldHit(): void {
    if (!this.canPlay()) return;
    const t = this.now();
    const partials = [1220, 1765, 2480];
    partials.forEach((freq, i) => {
      const voice = this.osc('sine', freq, 0.11 / (i + 1), t, t + 0.22, {
        pan: this.randPan(0.45),
        delaySend: 0.18,
        reverbSend: 0.22,
      });
      voice.gain.gain.setValueAtTime(0.11 / (i + 1), t);
      voice.gain.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
    });
  }

  sentimentShift(mood: 'bull' | 'bear'): void {
    if (!this.canPlay()) return;
    const t = this.now();
    const triad = mood === 'bull'
      ? [261.63, 329.63, 392]
      : [261.63, 311.13, 392];
    triad.forEach((freq, i) => {
      const voice = this.osc('triangle', freq, 0.065, t, t + 0.3, {
        pan: -0.2 + i * 0.2,
        delaySend: 0.12,
        reverbSend: 0.15,
        filterType: 'lowpass',
        filterFreq: 3000,
      });
      voice.gain.gain.setValueAtTime(0.001, t);
      voice.gain.gain.linearRampToValueAtTime(0.065, t + 0.03);
      voice.gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    });
  }

  menuSelect(): void {
    if (!this.canPlay()) return;
    const t = this.now();

    const click = this.osc('square', 1040, 0.08, t, t + 0.055, {
      delaySend: 0.12,
      reverbSend: 0.08,
      filterType: 'highpass',
      filterFreq: 400,
    });
    click.gain.gain.setValueAtTime(0.08, t);
    click.gain.gain.exponentialRampToValueAtTime(0.001, t + 0.055);

    const tail = this.osc('sine', 1500, 0.04, t, t + 0.07, { reverbSend: 0.1 });
    tail.gain.gain.setValueAtTime(0.04, t);
    tail.gain.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
  }

  bossIntro(): void {
    if (!this.canPlay()) return;
    const t = this.now();

    const sub = this.osc('sine', 62, 0.25, t, t + 0.8, { reverbSend: 0.09 });
    sub.osc.frequency.exponentialRampToValueAtTime(38, t + 0.8);
    sub.gain.gain.setValueAtTime(0.25, t);
    sub.gain.gain.exponentialRampToValueAtTime(0.001, t + 0.8);

    const siren = this.osc('sawtooth', 180, 0.12, t + 0.22, t + 0.95, {
      delaySend: 0.15,
      reverbSend: 0.16,
      filterType: 'bandpass',
      filterFreq: 1100,
      filterQ: 1.2,
    });
    siren.osc.frequency.exponentialRampToValueAtTime(980, t + 0.58);
    siren.osc.frequency.exponentialRampToValueAtTime(360, t + 0.95);
    siren.gain.gain.setValueAtTime(0.12, t + 0.22);
    siren.gain.gain.exponentialRampToValueAtTime(0.001, t + 0.95);

    const swell = this.noiseBurst(230, 1.1, 0.15, t, 0.6, {
      filterType: 'bandpass',
      filterFreq: 420,
      filterQ: 0.9,
      reverbSend: 0.2,
    });
    swell.gain.gain.setValueAtTime(0.001, t);
    swell.gain.gain.linearRampToValueAtTime(0.15, t + 0.18);
    swell.gain.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
  }

  bossPhaseChange(): void {
    if (!this.canPlay()) return;
    const t = this.now();

    const sweep = this.osc('sawtooth', 320, 0.15, t, t + 0.36, {
      delaySend: 0.14,
      reverbSend: 0.1,
      filterType: 'bandpass',
      filterFreq: 1300,
      filterQ: 1.6,
      pan: this.randPan(0.5),
    });
    sweep.osc.frequency.exponentialRampToValueAtTime(1100, t + 0.17);
    sweep.osc.frequency.exponentialRampToValueAtTime(340, t + 0.36);
    sweep.gain.gain.setValueAtTime(0.15, t);
    sweep.gain.gain.exponentialRampToValueAtTime(0.001, t + 0.36);

    const crack = this.noiseBurst(1700, 2.1, 0.1, t + 0.08, 0.22, {
      reverbSend: 0.08,
      pan: this.randPan(0.6),
    });
    crack.gain.gain.setValueAtTime(0.1, t + 0.08);
    crack.gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
  }

  bossDefeat(): void {
    if (!this.canPlay()) return;
    const t = this.now();
    const notes = [440, 554.37, 659.25, 880, 1108.73, 1318.5];
    notes.forEach((freq, i) => {
      const start = t + i * 0.07;
      const lead = this.osc('square', freq, 0.095, start, start + 0.2, {
        pan: -0.35 + (i / (notes.length - 1)) * 0.7,
        delaySend: 0.2,
        reverbSend: 0.2,
        filterType: 'highpass',
        filterFreq: 300,
      });
      lead.gain.gain.setValueAtTime(0.095, start);
      lead.gain.gain.exponentialRampToValueAtTime(0.001, start + 0.2);

      const pad = this.osc('triangle', freq * 0.5, 0.05, start, start + 0.24, { reverbSend: 0.14 });
      pad.gain.gain.setValueAtTime(0.05, start);
      pad.gain.gain.exponentialRampToValueAtTime(0.001, start + 0.24);
    });

    const rumbleStart = t + 0.2;
    const rumble = this.osc('sine', 96, 0.18, rumbleStart, rumbleStart + 0.62, { reverbSend: 0.08 });
    rumble.osc.frequency.exponentialRampToValueAtTime(31, rumbleStart + 0.62);
    rumble.gain.gain.setValueAtTime(0.18, rumbleStart);
    rumble.gain.gain.exponentialRampToValueAtTime(0.001, rumbleStart + 0.62);

    const shimmer = this.noiseBurst(5200, 4.2, 0.07, t + 0.32, 0.34, { reverbSend: 0.24 });
    shimmer.gain.gain.setValueAtTime(0.07, t + 0.32);
    shimmer.gain.gain.exponentialRampToValueAtTime(0.001, t + 0.66);
  }

  bossHit(): void {
    if (!this.canPlay()) return;
    const t = this.now();
    const bite = this.osc('square', 760, 0.12, t, t + 0.08, {
      pan: this.randPan(0.4),
      delaySend: 0.07,
      reverbSend: 0.06,
    });
    bite.gain.gain.setValueAtTime(0.12, t);
    bite.gain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);

    const punch = this.osc('sine', 220, 0.13, t, t + 0.1, { reverbSend: 0.04 });
    punch.gain.gain.setValueAtTime(0.13, t);
    punch.gain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
  }

  eventStart(): void {
    if (!this.canPlay()) return;
    const t = this.now();
    for (let i = 0; i < 2; i++) {
      const start = t + i * 0.075;
      const ping = this.osc('square', 1300, 0.08, start, start + 0.055, {
        delaySend: 0.14,
        reverbSend: 0.09,
      });
      ping.gain.gain.setValueAtTime(0.08, start);
      ping.gain.gain.exponentialRampToValueAtTime(0.001, start + 0.055);
    }
    const warning = this.osc('sawtooth', 460, 0.1, t + 0.16, t + 0.42, {
      reverbSend: 0.1,
      filterType: 'bandpass',
      filterFreq: 1200,
      filterQ: 1.4,
    });
    warning.osc.frequency.exponentialRampToValueAtTime(180, t + 0.42);
    warning.gain.gain.setValueAtTime(0.1, t + 0.16);
    warning.gain.gain.exponentialRampToValueAtTime(0.001, t + 0.42);
  }

  euphoriaEnter(): void {
    if (!this.canPlay()) return;
    const t = this.now();
    const notes = [523.25, 659.25, 783.99, 1046.5, 1318.5, 1568];
    notes.forEach((freq, i) => {
      const start = t + i * 0.038;
      const v = this.osc('triangle', freq, 0.085, start, start + 0.14, {
        pan: -0.45 + (i / (notes.length - 1)) * 0.9,
        delaySend: 0.24,
        reverbSend: 0.18,
        filterType: 'highpass',
        filterFreq: 300,
      });
      v.gain.gain.setValueAtTime(0.001, start);
      v.gain.gain.linearRampToValueAtTime(0.085, start + 0.01);
      v.gain.gain.exponentialRampToValueAtTime(0.001, start + 0.14);
    });
  }

  // ---- Ambient Layers --------------------------------------------------

  setMarketAmbient(_state: AmbientState): void {
    // Ambient drone layer intentionally disabled.
    this.stopAmbient();
  }

  stopAmbient(): void {
    if (!this.ctx) return;
    const t = this.now();
    for (const g of this.ambientGains) {
      g.gain.cancelScheduledValues(t);
      g.gain.setValueAtTime(g.gain.value, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
    }
    const oscs = [...this.ambientOscs];
    const lfos = [...this.ambientLfos];
    setTimeout(() => {
      for (const o of oscs) {
        try { o.stop(); } catch { /* no-op */ }
      }
      for (const l of lfos) {
        try { l.stop(); } catch { /* no-op */ }
      }
    }, 700);
    this.ambientOscs = [];
    this.ambientLfos = [];
    this.ambientGains = [];
    this.currentAmbientState = null;
  }

  gameOver(): void {
    if (!this.canPlay()) return;
    const t = this.now();
    const notes = [329.63, 293.66, 261.63, 220, 164.81];
    notes.forEach((freq, i) => {
      const start = t + i * 0.14;
      const dur = 0.22;
      const voice = this.osc('sawtooth', freq, 0.1, start, start + dur, {
        pan: this.randPan(0.35),
        delaySend: 0.12,
        reverbSend: 0.16,
        filterType: 'lowpass',
        filterFreq: 2300,
      });
      voice.gain.gain.setValueAtTime(0.1, start);
      voice.gain.gain.exponentialRampToValueAtTime(0.001, start + dur);
    });

    const rumbleStart = t + notes.length * 0.14;
    const rumble = this.osc('sine', 78, 0.16, rumbleStart, rumbleStart + 0.65, {
      reverbSend: 0.12,
      filterType: 'lowpass',
      filterFreq: 380,
    });
    rumble.osc.frequency.exponentialRampToValueAtTime(28, rumbleStart + 0.65);
    rumble.gain.gain.setValueAtTime(0.16, rumbleStart);
    rumble.gain.gain.exponentialRampToValueAtTime(0.001, rumbleStart + 0.65);

    const air = this.noiseBurst(550, 0.9, 0.08, rumbleStart, 0.5, { reverbSend: 0.2 });
    air.gain.gain.setValueAtTime(0.08, rumbleStart);
    air.gain.gain.exponentialRampToValueAtTime(0.001, rumbleStart + 0.5);
  }
}

export const audio = new AudioSystem();
