// ============================================
// Audio System — Procedural Web Audio
// ============================================

const Audio = {
  init() {
    if (Game.audioContext) return;
    try {
      Game.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    } catch (e) { console.warn('AudioContext unavailable'); }
  },

  play(freq, dur, type = 'sine', volume = 0.08) {
    if (!Game.audioContext) return;
    try {
      const osc = Game.audioContext.createOscillator();
      const gain = Game.audioContext.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, Game.audioContext.currentTime);
      osc.frequency.exponentialRampToValueAtTime(Math.max(0.01, freq * 0.5), Game.audioContext.currentTime + dur);
      gain.gain.setValueAtTime(volume, Game.audioContext.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, Game.audioContext.currentTime + dur);
      osc.connect(gain);
      gain.connect(Game.audioContext.destination);
      osc.start();
      osc.stop(Game.audioContext.currentTime + dur);
    } catch (e) {}
  },

  shoot(charge = 0)   { this.play(600 + charge * 400, 0.08, 'sawtooth'); },
  hit()               { this.play(180, 0.15, 'square'); },
  enemyDie()          { this.play(150, 0.25, 'sawtooth'); },
  reload()            { this.play(400, 0.3, 'sine'); },
  grenade()           { this.play(250, 0.2, 'triangle'); },
  shield()            { this.play(700, 0.4, 'sine'); },
  dash()              { this.play(1000, 0.15, 'sawtooth'); },
  switchWeapon()      { this.play(800, 0.1, 'sine'); },
  pickup()            { this.play(900, 0.2, 'sine'); },
  explosion()         { this.play(80, 0.5, 'sawtooth', 0.12); },
  empty()             { this.play(150, 0.1, 'square'); },
  organEntry()        { this.play(300, 0.8, 'sine'); },
  bossWarning()       { this.play(80, 1.5, 'sawtooth'); },
  levelUp() {
    this.play(800, 0.5, 'sine');
    setTimeout(() => this.play(1200, 0.5, 'sine'), 200);
  },

  startHeartbeat() {
    if (Game.heartbeatInterval) clearInterval(Game.heartbeatInterval);
    Game.heartbeatInterval = setInterval(() => {
      if (!Game.running) return;
      this.play(55, 0.15, 'sine');
      setTimeout(() => this.play(45, 0.2, 'sine'), 180);
    }, 1100);
  },

  stopHeartbeat() {
    if (Game.heartbeatInterval) {
      clearInterval(Game.heartbeatInterval);
      Game.heartbeatInterval = null;
    }
  },
};
