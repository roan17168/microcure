// ============================================
// Obstacles — Walls, Cover, Collision
// ============================================

const Obstacles = {
  // Check if a point overlaps any solid obstacle
  checkCollision(x, y, radius = 0) {
    for (let o of Game.obstacles) {
      if (o.shape === 'rect') {
        if (x + radius > o.x && x - radius < o.x + o.w &&
            y + radius > o.y && y - radius < o.y + o.h) {
          return o;
        }
      } else if (o.shape === 'circle') {
        if (dist(x, y, o.x, o.y) < o.radius + radius) return o;
      }
    }
    return null;
  },

  // Push an entity out of collision (used for player & enemies)
  resolve(entity) {
    for (let o of Game.obstacles) {
      if (o.shape === 'rect') {
        // Find closest point on the rect to the entity
        const cx = clamp(entity.x, o.x, o.x + o.w);
        const cy = clamp(entity.y, o.y, o.y + o.h);
        const dx = entity.x - cx;
        const dy = entity.y - cy;
        const d2 = dx * dx + dy * dy;
        const r = entity.radius;
        if (d2 < r * r && d2 > 0) {
          const d = Math.sqrt(d2);
          entity.x += (dx / d) * (r - d);
          entity.y += (dy / d) * (r - d);
        } else if (d2 === 0) {
          // Inside the rect — push out by shortest side
          const dxL = entity.x - o.x;
          const dxR = o.x + o.w - entity.x;
          const dyT = entity.y - o.y;
          const dyB = o.y + o.h - entity.y;
          const m = Math.min(dxL, dxR, dyT, dyB);
          if (m === dxL) entity.x = o.x - r;
          else if (m === dxR) entity.x = o.x + o.w + r;
          else if (m === dyT) entity.y = o.y - r;
          else entity.y = o.y + o.h + r;
        }
      } else if (o.shape === 'circle') {
        const dx = entity.x - o.x;
        const dy = entity.y - o.y;
        const d = Math.sqrt(dx * dx + dy * dy);
        const need = o.radius + entity.radius;
        if (d < need && d > 0) {
          entity.x += (dx / d) * (need - d);
          entity.y += (dy / d) * (need - d);
        }
      }
    }
  },

  create(shape, opts) {
    return {
      shape,
      x: opts.x, y: opts.y,
      w: opts.w || 0, h: opts.h || 0,
      radius: opts.radius || 0,
      color: opts.color || '#444',
      decor: opts.decor || null,
      phase: Math.random() * Math.PI * 2,
    };
  },

  // Is point inside any obstacle? (for safe-spawning)
  isBlocked(x, y, padding = 0) {
    return this.checkCollision(x, y, padding) !== null;
  },
};
