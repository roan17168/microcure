// ============================================
// Utility Functions
// ============================================

function dist(x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  return Math.sqrt(dx * dx + dy * dy);
}

function distSq(x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  return dx * dx + dy * dy;
}

function angleTo(x1, y1, x2, y2) {
  return Math.atan2(y2 - y1, x2 - x1);
}

function lerp(a, b, t) { return a + (b - a) * t; }
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function randRange(a, b) { return a + Math.random() * (b - a); }
function randInt(a, b) { return Math.floor(randRange(a, b + 1)); }
function pickRandom(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return m + ':' + (s < 10 ? '0' : '') + s;
}

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(el => el.classList.remove('active'));
  const target = document.getElementById(id);
  if (target) target.classList.add('active');
}

function hideAllOverlays() {
  ['missionBriefing', 'upgradeChoice', 'missionComplete', 'gameOver'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.remove('active');
  });
}

function showMessage(text, duration = 2000, color = '#fff') {
  const log = document.getElementById('messageLog');
  if (!log) return;
  log.textContent = text;
  log.style.color = color;
  log.classList.add('show');
  clearTimeout(showMessage._t);
  showMessage._t = setTimeout(() => log.classList.remove('show'), duration);
}

function flashDamage() {
  const f = document.getElementById('damageFlash');
  if (!f) return;
  f.classList.add('flash');
  clearTimeout(flashDamage._t);
  flashDamage._t = setTimeout(() => f.classList.remove('flash'), 200);
}

function computeHubLevel() {
  return Math.min(99, 1 + Math.floor(playerData.totalScore / 5000));
}

function unlockNextPatient() {
  // Unlock the next patient after the current one is completed
  for (let i = 0; i < CONFIG.PATIENTS.length - 1; i++) {
    if (playerData.patientsCompleted.includes(CONFIG.PATIENTS[i].id)) {
      CONFIG.PATIENTS[i + 1].unlocked = true;
    }
  }
}
