// ============================================
// Pickups — Health, Ammo, Grenade drops
// ============================================

const Pickups = {
  spawn(x, y) {
    const r = Math.random();
    let type, color, icon;
    if (r < 0.45) { type = 'health';  color = '#ff44ff'; icon = '+'; }
    else if (r < 0.85) { type = 'ammo';    color = '#ffcc44'; icon = 'A'; }
    else            { type = 'grenade'; color = '#ff8844'; icon = 'G'; }

    Game.pickups.push({
      x, y,
      type,
      color,
      icon,
      life: 480, // ~8 seconds
      phase: 0,
    });
  },

  update() {
    for (let i = Game.pickups.length - 1; i >= 0; i--) {
      const p = Game.pickups[i];
      p.life--;
      p.phase += 0.1;

      if (p.life <= 0) {
        Game.pickups.splice(i, 1);
        continue;
      }

      // Auto-collect on touch
      if (dist(p.x, p.y, Game.player.x, Game.player.y) < Game.player.radius + 14) {
        if (p.type === 'health') {
          Game.player.health = Math.min(Game.player.maxHealth, Game.player.health + 30);
          showMessage('+30 HP', 800, '#f8f');
        } else if (p.type === 'ammo') {
          Game.weapons.forEach(w => {
            const refill = Math.floor(w.maxAmmo * 0.8);
            w.reserve += refill;
          });
          showMessage('AMMO REFILL', 800, '#ff8');
        } else {
          Game.player.grenades = Math.min(Game.player.maxGrenades, Game.player.grenades + 1);
          showMessage('+1 GRENADE', 800, '#f84');
        }
        Audio.pickup();
        Particles.spawn(p.x, p.y, 12, p.color, { speed: 3, life: 20 });
        Game.pickups.splice(i, 1);
      }
    }
  },
};
