// MicroCure — procedural audio. No samples, no external requests.
// Everything is synthesized from oscillators and filtered noise at runtime.

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.ready = false;
    this.master = null;
    this.sfx = null;
    this.music = null;
    this.reverbSend = null;
    this.volume = 0.7;
    this.ambient = null;
    this.bossLayer = null;
    this.noiseBuffer = null;
    this.lastFoot = 0;
  }

  init() {
    if (this.ready) {
      if (this.ctx?.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -18;
      comp.knee.value = 24;
      comp.ratio.value = 5;
      comp.attack.value = 0.004;
      comp.release.value = 0.24;
      this.master.connect(comp);
      comp.connect(this.ctx.destination);

      this.sfx = this.ctx.createGain();
      this.sfx.gain.value = 0.9;
      this.sfx.connect(this.master);

      this.music = this.ctx.createGain();
      this.music.gain.value = 0.72;
      this.music.connect(this.master);

      const convolver = this.ctx.createConvolver();
      convolver.buffer = this.makeImpulse(2.6, 2.8);
      const wet = this.ctx.createGain();
      wet.gain.value = 0.24;
      this.reverbSend = this.ctx.createGain();
      this.reverbSend.gain.value = 1;
      this.reverbSend.connect(convolver);
      convolver.connect(wet);
      wet.connect(this.master);

      this.noiseBuffer = this.makeNoise(3);
      this.ready = true;
      if (this.ctx.state === 'suspended') this.ctx.resume();
    } catch {
      this.ready = false;
    }
  }

  makeImpulse(seconds, decay) {
    const rate = this.ctx.sampleRate;
    const length = Math.floor(rate * seconds);
    const buffer = this.ctx.createBuffer(2, length, rate);
    for (let c = 0; c < 2; c++) {
      const data = buffer.getChannelData(c);
      for (let i = 0; i < length; i++) {
        const t = i / length;
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, decay) * (0.6 + 0.4 * Math.sin(t * 31));
      }
    }
    return buffer;
  }

  makeNoise(seconds) {
    const rate = this.ctx.sampleRate;
    const length = Math.floor(rate * seconds);
    const buffer = this.ctx.createBuffer(2, length, rate);
    for (let c = 0; c < 2; c++) {
      const data = buffer.getChannelData(c);
      for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    }
    return buffer;
  }

  setVolume(v) {
    this.volume = Math.max(0, Math.min(1, v));
    if (this.master) this.master.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.05);
  }

  ensure() {
    if (!this.ready) this.init();
    if (this.ctx?.state === 'suspended') this.ctx.resume();
    return this.ready;
  }

  // A hidden tab must not keep a body breathing in the background. Suspend only
  // when the context was actually running: force-resuming a context the browser
  // blocked for autoplay is not a fix, it is just noise on the next tab switch.
  suspendForHidden() {
    this._hiddenSuspend = this.ctx?.state === 'running';
    if (this._hiddenSuspend) this.ctx.suspend().catch(() => {});
  }

  wakeFromHidden() {
    if (this._hiddenSuspend && this.ctx?.state === 'suspended') this.ctx.resume().catch(() => {});
    this._hiddenSuspend = false;
  }

  now() {
    return this.ctx.currentTime;
  }

  // The listener is the player: position plus the camera's right vector. Kept
  // as a cheap frame update rather than a PannerNode graph, because every sound
  // here is one-shot synthesis and a per-node HRTF would cost more than it
  // buys in a dark corridor.
  setListener(x, z, camera) {
    this._lx = x;
    this._lz = z;
    if (!camera) return;
    const m = camera.matrixWorld.elements;
    this._rx = m[0];
    this._rz = m[2];
  }

  // -1 hard left, +1 hard right. Distant sources collapse toward centre the
  // way real ones do, so a far reactor does not sit in one ear.
  panFor(x, z) {
    if (this._rx === undefined) return 0;
    const dx = x - this._lx;
    const dz = z - this._lz;
    const len = Math.hypot(dx, dz) || 1;
    const dot = (dx * this._rx + dz * this._rz) / len;
    const falloff = 1 - Math.min(1, len / 26) * 0.55;
    return Math.max(-0.85, Math.min(0.85, dot * falloff));
  }

  // Run a one-shot inside a pan context. Every tone()/noise() it spawns is
  // routed through one StereoPanner instead of the dry bus.
  playAt(x, z, fn) {
    const prev = this._pendingPan;
    this._pendingPan = this.panFor(x, z);
    try {
      return fn();
    } finally {
      this._pendingPan = prev;
    }
  }

  route(node, gainValue = 1, reverb = 0.12, bus = this.sfx) {
    const g = this.ctx.createGain();
    g.gain.value = gainValue;
    node.connect(g);
    const pan = this._pendingPan || 0;
    if (pan && this.ctx.createStereoPanner) {
      const panner = this.ctx.createStereoPanner();
      panner.pan.value = pan;
      g.connect(panner);
      panner.connect(bus);
    } else {
      g.connect(bus);
    }
    if (reverb > 0) {
      const send = this.ctx.createGain();
      send.gain.value = reverb;
      g.connect(send);
      send.connect(this.reverbSend);
    }
    return g;
  }

  tone(freq, dur, opts = {}) {
    if (!this.ensure()) return;
    const {
      type = 'sine',
      gain = 0.08,
      slide = null,
      attack = 0.006,
      bus = this.sfx,
      reverb = 0.1,
      delay = 0,
      detune = 0,
    } = opts;
    const t = this.now() + delay;
    const osc = this.ctx.createOscillator();
    const env = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(1, freq), t);
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(1, slide), t + dur);
    if (detune) osc.detune.value = detune;
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t + attack);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(env);
    this.route(env, 1, reverb, bus);
    osc.start(t);
    osc.stop(t + dur + 0.03);
  }

  noise(dur, opts = {}) {
    if (!this.ensure()) return;
    const {
      gain = 0.08,
      type = 'lowpass',
      freq = 1200,
      freqEnd = null,
      q = 0.8,
      attack = 0.004,
      bus = this.sfx,
      reverb = 0.14,
      delay = 0,
      rate = 1,
    } = opts;
    const t = this.now() + delay;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;
    src.playbackRate.value = rate;
    const filter = this.ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.setValueAtTime(freq, t);
    if (freqEnd) filter.frequency.exponentialRampToValueAtTime(Math.max(40, freqEnd), t + dur);
    filter.Q.value = q;
    const env = this.ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t + attack);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filter);
    filter.connect(env);
    this.route(env, 1, reverb, bus);
    src.start(t, Math.random() * 2);
    src.stop(t + dur + 0.05);
  }

  // ---------------------------------------------------------------- weapons
  // Four layers: the supersonic crack, the body of the report, the low chest
  // thump, and a wet room tail. The old single bandpass read as a toy cap gun.
  gunshot(tone = 'trauma') {
    if (!this.ensure()) return;
    // Each discipline fires a different round. The chassis is shared, so the
    // report is one of the few places the kit can be heard rather than seen:
    // the breacher pushes air, the field rifle is tighter and drier, the biopsy
    // build cracks sharper with a longer tail.
    const k =
      tone === 'medic'
        ? { pitch: 1.06, crack: 0.94, body: 1.04, low: 0.86, air: 1.15, gain: 0.94 }
        : tone === 'pathologist'
          ? { pitch: 1.11, crack: 1.2, body: 1.1, low: 0.7, air: 1.35, gain: 1.02 }
          : { pitch: 0.94, crack: 0.9, body: 0.87, low: 1.14, air: 0.95, gain: 1.04 };
    // Round-robin scatter. Firing nine times a second with an identical report
    // is the loudest tell of a synthesised weapon; a few percent of pitch and
    // timbre drift makes consecutive shots read as separate rounds.
    const v = (0.94 + Math.random() * 0.12) * k.pitch;
    const crack = 3200 * k.crack * (0.88 + Math.random() * 0.24);
    const body = 1500 * k.body * (0.86 + Math.random() * 0.28);
    this.noise(0.035, { gain: 0.115 * v * k.gain, type: 'highpass', freq: crack, reverb: 0.04 });
    this.noise(0.11, { gain: 0.12 * v * k.gain, type: 'bandpass', freq: body, freqEnd: 320 * v, q: 0.75, reverb: 0.18 });
    this.noise(0.26, { gain: 0.055 * k.low * k.gain, type: 'lowpass', freq: 700 * v, freqEnd: 95, delay: 0.015, reverb: 0.36 });
    this.tone(84 * v, 0.16, { type: 'triangle', gain: 0.11 * k.low, slide: 36, reverb: 0.2 });
    this.tone(155 * v, 0.045, { type: 'square', gain: 0.028, slide: 72, reverb: 0.05 });
    this.noise(0.045 * k.air, { gain: 0.026 * k.air, type: 'bandpass', freq: 2500 * k.air * (0.85 + Math.random() * 0.3), q: 2, delay: 0.055 });
  }

  dryFire() {
    this.tone(170, 0.035, { type: 'square', gain: 0.05 });
    this.noise(0.025, { gain: 0.035, type: 'highpass', freq: 2000 });
  }

  reloadStart() {
    this.noise(0.04, { gain: 0.05, type: 'bandpass', freq: 2200, q: 2 });
    this.tone(320, 0.04, { type: 'square', gain: 0.02 });
    this.noise(0.06, { gain: 0.04, type: 'bandpass', freq: 900, q: 1.4, delay: 0.12 });
  }

  reloadEnd() {
    this.noise(0.035, { gain: 0.07, type: 'bandpass', freq: 1600, q: 2 });
    this.tone(440, 0.05, { type: 'square', gain: 0.03, slide: 320 });
  }

  reloadMatched() {
    this.noise(0.03, { gain: 0.06, type: 'bandpass', freq: 2600, q: 2.4 });
    this.tone(740, 0.07, { type: 'sine', gain: 0.03, slide: 1120, reverb: 0.04 });
  }

  reloadJam() {
    this.noise(0.06, { gain: 0.07, type: 'lowpass', freq: 420, freqEnd: 180 });
    this.tone(126, 0.08, { type: 'square', gain: 0.035, slide: 92 });
  }

  hitmarker() {
    this.tone(1350, 0.06, { type: 'sine', gain: 0.035, slide: 980, reverb: 0.02 });
  }

  // Wet, close and low. A pop of trapped fluid, then a short body thud.
  enemyHit() {
    this.noise(0.055, { gain: 0.07, type: 'bandpass', freq: 980, freqEnd: 260, q: 1.3, reverb: 0.06 });
    this.noise(0.16, { gain: 0.04, type: 'lowpass', freq: 340, freqEnd: 90, delay: 0.012, reverb: 0.14 });
    this.tone(72, 0.07, { type: 'sine', gain: 0.028, slide: 48 });
  }

  enemyCrit() {
    this.noise(0.12, { gain: 0.085, type: 'bandpass', freq: 1800, freqEnd: 380, q: 1.4, reverb: 0.18 });
    this.tone(1180, 0.08, { type: 'triangle', gain: 0.03, slide: 340, reverb: 0.1 });
    this.noise(0.16, { gain: 0.045, type: 'lowpass', freq: 280, delay: 0.03, reverb: 0.2 });
  }

  // Killing something used to sound like hitting it one more time. A death is
  // three events: the shell gives, the mass empties, and the wet weight settles
  // onto the floor a beat later. weight scales the body for heavies.
  enemyDeath(weight = 1) {
    if (!this.ensure()) return;
    this.noise(0.05, { gain: 0.05, type: 'highpass', freq: 2400, delay: 0.005, reverb: 0.05 });
    this.noise(0.26, {
      gain: 0.085 * weight,
      type: 'lowpass',
      freq: 900,
      freqEnd: 150,
      q: 0.7,
      delay: 0.015,
      reverb: 0.28,
    });
    this.tone(62 * (0.85 + Math.random() * 0.3), 0.28, {
      type: 'sine',
      gain: 0.05 * weight,
      slide: 30,
      reverb: 0.24,
    });
    // The settle: a long wet suck with no transient, so it reads as mass rather
    // than another impact.
    this.noise(0.52, {
      gain: 0.028 * weight,
      type: 'bandpass',
      freq: 430,
      freqEnd: 170,
      q: 2.2,
      delay: 0.16 + Math.random() * 0.06,
      reverb: 0.38,
    });
  }

  // Fast dry ticking, not a musical cue. The point is to make something feel
  // close before it is visible.
  skitter(close = 0.5) {
    if (!this.ensure()) return;
    const gain = 0.008 + close * 0.03;
    for (let i = 0; i < 4; i++) {
      this.noise(0.018, {
        gain,
        type: 'bandpass',
        freq: 2600 - i * 260,
        q: 3.5,
        delay: i * 0.038 + Math.random() * 0.016,
        reverb: 0.02,
      });
    }
  }

  // Idle vocalisation. Never a growl sample: each silhouette gets one small
  // body sound it can make without attacking, so a room has presence before it
  // has contact. Gains sit under the ambience bed.
  enemyVoice(style = 'ground') {
    if (!this.ensure()) return;
    const v = 0.85 + Math.random() * 0.3;
    if (style === 'skitter') {
      for (let i = 0; i < 2; i++) {
        this.noise(0.016, {
          gain: 0.011,
          type: 'bandpass',
          freq: 2400 * v - i * 300,
          q: 3.2,
          delay: i * 0.05 + Math.random() * 0.02,
          reverb: 0.02,
        });
      }
      return;
    }
    if (style === 'wall' || style === 'anchored') {
      this.noise(0.4, {
        gain: 0.013,
        type: 'bandpass',
        freq: 1200 * v,
        freqEnd: 520,
        q: 2.4,
        reverb: 0.16,
      });
      return;
    }
    // Wet breath and a low body note. Heavy silhouettes get a longer tail.
    const heavy = style === 'heavy';
    this.noise(heavy ? 0.46 : 0.34, {
      gain: heavy ? 0.021 : 0.016,
      type: 'lowpass',
      freq: 420 * v,
      freqEnd: 210,
      reverb: 0.18,
    });
    this.tone(58 * v, heavy ? 0.4 : 0.3, { type: 'sine', gain: heavy ? 0.016 : 0.011, slide: 44, reverb: 0.16 });
    if (Math.random() < 0.35) {
      this.noise(0.06, { gain: 0.009, type: 'bandpass', freq: 900, q: 1.6, delay: 0.18, reverb: 0.08 });
    }
  }

  wallCrawl() {
    this.noise(0.45, { gain: 0.035, type: 'bandpass', freq: 1300, freqEnd: 600, q: 2.2, reverb: 0.24 });
    this.tone(260, 0.35, { type: 'sawtooth', gain: 0.012, slide: 190, reverb: 0.24 });
  }

  wallDrop() {
    this.noise(0.4, { gain: 0.08, type: 'lowpass', freq: 900, freqEnd: 70, reverb: 0.3 });
    this.tone(150, 0.28, { type: 'triangle', gain: 0.05, slide: 42, reverb: 0.24 });
  }

  brood() {
    if (!this.ensure()) return;
    this.noise(0.7, { gain: 0.045, type: 'lowpass', freq: 300, freqEnd: 90, attack: 0.16, reverb: 0.4 });
    this.tone(64, 0.65, { type: 'sine', gain: 0.045, slide: 38, attack: 0.1, reverb: 0.3 });
    this.noise(0.16, { gain: 0.03, type: 'bandpass', freq: 1500, freqEnd: 600, q: 1.6, delay: 0.3 });
  }

  enemyDie() {
    if (!this.ensure()) return;
    this.noise(0.08, { gain: 0.09, type: 'bandpass', freq: 1200, freqEnd: 240, q: 1.1, reverb: 0.08 });
    this.noise(0.38, { gain: 0.075, type: 'lowpass', freq: 780, freqEnd: 65, delay: 0.03, reverb: 0.24 });
    this.tone(138, 0.28, { type: 'sawtooth', gain: 0.036, slide: 52, reverb: 0.16 });
    this.tone(58, 0.3, { type: 'sine', gain: 0.04, slide: 32 });
  }

  // A wet mass hitting the organ floor: low thud, short fluid slap.
  enemyLand() {
    this.noise(0.11, { gain: 0.07, type: 'lowpass', freq: 320, freqEnd: 80, reverb: 0.12 });
    this.tone(54, 0.12, { type: 'sine', gain: 0.055, slide: 30, reverb: 0.08 });
    this.noise(0.045, { gain: 0.035, type: 'bandpass', freq: 900, q: 1.4 });
  }

  magOut() {
    if (!this.ensure()) return;
    this.noise(0.03, { gain: 0.045, type: 'bandpass', freq: 1800, q: 2 });
    this.tone(210, 0.035, { type: 'square', gain: 0.018, slide: 150 });
  }

  magIn() {
    if (!this.ensure()) return;
    this.noise(0.028, { gain: 0.06, type: 'bandpass', freq: 2400, q: 2.4 });
    this.tone(300, 0.04, { type: 'square', gain: 0.024, slide: 210 });
    this.noise(0.04, { gain: 0.03, type: 'bandpass', freq: 1200, q: 1.8, delay: 0.055 });
  }

  boltCycle() {
    if (!this.ensure()) return;
    this.noise(0.055, { gain: 0.035, type: 'bandpass', freq: 3000, q: 2.6 });
    this.tone(520, 0.03, { type: 'square', gain: 0.018, slide: 320 });
    this.noise(0.035, { gain: 0.05, type: 'bandpass', freq: 1500, q: 2, delay: 0.07 });
    this.tone(180, 0.045, { type: 'triangle', gain: 0.025, delay: 0.07 });
  }

  grenadeThrow() {
    this.noise(0.12, { gain: 0.04, type: 'highpass', freq: 1200 });
  }

  explosion() {
    if (!this.ensure()) return;
    this.noise(0.7, { gain: 0.16, type: 'lowpass', freq: 900, freqEnd: 40, reverb: 0.4 });
    this.tone(70, 0.55, { type: 'sine', gain: 0.15, slide: 28, reverb: 0.35 });
    this.noise(0.18, { gain: 0.08, type: 'bandpass', freq: 2400, q: 0.6 });
  }

  // ---------------------------------------------------------------- player
  playerHurt() {
    this.noise(0.22, { gain: 0.09, type: 'lowpass', freq: 420, freqEnd: 110, reverb: 0.2 });
    this.tone(90, 0.25, { type: 'sawtooth', gain: 0.06, slide: 55 });
  }

  hostHurt() {
    this.tone(60, 0.36, { type: 'sine', gain: 0.09, slide: 34, reverb: 0.3 });
    this.noise(0.2, { gain: 0.04, type: 'lowpass', freq: 260, reverb: 0.2 });
  }

  dash() {
    this.noise(0.18, { gain: 0.07, type: 'bandpass', freq: 700, freqEnd: 2600, q: 0.9 });
    this.tone(240, 0.12, { type: 'triangle', gain: 0.03, slide: 520 });
  }

  // Shoulder-first contact: a low body thump under a short wet tear. It has to
  // sit below the rifle crack so a dash kill still reads as melee, not a shot.
  dashStrike() {
    if (!this.ensure()) return;
    this.tone(64, 0.2, { type: 'sine', gain: 0.08, slide: 36, reverb: 0.18 });
    this.noise(0.13, { gain: 0.06, type: 'lowpass', freq: 1800, freqEnd: 240, reverb: 0.1 });
    this.tone(340, 0.06, { type: 'triangle', gain: 0.018, slide: 520 });
  }

  jump() {
    if (!this.ensure()) return;
    this.noise(0.12, { gain: 0.025, type: 'lowpass', freq: 420, freqEnd: 160, reverb: 0.08 });
    this.tone(180, 0.1, { type: 'triangle', gain: 0.018, slide: 260 });
  }

  land() {
    if (!this.ensure()) return;
    this.noise(0.2, { gain: 0.075, type: 'lowpass', freq: 260, freqEnd: 55, reverb: 0.16 });
    this.tone(72, 0.18, { type: 'sine', gain: 0.04, slide: 42 });
  }

  footstep(left = true) {
    const t = this.now();
    if (t - this.lastFoot < 0.16) return;
    this.lastFoot = t;
    // Measured at -53 dBFS before: the lowpass ate almost all of it, so steps
    // were inaudible under the rifle and movement had no weight.
    this.noise(0.075, { gain: 0.075, type: 'lowpass', freq: left ? 520 : 440, freqEnd: 120, reverb: 0.06 });
    this.noise(0.045, { gain: 0.04, type: 'bandpass', freq: 1100, q: 1.2, delay: 0.01 });
    // The tissue floor answers every step with a little fluid.
    this.noise(0.06, { gain: 0.026, type: 'bandpass', freq: 1250 + Math.random() * 500, q: 0.9, delay: 0.018, reverb: 0.03 });
  }

  stabilize() {
    if (!this.ensure()) return;
    [174, 220, 261, 329].forEach((f, i) => {
      this.tone(f, 1.1, { type: 'sine', gain: 0.022, attack: 0.08, delay: i * 0.045, reverb: 0.4 });
    });
    this.noise(0.5, { gain: 0.025, type: 'bandpass', freq: 1200, freqEnd: 400, q: 1.1 });
  }

  medkit() {
    this.noise(0.25, { gain: 0.05, type: 'bandpass', freq: 900, q: 0.8 });
    [392, 523, 659].forEach((f, i) => this.tone(f, 0.25, { type: 'sine', gain: 0.03, delay: i * 0.08 }));
  }

  cautery() {
    if (!this.ensure()) return;
    this.noise(0.85, { gain: 0.09, type: 'highpass', freq: 2400, freqEnd: 800, q: 0.7, reverb: 0.2 });
    this.tone(1200, 0.7, { type: 'sawtooth', gain: 0.016, slide: 300, reverb: 0.1 });
    this.noise(0.2, { gain: 0.04, type: 'lowpass', freq: 200, delay: 0.5 });
  }

  healHost() {
    this.tone(330, 0.7, { type: 'sine', gain: 0.035, slide: 440, reverb: 0.35 });
    this.tone(660, 0.7, { type: 'sine', gain: 0.018, slide: 880, reverb: 0.35 });
  }

  // ---------------------------------------------------------------- world
  pickup(kind = 'ammo') {
    const base = kind === 'medkit' ? 520 : 760;
    this.tone(base, 0.10, { type: 'sine', gain: 0.04 });
    this.tone(base * 1.5, 0.16, { type: 'sine', gain: 0.032, delay: 0.06 });
  }

  doorOpen() {
    this.noise(0.9, { gain: 0.07, type: 'lowpass', freq: 500, freqEnd: 130, q: 1.6, reverb: 0.3 });
    this.tone(80, 0.8, { type: 'triangle', gain: 0.04, slide: 42 });
  }

  nodeDestroyed() {
    this.noise(0.45, { gain: 0.1, type: 'lowpass', freq: 1000, freqEnd: 90, reverb: 0.3 });
    this.tone(220, 0.4, { type: 'sawtooth', gain: 0.04, slide: 55 });
  }

  channel() {
    this.tone(880, 0.05, { type: 'square', gain: 0.012 });
  }

  alarm() {
    this.tone(440, 0.22, { type: 'square', gain: 0.025, slide: 330 });
    this.tone(330, 0.22, { type: 'square', gain: 0.02, slide: 220, delay: 0.26 });
  }

  // The theatre alarm for a patient emergency: a wet tear under three clipped
  // warning pulses, not a melodic sting. It must cut through gunfire without
  // becoming the loudest thing in the mix.
  crisisStart() {
    if (!this.ensure()) return;
    this.noise(0.75, { gain: 0.065, type: 'bandpass', freq: 2100, freqEnd: 260, q: 0.8, reverb: 0.34 });
    [0, 0.22, 0.44].forEach((delay, i) => {
      this.tone(128 - i * 7, 0.17, {
        type: 'square',
        gain: 0.034,
        slide: 82,
        delay,
        reverb: 0.18,
      });
    });
    this.tone(54, 0.95, { type: 'sine', gain: 0.06, slide: 36, attack: 0.05, reverb: 0.4 });
  }

  // A round punching through an already-open artery: a short, wet pop with a
  // low thump underneath. It has to read as damage done by the player without
  // sounding like a weapon upgrade.
  crisisTear() {
    if (!this.ensure()) return;
    this.noise(0.22, { gain: 0.075, type: 'bandpass', freq: 820, freqEnd: 180, q: 1.1, reverb: 0.18 });
    this.tone(96, 0.28, { type: 'sine', gain: 0.055, slide: 54, attack: 0.005, reverb: 0.14 });
  }

  crisisSealed() {
    if (!this.ensure()) return;
    [196, 294, 392, 494].forEach((freq, i) => {
      this.tone(freq, 0.62, {
        type: 'sine',
        gain: 0.024,
        attack: 0.05,
        delay: i * 0.055,
        reverb: 0.38,
      });
    });
    this.noise(0.45, { gain: 0.034, type: 'highpass', freq: 2600, freqEnd: 900, reverb: 0.2 });
    this.noise(0.24, { gain: 0.045, type: 'lowpass', freq: 260, freqEnd: 80, delay: 0.08, reverb: 0.24 });
  }

  crisisFail() {
    if (!this.ensure()) return;
    this.noise(0.85, { gain: 0.12, type: 'lowpass', freq: 900, freqEnd: 55, reverb: 0.4 });
    this.tone(76, 0.9, { type: 'sawtooth', gain: 0.075, slide: 34, reverb: 0.32 });
    this.tone(46, 1.1, { type: 'sine', gain: 0.065, slide: 28, delay: 0.04, reverb: 0.36 });
    this.tone(300, 0.28, { type: 'square', gain: 0.022, slide: 180, delay: 0.24, reverb: 0.2 });
  }

  bossRoar() {
    if (!this.ensure()) return;
    [42, 55, 82].forEach((f, i) => {
      this.tone(f, 1.5, { type: 'sawtooth', gain: 0.045 - i * 0.008, slide: f * 0.7, attack: 0.15, reverb: 0.45 });
    });
    this.noise(1.2, { gain: 0.06, type: 'lowpass', freq: 420, freqEnd: 60, reverb: 0.45 });
  }

  bossPhase() {
    this.tone(660, 0.5, { type: 'sawtooth', gain: 0.035, slide: 220, reverb: 0.3 });
    this.noise(0.4, { gain: 0.05, type: 'bandpass', freq: 1800, q: 0.7, reverb: 0.3 });
  }

  bossDeath() {
    if (!this.ensure()) return;
    this.noise(1.8, { gain: 0.13, type: 'lowpass', freq: 1200, freqEnd: 35, reverb: 0.5 });
    [110, 82, 55, 41].forEach((f, i) =>
      this.tone(f, 1.5, { type: 'sawtooth', gain: 0.04, slide: f * 0.5, delay: i * 0.18, reverb: 0.4 })
    );
  }

  focusReady() {
    if (!this.ensure()) return;
    [520, 780, 1040].forEach((f, i) => {
      this.tone(f, 0.32, { type: 'sine', gain: 0.02, attack: 0.04, delay: i * 0.08, reverb: 0.32 });
    });
    this.noise(0.35, { gain: 0.018, type: 'bandpass', freq: 2400, freqEnd: 1200, q: 1.6, reverb: 0.3 });
  }

  chain(level = 5) {
    if (!this.ensure()) return;
    const root = 440 + Math.min(12, level) * 28;
    [1, 1.25, 1.5].forEach((ratio, i) => {
      this.tone(root * ratio, 0.22, {
        type: 'triangle',
        gain: 0.022,
        attack: 0.02,
        delay: i * 0.055,
        reverb: 0.28,
      });
    });
  }

  focusStart() {
    if (!this.ensure()) return;
    this.noise(0.55, { gain: 0.055, type: 'lowpass', freq: 900, freqEnd: 180, attack: 0.04, reverb: 0.4 });
    this.tone(72, 0.8, { type: 'sine', gain: 0.06, slide: 46, attack: 0.04, reverb: 0.35 });
    this.tone(1040, 0.34, { type: 'sine', gain: 0.018, slide: 1560, attack: 0.03, reverb: 0.3 });
  }

  focusEnd() {
    this.noise(0.3, { gain: 0.035, type: 'lowpass', freq: 420, freqEnd: 120, reverb: 0.22 });
    this.tone(130, 0.3, { type: 'sine', gain: 0.025, slide: 78, reverb: 0.2 });
  }

  heartbeat(strength = 0.4) {
    if (!this.ensure()) return;
    const g = 0.035 + strength * 0.07;
    this.tone(58, 0.14, { type: 'sine', gain: g, slide: 38, attack: 0.01, reverb: 0.08 });
    this.tone(46, 0.18, { type: 'sine', gain: g * 0.65, slide: 32, delay: 0.16, attack: 0.012, reverb: 0.08 });
  }

  victory() {
    if (!this.ensure()) return;
    const notes = [130.8, 164.8, 196, 261.6];
    notes.forEach((f, i) => {
      this.tone(f, 3.2, { type: 'sine', gain: 0.03, attack: 0.5, delay: i * 0.15, bus: this.music, reverb: 0.55 });
      this.tone(f * 2, 2.4, { type: 'triangle', gain: 0.012, attack: 0.6, delay: i * 0.15 + 0.2, bus: this.music, reverb: 0.6 });
    });
  }

  deflate() {
    this.tone(220, 1.8, { type: 'sine', gain: 0.04, slide: 55, attack: 0.1, bus: this.music, reverb: 0.4 });
    this.noise(1.4, { gain: 0.03, type: 'lowpass', freq: 600, freqEnd: 70, reverb: 0.4 });
  }

  // A physical switch, not a beep: a dry contact tick, a short pitched body and
  // a low thump, with a few percent of pitch scatter so a fast menu does not
  // sound like a test tone.
  ui(confirm = false) {
    if (!this.ensure()) return;
    const jitter = 0.96 + Math.random() * 0.08;
    // Three quiet layers, not one loud one: summed they land near the level of
    // the old single blip while carrying contact and body.
    this.noise(0.026, { gain: 0.018, type: 'highpass', freq: 2500 * jitter, q: 1.3, reverb: 0.02 });
    this.tone((confirm ? 610 : 860) * jitter, 0.05, {
      type: 'sine',
      gain: 0.016,
      slide: (confirm ? 900 : 640) * jitter,
      reverb: 0.03,
    });
    this.tone(confirm ? 185 : 235, 0.075, { type: 'triangle', gain: 0.011, slide: 118, reverb: 0.02 });
  }

  // ---------------------------------------------------------------- ambience
  startAmbient(biome = 'lung') {
    if (!this.ensure()) return;
    this.stopAmbient();
    const heart = biome === 'heart';
    const root = heart ? 41.2 : 55;
    const nodes = [];
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = heart ? 260 : 340;
    filter.Q.value = 1.2;
    const gain = this.ctx.createGain();
    gain.gain.value = 0.0001;
    gain.gain.exponentialRampToValueAtTime(heart ? 0.035 : 0.028, this.now() + 1.8);
    filter.connect(gain);
    gain.connect(this.music);
    const send = this.ctx.createGain();
    send.gain.value = 0.25;
    gain.connect(send);
    send.connect(this.reverbSend);

    [1, 1.5, 2.01, 3.98].forEach((mult, i) => {
      const osc = this.ctx.createOscillator();
      osc.type = i < 2 ? 'sine' : 'triangle';
      osc.frequency.value = root * mult;
      osc.detune.value = (i - 1.5) * 5;
      const g = this.ctx.createGain();
      g.gain.value = i === 0 ? 0.5 : 0.14;
      osc.connect(g);
      g.connect(filter);
      osc.start();
      nodes.push(osc);
    });

    // Breath bed.
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = heart ? 180 : 320;
    bp.Q.value = 0.4;
    const ng = this.ctx.createGain();
    ng.gain.value = 0.0001;
    ng.gain.exponentialRampToValueAtTime(heart ? 0.018 : 0.03, this.now() + 2);
    src.connect(bp);
    bp.connect(ng);
    ng.connect(this.music);
    src.start();
    nodes.push(src);

    this.ambient = { nodes, gain, filter, ng, heart };
    this.bossLayer = null;
    this.ambientDrift = 0;
    this.ambientFilterTimer = 0;
    this.ambientEvent = 2 + Math.random() * 4;
    this.setTension(0.2);
  }

  // Per-step life for the ambience bed. The drone used to be a static chord,
  // which is what made being inside a body sound like a synth patch. Now the
  // filter breathes on a slow cycle and the tissue occasionally shifts.
  ambientTick(dt, tension = 0.3) {
    if (!this.ambient || !this.ready) return;
    const a = this.ambient;
    this.ambientDrift += dt;
    // The breath period is ~15 s, so 10 Hz is plenty. Writing a ramp every fixed
    // step would queue 60 automation events a second for no audible gain.
    this.ambientFilterTimer = (this.ambientFilterTimer || 0) - dt;
    if (this.ambientFilterTimer <= 0) {
      this.ambientFilterTimer = 0.1;
      const breath = Math.sin(this.ambientDrift * 0.42) * 0.5 + 0.5;
      a.filter.frequency.setTargetAtTime(
        (a.heart ? 240 : 300) + breath * 90 + tension * 240,
        this.now(),
        0.5
      );
    }
    this.ambientEvent -= dt;
    if (this.ambientEvent <= 0) {
      // Busier when the organ is in trouble, but never a metronome.
      this.ambientEvent = 3.5 + Math.random() * 7 - tension * 2.2;
      this.ambientOneShot();
    }
  }

  // Something moving in the tissue, placed off-centre so the body has depth.
  ambientOneShot() {
    if (!this.ensure()) return;
    const roll = Math.random();
    const prev = this._pendingPan;
    this._pendingPan = Math.random() * 1.5 - 0.75;
    try {
      if (roll < 0.4) {
        // Fluid shifting through a duct.
        this.noise(0.7 + Math.random() * 0.6, {
          gain: 0.014, type: 'bandpass',
          freq: 260 + Math.random() * 240, freqEnd: 90, q: 3.2,
          attack: 0.25, reverb: 0.5,
        });
      } else if (roll < 0.75) {
        // A membrane stretching under load.
        this.tone(58 + Math.random() * 42, 0.9, {
          type: 'sine', gain: 0.013, slide: 40, attack: 0.3, reverb: 0.45,
        });
      } else {
        // Dry movement, just out of sight.
        const n = 3 + Math.floor(Math.random() * 3);
        for (let i = 0; i < n; i++) {
          this.noise(0.05, {
            gain: 0.009, type: 'highpass', freq: 2200 + Math.random() * 1400,
            delay: i * (0.07 + Math.random() * 0.05), reverb: 0.1,
          });
        }
      }
    } finally {
      this._pendingPan = prev;
    }
  }

  setTension(t) {
    if (!this.ambient) return;
    const now = this.now();
    const n = Math.max(0, Math.min(1, t));
    // The filter is owned by ambientTick, which lands a value every fixed step;
    // a second writer here would be overwritten within 16 ms. Tension drives the
    // breath bed gain only.
    this.ambient.tension = n;
    this.ambient.ng.gain.setTargetAtTime(0.012 + n * 0.03, now, 0.9);
  }

  setBossLayer(active) {
    if (!this.ready || !this.ambient) return;
    if (active && !this.bossLayer) {
      const gain = this.ctx.createGain();
      gain.gain.value = 0.0001;
      gain.gain.exponentialRampToValueAtTime(0.03, this.now() + 2);
      gain.connect(this.music);
      const send = this.ctx.createGain();
      send.gain.value = 0.3;
      gain.connect(send);
      send.connect(this.reverbSend);
      const oscs = [];
      [36.7, 55, 73.4].forEach((f) => {
        const o = this.ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = f;
        o.detune.value = Math.random() * 8 - 4;
        const lp = this.ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 140;
        o.connect(lp);
        lp.connect(gain);
        o.start();
        oscs.push(o);
      });
      this.bossLayer = { gain, oscs };
    } else if (!active && this.bossLayer) {
      const { gain, oscs } = this.bossLayer;
      gain.gain.setTargetAtTime(0.0001, this.now(), 0.4);
      oscs.forEach((o) => o.stop(this.now() + 1.4));
      this.bossLayer = null;
    }
  }

  stopAmbient() {
    if (!this.ambient || !this.ctx) return;
    const { nodes, gain } = this.ambient;
    try {
      gain.gain.setTargetAtTime(0.0001, this.now(), 0.35);
      nodes.forEach((n) => {
        if (n.stop) n.stop(this.now() + 1.6);
      });
    } catch {
      /* already stopped */
    }
    this.ambient = null;
    this.setBossLayer(false);
  }
}

export const audio = new AudioEngine();
