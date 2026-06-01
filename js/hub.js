// ============================================
// HUD — Health, Ammo, Timer, Objective panels
// ============================================

const HUD = {
  update() {
    const p = Game.player;
    if (!p) return;
    const w = Game.weapons[p.weaponIndex];

    // Health
    document.getElementById('healthText').textContent = Math.ceil(p.health);
    document.getElementById('maxHealthText').textContent = p.maxHealth;
    document.getElementById('healthBar').style.width = (p.health / p.maxHealth * 100) + '%';

    // Shield
    document.getElementById('shieldText').textContent = Math.ceil(p.shield);
    document.getElementById('shieldBar').style.width = (p.shield / p.maxShield * 100) + '%';

    // XP
    document.getElementById('levelText').textContent = p.level;
    document.getElementById('xpText').textContent = p.xp;
    document.getElementById('xpNextText').textContent = p.xpNext;
    document.getElementById('xpBar').style.width = (p.xp / p.xpNext * 100) + '%';

    // Weapon / Ammo
    if (w) {
      document.getElementById('weaponName').textContent = w.icon + ' ' + w.name;
      document.getElementById('ammoText').textContent = w.ammo;
      document.getElementById('maxAmmoText').textContent = w.maxAmmo;
      document.getElementById('reserveText').textContent = w.reserve;
    }

    // Charge
    document.getElementById('chargeBar').style.width = (p.chargeLevel * 100) + '%';

    // Grenades / Shield CD / Dash CD
    document.getElementById('grenadeText').textContent = p.grenades + '/' + p.maxGrenades;
    const shieldCDRemain = Math.max(0, (p.shieldCDEnd - Game.time) / 1000);
    document.getElementById('shieldCDText').textContent = shieldCDRemain > 0 ? shieldCDRemain.toFixed(1) + 's' : 'Ready';
    const dashCDRemain = Math.max(0, (p.dashCDEnd - Game.time) / 1000);
    document.getElementById('dashCDText').textContent = dashCDRemain > 0 ? dashCDRemain.toFixed(1) + 's' : 'Ready';

    // Timer
    document.getElementById('timerText').textContent = formatTime(Game.missionTime);
    document.getElementById('parTimeText').textContent = formatTime(Game.mission.parTime);
    const timerRatio = Math.min(1, Game.missionTime / Game.mission.parTime);
    document.getElementById('timerBar').style.width = (timerRatio * 100) + '%';

    document.getElementById('creditsEarned').textContent = Game.creditsEarned;

    // Objective
    document.getElementById('missionName').textContent = Game.mission.disease;
    document.getElementById('enemyCount').textContent = Game.enemies.length;
    document.getElementById('scoreText').textContent = Game.score;

    // Organ
    document.getElementById('organText').textContent = Game.mission.organs[Game.currentOrganIdx];
    document.getElementById('organsCleared').textContent = Game.organCleared;
    document.getElementById('organsTotal').textContent = Game.mission.organs.length;
  },
};
