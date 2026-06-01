// ============================================
// Particle Effects
// ============================================

const Particles = {
  spawn(x, y, count, color, options = {}) {
    const speed = options.speed || 4;
    const life = options.life || 30;
    const size = options.size || 3;
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = Math.random() * speed + 1;
      Game.particles.push({
        x, y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        life,
        maxLife: life,
        color,
        size: size * (0.5 + Math.random() * 0.5),
      });
    }
  },

  update() {
    for (let i = Game.particles.length - 1; i >= 0; i--) {
      const p = Game.particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vx *= 0.92;
      p.vy *= 0.92;
      p.life--;
      if (p.life <= 0) Game.particles.splice(i, 1);
    }
  },

  spawnAmbientCells() {
    Game.ambientCells = [];
    for (let i = 0; i < 25; i++) {
      Game.ambientCells.push({
        x: Math.random() * Game.W,
        y: Math.random() * Game.H,
        vx: (Math.random() - 0.5) * 0.4,
        vy: (Math.random() - 0.5) * 0.4,
        size: 1 + Math.random() * 3,
        alpha: 0.15 + Math.random() * 0.3,
        phase: Math.random() * Math.PI * 2,
      });
    }
  },

  updateAmbient() {
    Game.ambientCells.forEach(c => {
      c.x += c.vx;
      c.y += c.vy;
      c.phase += 0.02;
      if (c.x < 0) c.x = Game.W;
      if (c.x > Game.W) c.x = 0;
      if (c.y < 0) c.y = Game.H;
      if (c.y > Game.H) c.y = 0;
    });
  },
};
