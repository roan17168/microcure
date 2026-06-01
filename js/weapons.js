// ============================================
// Weapons — State Management
// ============================================

const Weapons = {
  initLoadout() {
    // Build live weapon instances from equipped IDs
    Game.weapons = playerData.equippedWeapons.map(id => {
      const template = CONFIG.WEAPONS.find(w => w.id === id);
      if (!template) return null;
      return {
        ...template,
        ammo: template.maxAmmo,
        reserve: template.reserve,
        lastShotTime: 0,
        reloading: false,
        reloadEnd: 0,
      };
    }).filter(w => w !== null);

    // Apply Bio-Lab magazine bonus
    Game.weapons.forEach(w => {
      const magBonus = Math.floor(w.maxAmmo * Game.midRunBonuses.magMult);
      w.maxAmmo = magBonus;
      w.ammo = magBonus;
    });
  },

  startReload(weapon) {
    if (weapon.reloading) return;
    if (weapon.ammo >= weapon.maxAmmo) return;
    if (weapon.reserve <= 0) return;
    const reloadLevel = playerData.upgrades.reload;
    const baseReloadTime = 1500;
    const reloadTime = baseReloadTime * (1 - reloadLevel * 0.15);
    weapon.reloading = true;
    weapon.reloadEnd = Game.time + reloadTime;
    Audio.reload();
  },

  updateReloads() {
    Game.weapons.forEach(w => {
      if (w.reloading && Game.time >= w.reloadEnd) {
        const needed = w.maxAmmo - w.ammo;
        const taken = Math.min(needed, w.reserve);
        w.ammo += taken;
        w.reserve -= taken;
        w.reloading = false;
      }
    });
  },
};
