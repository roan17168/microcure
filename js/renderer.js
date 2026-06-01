// ============================================
// Renderer — All visual drawing
// ============================================

const Renderer = {
  draw() {
    const ctx = Game.ctx;

    // Screen shake offset
    let shakeX = 0, shakeY = 0;
    if (Game.screenShake > 0) {
      shakeX = (Math.random() - 0.5) * Game.screenShake;
      shakeY = (Math.random() - 0.5) * Game.screenShake;
      Game.screenShake *= 0.9;
      if (Game.screenShake < 0.1) Game.screenShake = 0;
    }
    ctx.save();
    ctx.translate(shakeX, shakeY);

    // Background fog tint
    const organName = Game.mission.organs[Game.currentOrganIdx];
    const organ = CONFIG.ORGANS[organName];
    ctx.fillStyle = organ.bgColor;
    ctx.fillRect(0, 0, Game.W, Game.H);

    // Vignette fog
    const grad = ctx.createRadialGradient(Game.W / 2, Game.H / 2, 100, Game.W / 2, Game.H / 2, Math.max(Game.W, Game.H));
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, organ.fogColor);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, Game.W, Game.H);

    this.drawAmbientCells();
    this.drawHazards();
    this.drawObstacles();
    this.drawPickups();
    this.drawProjectiles();
    this.drawGrenades();
    this.drawEnemies();
    this.drawPlayer();
    this.drawParticles();

    // Boss HP bar overlay
    const boss = Game.enemies.find(e => e.isBoss);
    if (boss) this.drawBossBar(boss);

    ctx.restore();
  },

  drawAmbientCells() {
    const ctx = Game.ctx;
    Game.ambientCells.forEach(c => {
      ctx.globalAlpha = c.alpha * (0.7 + Math.sin(c.phase) * 0.3);
      ctx.fillStyle = '#88ffcc';
      ctx.beginPath();
      ctx.arc(c.x, c.y, c.size, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;
  },

  drawObstacles() {
    const ctx = Game.ctx;
    Game.obstacles.forEach(o => {
      o.phase += 0.02;

      if (o.shape === 'rect') {
        ctx.fillStyle = o.color;
        ctx.fillRect(o.x, o.y, o.w, o.h);
        // Highlight edge
        ctx.strokeStyle = 'rgba(255,255,255,0.15)';
        ctx.lineWidth = 1;
        ctx.strokeRect(o.x, o.y, o.w, o.h);

        // Decorative artery pulse
        if (o.decor === 'artery') {
          ctx.fillStyle = 'rgba(255,100,100,' + (0.3 + Math.sin(o.phase) * 0.15) + ')';
          ctx.fillRect(o.x, o.y, o.w, o.h);
        }
      } else if (o.shape === 'circle') {
        const pulse = 1 + Math.sin(o.phase) * 0.05;
        const r = o.radius * pulse;

        // Outer glow
        ctx.shadowColor = o.color;
        ctx.shadowBlur = 15;
        ctx.fillStyle = o.color;
        ctx.beginPath();
        ctx.arc(o.x, o.y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;

        // Inner detail (different per decor)
        if (o.decor === 'valve') {
          // Pulsing valve interior
          ctx.fillStyle = '#ff3366';
          ctx.beginPath();
          ctx.arc(o.x, o.y, r * 0.6, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#660022';
          for (let a = 0; a < 4; a++) {
            const ang = (a / 4) * Math.PI * 2 + o.phase * 0.2;
            const px = o.x + Math.cos(ang) * r * 0.4;
            const py = o.y + Math.sin(ang) * r * 0.4;
            ctx.beginPath();
            ctx.arc(px, py, 10, 0, Math.PI * 2);
            ctx.fill();
          }
        } else if (o.decor === 'alveoli') {
          ctx.fillStyle = '#88ccff';
          ctx.globalAlpha = 0.4;
          ctx.beginPath();
          ctx.arc(o.x - r * 0.3, o.y - r * 0.3, r * 0.3, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = 1;
        } else if (o.decor === 'synapse') {
          // Glowing core
          ctx.fillStyle = '#cc88ff';
          ctx.beginPath();
          ctx.arc(o.x, o.y, r * 0.5, 0, Math.PI * 2);
          ctx.fill();
          // Crackling lines
          ctx.strokeStyle = 'rgba(200,150,255,' + (0.5 + Math.sin(o.phase * 3) * 0.4) + ')';
          ctx.lineWidth = 1;
          for (let a = 0; a < 3; a++) {
            const ang = (a / 3) * Math.PI * 2 + o.phase;
            ctx.beginPath();
            ctx.moveTo(o.x, o.y);
            ctx.lineTo(o.x + Math.cos(ang) * r * 1.5, o.y + Math.sin(ang) * r * 1.5);
            ctx.stroke();
          }
        } else if (o.decor === 'pillar') {
          // Concentric rings
          ctx.strokeStyle = '#aa8855';
          ctx.lineWidth = 2;
          for (let ring = 1; ring <= 3; ring++) {
            ctx.beginPath();
            ctx.arc(o.x, o.y, r * (ring / 4), 0, Math.PI * 2);
            ctx.stroke();
          }
        }
      }
    });
  },

  drawHazards() {
    const ctx = Game.ctx;
    Game.hazards.forEach(h => {
      h.phase += 0.05;

      if (h.type === 'electric') {
        if (!h.active) {
          ctx.strokeStyle = 'rgba(255,255,68,0.3)';
          ctx.strokeRect(h.x, h.y, h.w, h.h);
          return;
        }
        // Active arcing
        ctx.fillStyle = 'rgba(255,255,68,0.25)';
        ctx.fillRect(h.x, h.y, h.w, h.h);
        ctx.strokeStyle = '#ffff88';
        ctx.lineWidth = 2;
        ctx.strokeRect(h.x, h.y, h.w, h.h);
        // Lightning bolts
        ctx.strokeStyle = '#ffffaa';
        ctx.lineWidth = 1;
        for (let i = 0; i < 4; i++) {
          ctx.beginPath();
          ctx.moveTo(h.x + Math.random() * h.w, h.y);
          for (let s = 0; s < 4; s++) {
            ctx.lineTo(h.x + Math.random() * h.w, h.y + (s + 1) * (h.h / 4));
          }
          ctx.stroke();
        }
      } else if (h.type === 'wind') {
        ctx.strokeStyle = 'rgba(136,204,255,0.3)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(h.x, h.y, h.radius, 0, Math.PI * 2);
        ctx.stroke();
        // Direction arrows
        for (let i = 0; i < 6; i++) {
          const offset = (i / 6) * 60 + h.phase * 20;
          const dist = (offset % 60) / 60 * h.radius;
          const ax = h.x + Math.cos(h.angle + Math.PI) * dist;
          const ay = h.y + Math.sin(h.angle + Math.PI) * dist;
          ctx.fillStyle = 'rgba(136,204,255,' + (1 - dist / h.radius) * 0.6 + ')';
          ctx.beginPath();
          ctx.arc(ax, ay, 3, 0, Math.PI * 2);
          ctx.fill();
        }
      } else if (h.type === 'rect') {
        ctx.fillStyle = 'rgba(255,68,255,' + (0.2 + Math.sin(h.phase) * 0.1) + ')';
        ctx.fillRect(h.x, h.y, h.w, h.h);
      } else if (h.type === 'circle') {
        ctx.fillStyle = h.color;
        ctx.globalAlpha = 0.25 + Math.sin(h.phase) * 0.1;
        ctx.beginPath();
        ctx.arc(h.x, h.y, h.radius, 0, Math.PI * 2);
        ctx.fill();
        // Bubbles
        ctx.globalAlpha = 0.5;
        for (let b = 0; b < 4; b++) {
          const bx = h.x + Math.cos(h.phase * 2 + b) * h.radius * 0.5;
          const by = h.y + Math.sin(h.phase * 2 + b * 1.7) * h.radius * 0.5;
          ctx.beginPath();
          ctx.arc(bx, by, 3 + Math.sin(h.phase + b) * 2, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
      }
    });
  },

  drawPickups() {
    const ctx = Game.ctx;
    Game.pickups.forEach(p => {
      const blink = p.life < 120 ? Math.sin(Game.time / 100) > 0 : true;
      if (!blink) return;
      const pulse = 1 + Math.sin(p.phase) * 0.15;
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 12;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 10 * pulse, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 12px Courier New';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(p.icon, p.x, p.y);
    });
  },

  drawProjectiles() {
    const ctx = Game.ctx;
    Game.projectiles.forEach(p => {
      // Trail
      p.trail.forEach((t, i) => {
        ctx.fillStyle = p.color;
        ctx.globalAlpha = (i / p.trail.length) * 0.4;
        ctx.beginPath();
        ctx.arc(t.x, t.y, p.size * 0.7, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.globalAlpha = 1;
      // Glow
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 12;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    });

    Game.enemyProjectiles.forEach(p => {
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 10;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    });
  },

  drawGrenades() {
    const ctx = Game.ctx;
    Game.grenades.forEach(g => {
      ctx.fillStyle = '#ff8844';
      ctx.beginPath();
      ctx.arc(g.x, g.y, 6, 0, Math.PI * 2);
      ctx.fill();
      // Blinking warning
      if (Math.sin(Game.time / 50) > 0) {
        ctx.fillStyle = '#ff0000';
        ctx.beginPath();
        ctx.arc(g.x, g.y, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    });
  },

  drawEnemies() {
    const ctx = Game.ctx;
    Game.enemies.forEach(e => {
      if (e.isBoss) {
        this.drawBoss(e);
        return;
      }

      // Cloaker fade
      if (e.cloaked) {
        const d = dist(e.x, e.y, Game.player.x, Game.player.y);
        ctx.globalAlpha = d < 150 ? 0.85 : 0.35;
      }

      const flash = e.hitFlash > 0;

      // Different drawing per type
      if (e.type === 'spiker') {
        // Rotating spiked star
        ctx.save();
        ctx.translate(e.x, e.y);
        ctx.rotate(e.phase);
        ctx.fillStyle = flash ? '#fff' : e.color;
        ctx.shadowColor = e.color;
        ctx.shadowBlur = 10;
        ctx.beginPath();
        for (let i = 0; i < e.spikes * 2; i++) {
          const a = (i / (e.spikes * 2)) * Math.PI * 2;
          const r = i % 2 === 0 ? e.radius : e.radius * 0.5;
          if (i === 0) ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
          else ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
        }
        ctx.closePath();
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.restore();
      } else if (e.type === 'bloater') {
        // Pulsing veiny mass
        const pulse = 1 + Math.sin(e.phase * 2) * 0.1;
        ctx.shadowColor = e.color;
        ctx.shadowBlur = 12;
        ctx.fillStyle = flash ? '#fff' : e.color;
        ctx.beginPath();
        ctx.arc(e.x, e.y, e.radius * pulse, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
        // Vein details
        ctx.strokeStyle = '#aa3300';
        ctx.lineWidth = 2;
        for (let v = 0; v < 5; v++) {
          ctx.beginPath();
          const a = (v / 5) * Math.PI * 2 + e.phase;
          ctx.moveTo(e.x, e.y);
          ctx.lineTo(e.x + Math.cos(a) * e.radius * 0.8, e.y + Math.sin(a) * e.radius * 0.8);
          ctx.stroke();
        }
      } else if (e.type === 'cloaker') {
        // Diamond
        ctx.save();
        ctx.translate(e.x, e.y);
        ctx.rotate(e.phase * 0.5);
        ctx.fillStyle = flash ? '#fff' : e.color;
        ctx.shadowColor = e.color;
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.moveTo(0, -e.radius);
        ctx.lineTo(e.radius, 0);
        ctx.lineTo(0, e.radius);
        ctx.lineTo(-e.radius, 0);
        ctx.closePath();
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.restore();
      } else if (e.type === 'phantom') {
        // Triangle shooter
        ctx.save();
        ctx.translate(e.x, e.y);
        const aim = angleTo(0, 0, Game.player.x - e.x, Game.player.y - e.y);
        ctx.rotate(aim);
        ctx.fillStyle = flash ? '#fff' : e.color;
        ctx.shadowColor = e.color;
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.moveTo(e.radius, 0);
        ctx.lineTo(-e.radius * 0.8, -e.radius * 0.8);
        ctx.lineTo(-e.radius * 0.4, 0);
        ctx.lineTo(-e.radius * 0.8, e.radius * 0.8);
        ctx.closePath();
        ctx.fill();
        ctx.shadowBlur = 0;
        // Red eye
        ctx.fillStyle = '#ff0000';
        ctx.beginPath();
        ctx.arc(e.radius * 0.4, 0, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      // HP bar
      if (e.health < e.maxHealth) {
        const bw = e.radius * 2;
        ctx.fillStyle = '#400';
        ctx.fillRect(e.x - bw / 2, e.y - e.radius - 10, bw, 4);
        ctx.fillStyle = '#f44';
        ctx.fillRect(e.x - bw / 2, e.y - e.radius - 10, bw * (e.health / e.maxHealth), 4);
      }
      ctx.globalAlpha = 1;
    });
  },

  drawBoss(e) {
    const ctx = Game.ctx;
    const flash = e.hitFlash > 0;
    const pulse = 1 + Math.sin(e.phase * 1.5) * 0.08;

    // Outer rotating spike ring
    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.rotate(e.phaseRing);
    ctx.strokeStyle = e.color;
    ctx.lineWidth = 3;
    ctx.shadowColor = e.color;
    ctx.shadowBlur = 20;
    ctx.beginPath();
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const r1 = e.radius * 1.2;
      const r2 = e.radius * 1.5;
      ctx.moveTo(Math.cos(a) * r1, Math.sin(a) * r1);
      ctx.lineTo(Math.cos(a) * r2, Math.sin(a) * r2);
    }
    ctx.stroke();
    ctx.restore();

    // Mid ring (counter-rotating)
    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.rotate(-e.phaseRing * 0.7);
    ctx.strokeStyle = '#ffaa00';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, e.radius * 1.1, 0, Math.PI * 2);
    ctx.stroke();
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * e.radius * 1.0, Math.sin(a) * e.radius * 1.0);
      ctx.lineTo(Math.cos(a) * e.radius * 1.2, Math.sin(a) * e.radius * 1.2);
      ctx.stroke();
    }
    ctx.restore();

    // Core
    ctx.shadowColor = e.color;
    ctx.shadowBlur = 30;
    ctx.fillStyle = flash ? '#fff' : e.color;
    ctx.beginPath();
    ctx.arc(e.x, e.y, e.radius * pulse, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    // Inner crystal
    ctx.fillStyle = '#ffffff';
    ctx.globalAlpha = 0.7;
    ctx.beginPath();
    ctx.arc(e.x, e.y, e.radius * 0.4 * pulse, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  },

  drawBossBar(e) {
    const ctx = Game.ctx;
    const w = 600, h = 18;
    const x = (Game.W - w) / 2;
    const y = 90;
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(x - 4, y - 4, w + 8, h + 8);
    ctx.fillStyle = '#400';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = e.color;
    ctx.fillRect(x, y, w * (e.health / e.maxHealth), h);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, w, h);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 14px Courier New';
    ctx.textAlign = 'center';
    ctx.fillText(e.bossName + ' — ' + Math.ceil(e.health) + ' HP', Game.W / 2, y - 8);
  },

  drawPlayer() {
    const ctx = Game.ctx;
    const p = Game.player;

    // Dash trail
    if (Game.time < p.dashEnd) {
      ctx.fillStyle = 'rgba(0,255,255,0.4)';
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius * 1.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // Shield bubble
    if (p.shieldActive) {
      ctx.strokeStyle = '#44ccff';
      ctx.lineWidth = 3;
      ctx.shadowColor = '#44ccff';
      ctx.shadowBlur = 15;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius + 8, 0, Math.PI * 2);
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    // Body
    ctx.shadowColor = '#00ffaa';
    ctx.shadowBlur = 12;
    ctx.fillStyle = '#00ffaa';
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    // Inner core
    ctx.fillStyle = '#88ffcc';
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.radius * 0.5, 0, Math.PI * 2);
    ctx.fill();

    // Weapon indicator (line in aim direction)
    const w = Game.weapons[p.weaponIndex];
    if (w) {
      ctx.strokeStyle = w.color;
      ctx.lineWidth = 3;
      ctx.shadowColor = w.color;
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x + Math.cos(p.angle) * (p.radius + 12), p.y + Math.sin(p.angle) * (p.radius + 12));
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    // Charge indicator
    if (p.isCharging && p.chargeLevel > 0.1) {
      ctx.strokeStyle = '#ffff44';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius + 4 + p.chargeLevel * 8, 0, Math.PI * 2 * p.chargeLevel);
      ctx.stroke();
    }
  },

  drawParticles() {
    const ctx = Game.ctx;
    Game.particles.forEach(p => {
      ctx.globalAlpha = p.life / p.maxLife;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;
  },
};
