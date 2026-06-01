// ============================================
// Player — Spawn, Movement, Combat, Damage
// ============================================

const Player = {
  spawn() {
    const upgrades = playerData.upgrades;
    Game.player = {
      x: Game.W / 2,
      y: Game.H / 2,
      vx: 0, vy: 0,
      radius: CONFIG.PLAYER.RADIUS,
      maxHealth: CONFIG.PLAYER.BASE_HEALTH + upgrades.health * 25,
      health: 0,
      maxShield: CONFIG.PLAYER.BASE_SHIELD + upgrades.shield * 25,
      shield: 0,
      shieldActive: false,
      shieldEnd: 0,
      shieldCDEnd: 0,
      speed: CONFIG.PLAYER.BASE_SPEED * (1 + upgrades.speed * 0.10),
      level: 1,
      xp: 0,
      xpNext: CONFIG.PLAYER.XP_BASE,
      weaponIndex: 0,
      grenades: CONFIG.PLAYER.BASE_GRENADES + upgrades.grenade * 2,
      maxGrenades: CONFIG.PLAYER.BASE_GRENADES + upgrades.grenade * 2,
      isCharging: false,
      chargeLevel: 0,
      dashEnd: 0,
      dashCDEnd: 0,
      invuln: 0,
      angle: 0,
      regenTimer: 0,
    };
    Game.player.health = Game.player.maxHealth;
  },

  update(dt) {
    const p = Game.player;

    // Aim angle
    p.angle = angleTo(p.x, p.y, Game.mouse.x, Game.mouse.y);

    // Decay timers
    if (p.invuln > 0) p.invuln -= dt;
    if (p.shieldActive && Game.time > p.shieldEnd) p.shieldActive = false;

    // Movement input
    let mvx = 0, mvy = 0;
    if (Game.keys['KeyW']) mvy -= 1;
    if (Game.keys['KeyS']) mvy += 1;
    if (Game.keys['KeyA']) mvx -= 1;
    if (Game.keys['KeyD']) mvx += 1;
    const mag = Math.sqrt(mvx * mvx + mvy * mvy);
    if (mag > 0) {
      mvx /= mag;
      mvy /= mag;
    }

    // Dash boost
    const dashing = Game.time < p.dashEnd;
    const speedMult = dashing ? 4 : 1;

    p.vx += mvx * p.speed * speedMult * 0.4;
    p.vy += mvy * p.speed * speedMult * 0.4;
    p.vx *= 0.78;
    p.vy *= 0.78;

    p.x += p.vx;
    p.y += p.vy;

    // Stay in bounds
    p.x = clamp(p.x, p.radius, Game.W - p.radius);
    p.y = clamp(p.y, p.radius, Game.H - p.radius);

    // Resolve obstacle collisions
    Obstacles.resolve(p);

    // Charge build-up
    if (p.isCharging) {
      p.chargeLevel = Math.min(1, p.chargeLevel + 0.012);
    }

    // Auto-fire for held-down non-charging weapons
    if (Game.mouse.down) {
      const w = Game.weapons[p.weaponIndex];
      if (w && !w.canCharge) this.shoot();
    }

    // Passive regen (from mid-mission bonus)
    if (Game.midRunBonuses.regen > 0) {
      p.regenTimer += dt;
      if (p.regenTimer > 1000) {
        p.regenTimer = 0;
        p.health = Math.min(p.maxHealth, p.health + Game.midRunBonuses.regen);
      }
    }

    // Hazards
    Hazards.update();

    // Reload check
    Weapons.updateReloads();
  },

  shoot() {
    const p = Game.player;
    const w = Game.weapons[p.weaponIndex];
    if (!w) return;
    if (w.reloading) return;
    if (w.ammo <= 0) {
      Audio.empty();
      Weapons.startReload(w);
      return;
    }

    const fireRate = w.fireRate / Game.midRunBonuses.fireRateMult;
    if (Game.time - w.lastShotTime < fireRate) return;
    w.lastShotTime = Game.time;

    let damage = w.damage * Game.midRunBonuses.dmgMult;
    const charge = w.canCharge ? p.chargeLevel : 0;
    if (charge > 0) damage *= 1 + charge * 2;

    // Shotgun pellets
    if (w.pellets) {
      for (let i = 0; i < w.pellets; i++) {
        const spread = (Math.random() - 0.5) * (w.spread || 0);
        Projectiles.fire(p.x, p.y, p.angle + spread, damage, w, charge);
      }
    } else {
      const spread = w.spread ? (Math.random() - 0.5) * w.spread : 0;
      Projectiles.fire(p.x, p.y, p.angle + spread, damage, w, charge);
    }

    w.ammo--;
    Audio.shoot(charge);
    p.chargeLevel = 0;

    // Auto-reload if empty
    if (w.ammo <= 0) Weapons.startReload(w);
  },

  reload() {
    const w = Game.weapons[Game.player.weaponIndex];
    if (w) Weapons.startReload(w);
  },

  switchWeapon(idx) {
    if (idx >= 0 && idx < Game.weapons.length && Game.weapons[idx]) {
      Game.player.weaponIndex = idx;
      Game.player.isCharging = false;
      Game.player.chargeLevel = 0;
      Audio.switchWeapon();
    }
  },

  activateShield() {
    const p = Game.player;
    if (Game.time < p.shieldCDEnd) return;
    p.shieldActive = true;
    p.shield = p.maxShield;
    p.shieldEnd = Game.time + CONFIG.PLAYER.SHIELD_DURATION;
    p.shieldCDEnd = Game.time + CONFIG.PLAYER.SHIELD_COOLDOWN * 1000;
    Audio.shield();
    Particles.spawn(p.x, p.y, 30, '#44ccff', { speed: 4, life: 30 });
  },

  dash() {
    const p = Game.player;
    if (Game.time < p.dashCDEnd) return;
    const cdReduction = playerData.upgrades.dash * 0.2;
    const cd = (CONFIG.PLAYER.BASE_DASH_CD - cdReduction) * 1000;
    p.dashEnd = Game.time + 150;
    p.dashCDEnd = Game.time + cd;
    p.invuln = 250;
    Audio.dash();
    Particles.spawn(p.x, p.y, 20, '#00ffff', { speed: 6, life: 18 });
  },

  takeDamage(amount) {
    const p = Game.player;
    if (p.invuln > 0) return;

    // Shield absorbs first
    if (p.shieldActive && p.shield > 0) {
      const absorbed = Math.min(p.shield, amount);
      p.shield -= absorbed;
      amount -= absorbed;
      if (p.shield <= 0) p.shieldActive = false;
    }

    if (amount > 0) {
      p.health -= amount;
      flashDamage();
      p.invuln = CONFIG.PLAYER.INVULN_AFTER_HIT * 1000;
      Game.screenShake = Math.min(15, amount * 0.6);
    }

    if (p.health <= 0) {
      p.health = 0;
      G.endMission(false);
    }
  },
};
