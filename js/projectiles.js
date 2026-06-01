// ============================================
// Projectiles, Grenades, Explosions
// ============================================

const Projectiles = {
  fire(x, y, angle, damage, weapon, charge = 0) {
    const speed = weapon.id === 'sniper' ? 18 : weapon.id === 'beam' ? 25 : 12;
    Game.projectiles.push({
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      damage,
      life: weapon.id === 'sniper' ? 60 : 50,
      color: weapon.color,
      size: weapon.canCharge && charge > 0.3 ? 5 + charge * 6 : 4,
      piercing: weapon.piercing || false,
      pierced: [],
      explosive: weapon.explosive || false,
      explosionRadius: weapon.explosionRadius || 0,
      trail: [],
    });
  },

  enemyFire(x, y, tx, ty, damage, speed = 5) {
    const ang = angleTo(x, y, tx, ty);
    Game.enemyProjectiles.push({
      x, y,
      vx: Math.cos(ang) * speed,
      vy: Math.sin(ang) * speed,
      damage,
      life: 90,
      color: '#ff4444',
      size: 5,
    });
  },

  throwGrenade() {
    if (Game.player.grenades <= 0) return;
    const ang = angleTo(Game.player.x, Game.player.y, Game.mouse.x, Game.mouse.y);
    const targetDist = Math.min(300, dist(Game.player.x, Game.player.y, Game.mouse.x, Game.mouse.y));
    Game.grenades.push({
      x: Game.player.x,
      y: Game.player.y,
      vx: Math.cos(ang) * 7,
      vy: Math.sin(ang) * 7,
      life: Math.floor(targetDist / 7),
      damage: 80,
      radius: 70,
    });
    Game.player.grenades--;
    Audio.grenade();
  },

  update() {
    // Player projectiles
    for (let i = Game.projectiles.length - 1; i >= 0; i--) {
      const p = Game.projectiles[i];
      p.trail.push({ x: p.x, y: p.y });
      if (p.trail.length > 6) p.trail.shift();

      p.x += p.vx;
      p.y += p.vy;
      p.life--;

      // Hit obstacles (non-piercing)
      if (!p.piercing && Obstacles.checkCollision(p.x, p.y, p.size)) {
        if (p.explosive) this.explode(p.x, p.y, p.explosionRadius, p.damage);
        Particles.spawn(p.x, p.y, 4, p.color, { speed: 2, life: 15 });
        Game.projectiles.splice(i, 1);
        continue;
      }

      // Out of bounds or dead
      if (p.life <= 0 || p.x < 0 || p.x > Game.W || p.y < 0 || p.y > Game.H) {
        if (p.explosive) this.explode(p.x, p.y, p.explosionRadius, p.damage);
        Game.projectiles.splice(i, 1);
        continue;
      }

      // Hit enemies
      let hit = false;
      for (let j = Game.enemies.length - 1; j >= 0; j--) {
        const e = Game.enemies[j];
        if (p.piercing && p.pierced.indexOf(j) !== -1) continue;
        if (dist(p.x, p.y, e.x, e.y) < e.radius + p.size) {
          Enemies.damage(j, p.damage);
          Particles.spawn(p.x, p.y, 6, p.color, { speed: 3, life: 20 });
          if (p.explosive) {
            this.explode(p.x, p.y, p.explosionRadius, p.damage);
            hit = true;
            break;
          }
          if (p.piercing) {
            p.pierced.push(j);
          } else {
            hit = true;
            break;
          }
        }
      }
      if (hit) Game.projectiles.splice(i, 1);
    }

    // Enemy projectiles
    for (let i = Game.enemyProjectiles.length - 1; i >= 0; i--) {
      const p = Game.enemyProjectiles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.life--;

      if (Obstacles.checkCollision(p.x, p.y, p.size)) {
        Particles.spawn(p.x, p.y, 3, p.color, { speed: 2, life: 12 });
        Game.enemyProjectiles.splice(i, 1);
        continue;
      }

      if (p.life <= 0 || p.x < 0 || p.x > Game.W || p.y < 0 || p.y > Game.H) {
        Game.enemyProjectiles.splice(i, 1);
        continue;
      }

      // Hit player
      if (dist(p.x, p.y, Game.player.x, Game.player.y) < Game.player.radius + p.size) {
        Player.takeDamage(p.damage);
        Particles.spawn(p.x, p.y, 6, p.color, { speed: 3, life: 18 });
        Game.enemyProjectiles.splice(i, 1);
      }
    }

    // Grenades
    for (let i = Game.grenades.length - 1; i >= 0; i--) {
      const g = Game.grenades[i];
      g.x += g.vx;
      g.y += g.vy;
      g.vx *= 0.96;
      g.vy *= 0.96;
      g.life--;

      // Bounce off obstacles
      if (Obstacles.checkCollision(g.x, g.y, 6)) {
        g.vx = -g.vx * 0.5;
        g.vy = -g.vy * 0.5;
        g.x += g.vx * 2;
        g.y += g.vy * 2;
      }

      if (g.life <= 0) {
        this.explode(g.x, g.y, g.radius, g.damage);
        Game.grenades.splice(i, 1);
      }
    }
  },

  explode(x, y, radius, damage) {
    // Visual
    Particles.spawn(x, y, 40, '#ff8800', { speed: 8, life: 30, size: 5 });
    Particles.spawn(x, y, 20, '#ffff00', { speed: 5, life: 20, size: 6 });
    Game.screenShake = 12;
    Audio.explosion();

    // Damage enemies
    for (let i = Game.enemies.length - 1; i >= 0; i--) {
      const e = Game.enemies[i];
      const d = dist(x, y, e.x, e.y);
      if (d < radius + e.radius) {
        const falloff = 1 - (d / (radius + e.radius));
        Enemies.damage(i, damage * falloff);
      }
    }

    // Damage player (smaller)
    const playerD = dist(x, y, Game.player.x, Game.player.y);
    if (playerD < radius + Game.player.radius) {
      const falloff = 1 - (playerD / (radius + Game.player.radius));
      Player.takeDamage(damage * 0.3 * falloff);
    }
  },
};
