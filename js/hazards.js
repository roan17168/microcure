// ============================================
// Environmental Hazards — Acid, Electric, Wind, Hallucination
// ============================================

const Hazards = {
  update() {
    for (let h of Game.hazards) {
      h.phase += 0.04;

      // Electric hazards pulse on/off
      if (h.type === 'electric') {
        h.active = (Math.sin(h.phase * 0.5) > 0);
      }

      if (!h.active && h.type === 'electric') continue;

      // Damage player if inside
      const inside = h.type === 'rect'
        ? (Game.player.x > h.x && Game.player.x < h.x + h.w && Game.player.y > h.y && Game.player.y < h.y + h.h)
        : dist(Game.player.x, Game.player.y, h.x, h.y) < h.radius;

      // Force-style hazards (wind)
      if (h.type === 'wind') {
        const dx = Game.player.x - h.x;
        const dy = Game.player.y - h.y;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < h.radius) {
          const force = (1 - d / h.radius) * 0.8;
          Game.player.vx += Math.cos(h.angle) * force;
          Game.player.vy += Math.sin(h.angle) * force;
        }
        continue;
      }

      if (inside && Game.player.invuln <= 0) {
        Player.takeDamage(h.damage);
      }
    }
  },

  create(type, opts) {
    return {
      type,
      x: opts.x, y: opts.y,
      w: opts.w || 0, h: opts.h || 0,
      radius: opts.radius || 0,
      angle: opts.angle || 0,
      damage: opts.damage || 2,
      color: opts.color || '#ff0000',
      active: true,
      phase: Math.random() * Math.PI * 2,
      hazardName: opts.name || type,
    };
  },
};
