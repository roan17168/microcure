// ============================================
// Enemies — Spawning, AI, Damage, Death
// ============================================

const Enemies = {
  spawn(type, x, y, difficultyMult = 1) {
    const template = CONFIG.ENEMIES[type];
    if (!template) return;
    Game.enemies.push({
      type,
      x, y,
      vx: 0, vy: 0,
      health: template.health * difficultyMult,
      maxHealth: template.health * difficultyMult,
      damage: template.damage * difficultyMult,
      speed: template.speed,
      radius: template.radius,
      color: template.color,
      attackRange: template.attackRange,
      xp: template.xp,
      credit: template.credit,
      ranged: template.ranged || false,
      cloaked: template.cloaked || false,
      explodesOnDeath: template.explodesOnDeath || false,
      spikes: template.spikes || 0,
      lastAttack: 0,
      hitFlash: 0,
      phase: Math.random() * Math.PI * 2,
      isBoss: false,
    });
  },

  spawnBoss(level, x, y) {
    const template = CONFIG.BOSSES[Math.min(level, CONFIG.BOSSES.length - 1)];
    Game.enemies.push({
      type: 'boss',
      bossName: template.name,
      x, y,
      vx: 0, vy: 0,
      health: template.health,
      maxHealth: template.health,
      damage: template.damage,
      speed: template.speed,
      radius: template.radius,
      color: template.color,
      attackRange: 60,
      xp: template.xp,
      credit: template.credit,
      ranged: true,
      lastAttack: 0,
      hitFlash: 0,
      phase: 0,
      isBoss: true,
      phaseRing: 0,
      shootPattern: 0,
    });
    Audio.bossWarning();
    Game.screenShake = 30;
    showMessage('⚠ ' + template.name + ' ⚠', 3000, '#f0f');
    Game.bossSpawned = true;
  },

  update() {
    for (let i = Game.enemies.length - 1; i >= 0; i--) {
      const e = Game.enemies[i];
      e.phase += 0.05;
      if (e.hitFlash > 0) e.hitFlash--;

      const ang = angleTo(e.x, e.y, Game.player.x, Game.player.y);
      const d = dist(e.x, e.y, Game.player.x, Game.player.y);

      // Boss behavior
      if (e.isBoss) {
        // Move toward player, but keep distance
        if (d > 200) {
          e.vx = Math.cos(ang) * e.speed;
          e.vy = Math.sin(ang) * e.speed;
        } else if (d < 120) {
          e.vx = -Math.cos(ang) * e.speed * 0.5;
          e.vy = -Math.sin(ang) * e.speed * 0.5;
        } else {
          e.vx *= 0.9;
          e.vy *= 0.9;
        }

        // Multi-pattern shooting
        if (Game.time - e.lastAttack > 700) {
          e.shootPattern = (e.shootPattern + 1) % 3;
          if (e.shootPattern === 0) {
            // Triple shot
            for (let a = -0.3; a <= 0.3; a += 0.3) {
              const aim = ang + a;
              Projectiles.enemyFire(e.x, e.y, e.x + Math.cos(aim) * 100, e.y + Math.sin(aim) * 100, e.damage * 0.5, 5);
            }
          } else if (e.shootPattern === 1) {
            // Spiral burst
            for (let a = 0; a < Math.PI * 2; a += Math.PI / 4) {
              Projectiles.enemyFire(e.x, e.y, e.x + Math.cos(a + e.phase) * 100, e.y + Math.sin(a + e.phase) * 100, e.damage * 0.4, 4);
            }
          } else {
            // Aimed heavy shot
            Projectiles.enemyFire(e.x, e.y, Game.player.x, Game.player.y, e.damage * 0.8, 7);
          }
          e.lastAttack = Game.time;
        }
        e.phaseRing += 0.03;
      }
      // Ranged enemies (phantom)
      else if (e.ranged) {
        if (d > e.attackRange) {
          e.vx = Math.cos(ang) * e.speed;
          e.vy = Math.sin(ang) * e.speed;
        } else if (d < e.attackRange * 0.7) {
          e.vx = -Math.cos(ang) * e.speed;
          e.vy = -Math.sin(ang) * e.speed;
        } else {
          e.vx *= 0.85;
          e.vy *= 0.85;
        }
        if (d < e.attackRange && Game.time - e.lastAttack > 1100) {
          Projectiles.enemyFire(e.x, e.y, Game.player.x, Game.player.y, e.damage, 4.5);
          e.lastAttack = Game.time;
        }
      }
      // Melee enemies (spiker, bloater, cloaker)
      else {
        e.vx = Math.cos(ang) * e.speed;
        e.vy = Math.sin(ang) * e.speed;

        // Cloaker uses bursts of speed
        if (e.cloaked && d < 100) {
          e.vx *= 1.4;
          e.vy *= 1.4;
        }

        if (d < e.attackRange && Game.time - e.lastAttack > 600) {
          Player.takeDamage(e.damage);
          e.lastAttack = Game.time;
        }
      }

      // Apply velocity
      e.x += e.vx;
      e.y += e.vy;

      // Resolve against obstacles
      Obstacles.resolve(e);

      // Stay in bounds
      e.x = clamp(e.x, e.radius, Game.W - e.radius);
      e.y = clamp(e.y, e.radius, Game.H - e.radius);

      // Enemy-enemy soft separation
      for (let j = i + 1; j < Game.enemies.length; j++) {
        const o = Game.enemies[j];
        const dd = dist(e.x, e.y, o.x, o.y);
        const min = e.radius + o.radius;
        if (dd < min && dd > 0) {
          const push = (min - dd) / 2;
          const ax = (e.x - o.x) / dd;
          const ay = (e.y - o.y) / dd;
          e.x += ax * push;
          e.y += ay * push;
          o.x -= ax * push;
          o.y -= ay * push;
        }
      }
    }
  },

  damage(index, amount) {
    const e = Game.enemies[index];
    if (!e) return;
    e.health -= amount;
    e.hitFlash = 8;
    Audio.hit();

    if (e.health <= 0) {
      this.kill(index);
    }
  },

  kill(index) {
    const e = Game.enemies[index];
    if (!e) return;

    // Death effects
    Particles.spawn(e.x, e.y, 24, e.color, { speed: 6, life: 35, size: 4 });
    Audio.enemyDie();
    Game.screenShake = e.isBoss ? 20 : 6;

    // Bloater explodes
    if (e.explodesOnDeath) {
      Projectiles.explode(e.x, e.y, 80, e.damage * 1.5);
    }

    // Boss death
    if (e.isBoss) {
      Particles.spawn(e.x, e.y, 80, e.color, { speed: 12, life: 60, size: 8 });
      Particles.spawn(e.x, e.y, 40, '#ffff44', { speed: 6, life: 40, size: 6 });
      showMessage('BOSS DEFEATED!', 2500, '#0f0');
      Game.bossesDefeated++;
      Game.bossSpawned = false;
    }

    // Drop pickup
    if (Math.random() < (e.isBoss ? 1.0 : 0.30)) {
      Pickups.spawn(e.x, e.y);
      if (e.isBoss) {
        // Bosses drop multiple
        for (let k = 0; k < 3; k++) {
          Pickups.spawn(e.x + (Math.random() - 0.5) * 40, e.y + (Math.random() - 0.5) * 40);
        }
      }
    }

    // Award XP, credit, score
    Game.player.xp += e.xp;
    Game.creditsEarned += e.credit;
    Game.score += e.xp;

    // Level up check
    while (Game.player.xp >= Game.player.xpNext) {
      Game.player.xp -= Game.player.xpNext;
      Game.player.level++;
      Game.player.maxHealth += CONFIG.PLAYER.LEVEL_HP_BONUS;
      Game.player.health = Game.player.maxHealth;
      Game.player.xpNext = Math.floor(CONFIG.PLAYER.XP_BASE * Math.pow(CONFIG.PLAYER.XP_SCALE, Game.player.level - 1));
      Audio.levelUp();
      showMessage('LEVEL UP! Lv ' + Game.player.level, 1500, '#ff8');
    }

    Game.enemies.splice(index, 1);
  },

  populate(organ, difficultyMult) {
    const data = CONFIG.ORGANS[organ];
    const count = Math.floor(data.count * (0.8 + difficultyMult * 0.15));
    let placed = 0;
    let attempts = 0;
    while (placed < count && attempts < 200) {
      attempts++;
      const x = randRange(80, Game.W - 80);
      const y = randRange(80, Game.H - 80);
      // Don't spawn too close to player
      if (dist(x, y, Game.player.x, Game.player.y) < 200) continue;
      // Don't spawn inside obstacles
      if (Obstacles.isBlocked(x, y, 20)) continue;
      const type = pickRandom(data.enemyTypes);
      this.spawn(type, x, y, difficultyMult);
      placed++;
    }
  },
};
