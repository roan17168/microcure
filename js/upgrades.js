// ============================================
// Upgrades — Shop, Bio-Lab, Mid-Mission Choices
// ============================================

const Upgrades = {
  renderShop() {
    const grid = document.getElementById('shopGrid');
    grid.innerHTML = '';
    document.getElementById('shopCredits').textContent = playerData.credits;
    document.getElementById('weaponsOwned').textContent = playerData.weaponsOwned.length;
    document.getElementById('weaponsTotal').textContent = CONFIG.WEAPONS.length;

    CONFIG.WEAPONS.forEach(w => {
      const owned = playerData.weaponsOwned.includes(w.id);
      const equipped = playerData.equippedWeapons.includes(w.id);

      const div = document.createElement('div');
      div.className = 'shop-item' + (owned ? ' owned' : '') + (equipped ? ' equipped' : '');

      div.innerHTML =
        '<div class="item-name">' + w.icon + ' ' + w.name + '</div>' +
        '<div class="item-desc">' + w.desc + '</div>' +
        '<div class="item-stats">DMG: ' + w.damage + ' | MAG: ' + w.maxAmmo + ' | RATE: ' + w.fireRate + 'ms</div>' +
        '<div class="item-price">' + (owned ? (equipped ? '✓ EQUIPPED' : 'OWNED') : '💰 ' + w.cost) + '</div>';

      const btn = document.createElement('button');
      btn.className = 'btn item-btn';
      if (!owned) {
        btn.textContent = playerData.credits >= w.cost ? 'BUY' : 'NEED CREDITS';
        btn.disabled = playerData.credits < w.cost;
        btn.onclick = () => this.buyWeapon(w.id);
      } else if (!equipped) {
        btn.textContent = 'EQUIP';
        btn.onclick = () => this.equipWeapon(w.id);
      } else {
        btn.textContent = '✓ EQUIPPED';
        btn.disabled = true;
      }
      div.appendChild(btn);
      grid.appendChild(div);
    });
  },

  buyWeapon(id) {
    const w = CONFIG.WEAPONS.find(x => x.id === id);
    if (!w || playerData.credits < w.cost) return;
    if (playerData.weaponsOwned.includes(id)) return;
    playerData.credits -= w.cost;
    playerData.weaponsOwned.push(id);
    showMessage('Weapon purchased!', 1200, '#0f0');
    this.renderShop();
    G.updateHubDisplay();
  },

  equipWeapon(id) {
    if (!playerData.weaponsOwned.includes(id)) return;
    if (playerData.equippedWeapons.includes(id)) return;
    // Replace the last slot (simple swap)
    playerData.equippedWeapons[2] = id;
    showMessage('Equipped in slot 3', 1200, '#ff8');
    this.renderShop();
  },

  renderUpgrades() {
    const grid = document.getElementById('upgradeGrid');
    grid.innerHTML = '';
    document.getElementById('upgradeCredits').textContent = playerData.credits;

    CONFIG.HUB_UPGRADES.forEach(u => {
      const lvl = playerData.upgrades[u.id];
      const cost = Math.floor(u.baseCost * Math.pow(u.scale, lvl));
      const maxed = lvl >= u.maxLevel;

      const div = document.createElement('div');
      div.className = 'upgrade-item';
      div.innerHTML =
        '<div class="item-name">' + u.name + ' (Lv ' + lvl + '/' + u.maxLevel + ')</div>' +
        '<div class="item-desc">' + u.desc + '</div>' +
        '<div class="item-price">' + (maxed ? '✓ MAXED' : '💰 ' + cost) + '</div>';

      const btn = document.createElement('button');
      btn.className = 'btn item-btn';
      if (maxed) {
        btn.textContent = 'MAXED';
        btn.disabled = true;
      } else {
        btn.textContent = playerData.credits >= cost ? 'UPGRADE' : 'NEED CREDITS';
        btn.disabled = playerData.credits < cost;
        btn.onclick = () => this.buyUpgrade(u.id);
      }
      div.appendChild(btn);
      grid.appendChild(div);
    });
  },

  buyUpgrade(id) {
    const u = CONFIG.HUB_UPGRADES.find(x => x.id === id);
    if (!u) return;
    const lvl = playerData.upgrades[id];
    if (lvl >= u.maxLevel) return;
    const cost = Math.floor(u.baseCost * Math.pow(u.scale, lvl));
    if (playerData.credits < cost) return;
    playerData.credits -= cost;
    playerData.upgrades[id]++;
    showMessage('Upgrade purchased!', 1200, '#0f0');
    this.renderUpgrades();
    G.updateHubDisplay();
  },

  showMidMissionChoice() {
    const overlay = document.getElementById('upgradeChoice');
    overlay.classList.add('active');
    const grid = document.getElementById('choiceGrid');
    grid.innerHTML = '';

    // Pick 3 random choices
    const pool = [...CONFIG.MID_CHOICES];
    const picks = [];
    for (let i = 0; i < 3; i++) {
      const idx = Math.floor(Math.random() * pool.length);
      picks.push(pool.splice(idx, 1)[0]);
    }

    picks.forEach(c => {
      const div = document.createElement('div');
      div.className = 'choice-card';
      div.innerHTML =
        '<div class="choice-icon">' + c.icon + '</div>' +
        '<div class="choice-name">' + c.name + '</div>' +
        '<div class="choice-desc">' + c.desc + '</div>';
      div.onclick = () => this.applyMidChoice(c.id);
      grid.appendChild(div);
    });
  },

  applyMidChoice(id) {
    const p = Game.player;
    if (id === 'vital') {
      p.maxHealth += 20;
      p.health = p.maxHealth;
    } else if (id === 'agility') {
      p.speed *= 1.15;
    } else if (id === 'biocharge') {
      Game.midRunBonuses.dmgMult *= 1.2;
    } else if (id === 'mags') {
      Game.midRunBonuses.magMult *= 1.5;
      Game.weapons.forEach(w => {
        w.maxAmmo = Math.floor(w.maxAmmo * 1.5);
        w.ammo = w.maxAmmo;
      });
    } else if (id === 'reinforce') {
      p.maxShield += 50;
      p.shield = p.maxShield;
      p.shieldActive = true;
      p.shieldEnd = Game.time + CONFIG.PLAYER.SHIELD_DURATION;
    } else if (id === 'reflex') {
      // Permanent dash CD reduction (run-only)
      playerData.upgrades.dash += 2; // emulated for the run
    } else if (id === 'grenades') {
      p.maxGrenades += 3;
      p.grenades = Math.min(p.maxGrenades, p.grenades + 3);
    } else if (id === 'rapid') {
      Game.midRunBonuses.fireRateMult *= 1.25;
    } else if (id === 'regen') {
      Game.midRunBonuses.regen += 1;
    }
    showMessage('Bio-Adaptation applied!', 1500, '#ffcc44');
    document.getElementById('upgradeChoice').classList.remove('active');
    Audio.levelUp();
  },
};
