// ============================================
// MAIN GAME — Initialization, Loop, Mission Flow
// ============================================

const G = {
  init() {
    Game.canvas = document.getElementById('gameCanvas');
    Game.ctx = Game.canvas.getContext('2d');
    Input.bind();
    this.bindUI();
    this.refreshAllUI();
    showScreen('titleScreen');
  },

  bindUI() {
    document.getElementById('btnEnterHub').onclick = () => {
      Audio.init();
      this.enterHub();
    };

    document.getElementById('cardPatients').onclick = () => this.openMissionSelect();
    document.getElementById('cardShop').onclick = () => this.openShop();
    document.getElementById('cardUpgrades').onclick = () => this.openUpgrades();

    document.getElementById('btnBackFromMission').onclick  = () => this.enterHub();
    document.getElementById('btnBackFromShop').onclick     = () => this.enterHub();
    document.getElementById('btnBackFromUpgrades').onclick = () => this.enterHub();

    document.getElementById('btnCancelMission').onclick  = () => {
      hideAllOverlays();
      this.openMissionSelect();
    };
    document.getElementById('btnConfirmMission').onclick = () => this.startMission();

    document.getElementById('btnCompleteToHub').onclick = () => {
      hideAllOverlays();
      this.enterHub();
    };
    document.getElementById('btnGameOverHub').onclick = () => {
      hideAllOverlays();
      this.enterHub();
    };
    document.getElementById('btnGameOverRetry').onclick = () => {
      hideAllOverlays();
      const m = CONFIG.PATIENTS.find(p => p.id === playerData.currentMissionId);
      if (m) this.showBriefing(m);
    };
  },

  refreshAllUI() {
    this.updateHubDisplay();
  },

  updateHubDisplay() {
    document.getElementById('hubCredits').textContent = playerData.credits;
    document.getElementById('msCredits').textContent  = playerData.credits;
    document.getElementById('hubLevel').textContent   = computeHubLevel();
    document.getElementById('totalScore').textContent = playerData.totalScore;
    document.getElementById('curedCount').textContent = playerData.patientsCompleted.length;
    document.getElementById('totalCases').textContent = CONFIG.PATIENTS.length;
    document.getElementById('weaponsOwned').textContent = playerData.weaponsOwned.length;
    document.getElementById('weaponsTotal').textContent = CONFIG.WEAPONS.length;

    const totalUpgrades = Object.values(playerData.upgrades).reduce((a, b) => a + b, 0);
    document.getElementById('upgradesOwned').textContent = totalUpgrades;
  },

  enterHub() {
    hideAllOverlays();
    Game.canvas.classList.remove('active');
    document.getElementById('hud').classList.remove('active');
    Audio.stopHeartbeat();
    Game.running = false;
    this.updateHubDisplay();
    showScreen('hubScreen');
  },

  openMissionSelect() {
    showScreen('missionSelect');
    this.renderPatientList();
  },

  openShop() {
    showScreen('shopScreen');
    Upgrades.renderShop();
  },

  openUpgrades() {
    showScreen('upgradeScreen');
    Upgrades.renderUpgrades();
  },

  renderPatientList() {
    const list = document.getElementById('patientList');
    list.innerHTML = '';
    document.getElementById('msCredits').textContent = playerData.credits;

    CONFIG.PATIENTS.forEach(pat => {
      const completed = playerData.patientsCompleted.includes(pat.id);
      const div = document.createElement('div');
      div.className = 'patient-card' + (!pat.unlocked ? ' locked' : '') + (completed ? ' completed' : '');

      let diffClass = 'diff-easy';
      let diffText = 'EASY';
      if (pat.difficulty >= 5)      { diffClass = 'diff-extreme'; diffText = 'EXTREME'; }
      else if (pat.difficulty >= 3) { diffClass = 'diff-hard';    diffText = 'HARD'; }
      else if (pat.difficulty >= 2) { diffClass = 'diff-med';     diffText = 'MEDIUM'; }

      div.innerHTML =
        '<div class="patient-name">' + pat.name + '<span class="difficulty ' + diffClass + '">' + diffText + '</span></div>' +
        '<div class="patient-disease">🦠 ' + pat.disease + '</div>' +
        '<div class="patient-info">' + pat.desc + '</div>' +
        '<div class="patient-organs">📍 Organs: ' + pat.organs.join(' → ') + '</div>' +
        '<div class="patient-info">⏱ Par Time: ' + formatTime(pat.parTime) + '</div>' +
        '<div class="patient-reward">💰 Base Reward: ' + pat.baseReward + '</div>' +
        (!pat.unlocked ? '<div class="patient-info" style="color:#f88; margin-top:10px;">🔒 Complete previous case to unlock</div>' : '');

      if (pat.unlocked) {
        div.onclick = () => this.showBriefing(pat);
      }
      list.appendChild(div);
    });
  },

  showBriefing(patient) {
    Game.mission = patient;
    playerData.currentMissionId = patient.id;

    document.getElementById('briefingTitle').textContent = 'CASE FILE: ' + patient.disease;
    document.getElementById('briefingPatient').textContent = patient.name;
    document.getElementById('briefingDesc').textContent = patient.desc;
    document.getElementById('briefingOrgans').textContent = patient.organs.join(' → ');
    document.getElementById('briefingTime').textContent = formatTime(patient.parTime);

    const obj = document.getElementById('briefingObjectives');
    obj.innerHTML = '<strong>Mission Objectives:</strong><br>' +
      '• Clear all enemies in each organ<br>' +
      (patient.hasBoss ? '• Defeat the boss in the final organ<br>' : '') +
      (patient.doubleBoss ? '• Survive a second boss<br>' : '') +
      '• Beat the par time for credit bonus';

    document.getElementById('missionBriefing').classList.add('active');
  },

  startMission() {
    hideAllOverlays();
    // Reset mission state
    Game.currentOrganIdx = 0;
    Game.organCleared = 0;
    Game.score = 0;
    Game.creditsEarned = 0;
    Game.missionTime = 0;
    Game.bossSpawned = false;
    Game.bossesDefeated = 0;
    Game.midRunBonuses = { dmgMult: 1, fireRateMult: 1, magMult: 1, regen: 0 };

    Player.spawn();
    Weapons.initLoadout();
    Particles.spawnAmbientCells();

    this.loadOrgan();

    Game.canvas.classList.add('active');
    document.getElementById('hud').classList.add('active');
    showScreen('hud');

    Game.running = true;
    Game.lastTime = performance.now();
    Audio.startHeartbeat();
    Audio.organEntry();
    showMessage('🩸 INJECTED INTO ' + Game.mission.organs[0].toUpperCase(), 2200, '#0ff');

    requestAnimationFrame((t) => this.loop(t));
  },

  loadOrgan() {
    const organName = Game.mission.organs[Game.currentOrganIdx];
    Organs.load(organName);

    // On the final organ, if there's a boss, spawn it AFTER clearing minions
    const isFinal = Game.currentOrganIdx === Game.mission.organs.length - 1;
    const difficulty = 1 + (Game.mission.difficulty - 1) * 0.2;

    Enemies.populate(organName, difficulty);

    if (isFinal && Game.mission.hasBoss) {
      // We will spawn the boss when minions are mostly cleared
      Game.awaitingBoss = true;
    } else {
      Game.awaitingBoss = false;
    }
  },

  loop(timestamp) {
    if (!Game.running) return;

    const dt = Math.min(50, timestamp - Game.lastTime);
    Game.lastTime = timestamp;
    Game.time = timestamp;
    Game.missionTime += dt / 1000;

    // Update systems
    Player.update(dt);
    Enemies.update();
    Projectiles.update();
    Pickups.update();
    Particles.update();
    Particles.updateAmbient();

    // Check for organ clear
    if (Game.enemies.length === 0) {
      if (Game.awaitingBoss && !Game.bossSpawned) {
        // Spawn boss
        const bossLevel = Game.mission.finalBoss ? 2 : (Game.mission.doubleBoss ? 1 : 0);
        Enemies.spawnBoss(bossLevel, Game.W / 2, 150);

        // Double boss spawns second one after a delay
        if (Game.mission.doubleBoss) {
          setTimeout(() => {
            if (Game.running && Game.bossesDefeated === 0) {
              Enemies.spawnBoss(bossLevel + 1, Game.W / 2, 150);
            }
          }, 30000);
        }
        Game.awaitingBoss = false;
      } else if (!Game.bossSpawned) {
        // Move to next organ or complete mission
        this.advanceOrgan();
      }
    }

    // Render
    Renderer.draw();
    HUD.update();

    requestAnimationFrame((t) => this.loop(t));
  },

  advanceOrgan() {
    Game.organCleared++;
    Game.currentOrganIdx++;

    if (Game.currentOrganIdx >= Game.mission.organs.length) {
      this.endMission(true);
      return;
    }

    // Show mid-mission upgrade choice
    showMessage('✓ ORGAN CLEARED — choose adaptation', 2500, '#0f0');
    Upgrades.showMidMissionChoice();
    setTimeout(() => {
      this.loadOrgan();
      Audio.organEntry();
      showMessage('🩸 ENTERING ' + Game.mission.organs[Game.currentOrganIdx].toUpperCase(), 2200, '#0ff');
    }, 100);
  },

  endMission(success) {
    Game.running = false;
    Audio.stopHeartbeat();
    Game.canvas.classList.remove('active');
    document.getElementById('hud').classList.remove('active');

    if (success) {
      // Time bonus / penalty calculation
      const parTime = Game.mission.parTime;
      const actualTime = Game.missionTime;
      const ratio = actualTime / parTime;
      let timeBonus = 0;
      let timePenalty = 0;

      if (ratio < 1) {
        // Under par: bonus (0 - 100% of base reward)
        timeBonus = Math.floor(Game.mission.baseReward * (1 - ratio) * CONFIG.TIME.BONUS_MULT);
      } else {
        // Over par: penalty (up to 70% of base reward)
        const overshoot = Math.min(CONFIG.TIME.PENALTY_MAX / CONFIG.TIME.PENALTY_RATE, ratio - 1);
        timePenalty = Math.floor(Game.mission.baseReward * overshoot * CONFIG.TIME.PENALTY_RATE);
      }

      const total = Game.mission.baseReward + timeBonus - timePenalty + Game.creditsEarned;

      // Save progress
      playerData.credits += total;
      playerData.totalScore += Game.score;
      if (!playerData.patientsCompleted.includes(Game.mission.id)) {
        playerData.patientsCompleted.push(Game.mission.id);
      }
      unlockNextPatient();

      // Display
      document.getElementById('mcTime').textContent = formatTime(actualTime);
      document.getElementById('mcParTime').textContent = formatTime(parTime);
      document.getElementById('mcScore').textContent = Game.score;
      document.getElementById('mcLevel').textContent = Game.player.level;
      document.getElementById('mcBaseReward').textContent = Game.mission.baseReward + Game.creditsEarned;
      document.getElementById('mcTimeBonus').textContent = timeBonus;
      document.getElementById('mcTimePenalty').textContent = timePenalty;
      document.getElementById('mcTotal').textContent = total;

      document.getElementById('mcTimeBonusRow').style.display  = timeBonus > 0 ? 'block' : 'none';
      document.getElementById('mcTimePenaltyRow').style.display = timePenalty > 0 ? 'block' : 'none';

      document.getElementById('missionComplete').classList.add('active');
    } else {
      // Game over — partial credits (50% of earned)
      const partial = Math.floor(Game.creditsEarned * 0.5);
      playerData.credits += partial;
      playerData.totalScore += Math.floor(Game.score * 0.5);

      document.getElementById('goTime').textContent = formatTime(Game.missionTime);
      document.getElementById('goCredits').textContent = partial;
      document.getElementById('gameOver').classList.add('active');
    }
  },
};

// ---------- BOOT ----------
window.addEventListener('load', () => {
  G.init();
});
