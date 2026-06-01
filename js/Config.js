// ============================================
// MICROCURE — Game Configuration
// All tunable values live here.
// ============================================

const CONFIG = {
  CANVAS: { WIDTH: 1200, HEIGHT: 750 },

  PLAYER: {
    BASE_HEALTH: 100,
    BASE_SHIELD: 50,
    BASE_SPEED: 2.0,
    BASE_GRENADES: 3,
    BASE_DASH_CD: 1.2,
    RADIUS: 14,
    INVULN_AFTER_HIT: 0.3,
    SHIELD_DURATION: 4000,
    SHIELD_COOLDOWN: 25,
    XP_BASE: 100,
    XP_SCALE: 1.5,
    LEVEL_HP_BONUS: 15,
  },

  // ---------- WEAPONS ----------
  WEAPONS: [
    { id: 'rifle', name: 'BIO-VOLT RIFLE', cost: 0, owned: true, icon: '⚡',
      ammo: 30, maxAmmo: 30, reserve: 90, damage: 15, fireRate: 100,
      color: '#00ffff', canCharge: true,
      desc: 'Standard issue. Hold click to charge for up to 3x damage.' },
    { id: 'shotgun', name: 'PLASMA SHOTGUN', cost: 0, owned: true, icon: '💥',
      ammo: 8, maxAmmo: 8, reserve: 30, damage: 10, fireRate: 400,
      color: '#ff44ff', canCharge: false, pellets: 6, spread: 0.5,
      desc: 'Close-range devastation. 6 pellets per shot.' },
    { id: 'smg', name: 'ANTIBODY SMG', cost: 0, owned: true, icon: '🔫',
      ammo: 50, maxAmmo: 50, reserve: 150, damage: 8, fireRate: 50,
      color: '#ffff44', canCharge: false, spread: 0.15,
      desc: 'Rapid fire. Slight spread. Great for crowd control.' },
    { id: 'sniper', name: 'NEURAL SNIPER', cost: 2500, owned: false, icon: '🎯',
      ammo: 5, maxAmmo: 5, reserve: 25, damage: 80, fireRate: 800,
      color: '#00ff00', canCharge: false, piercing: true,
      desc: 'Single shot, massive damage, pierces through enemies.' },
    { id: 'rocket', name: 'CELL LAUNCHER', cost: 3500, owned: false, icon: '🚀',
      ammo: 4, maxAmmo: 4, reserve: 16, damage: 60, fireRate: 600,
      color: '#ff8800', canCharge: false, explosive: true, explosionRadius: 80,
      desc: 'Explosive cellular projectiles. AoE damage.' },
    { id: 'beam', name: 'PHOTON BEAM', cost: 4000, owned: false, icon: '☀',
      ammo: 100, maxAmmo: 100, reserve: 300, damage: 4, fireRate: 30,
      color: '#ff00ff', canCharge: false,
      desc: 'Continuous beam. Low per-shot damage, very high DPS.' },
    { id: 'auto', name: 'ENZYME AUTO-RIFLE', cost: 5000, owned: false, icon: '⚙',
      ammo: 60, maxAmmo: 60, reserve: 180, damage: 14, fireRate: 70,
      color: '#88ff44', canCharge: false, spread: 0.08,
      desc: 'High DPS auto-rifle. Tight accuracy.' },
    { id: 'plasma', name: 'PLASMA OVERLOAD', cost: 8000, owned: false, icon: '⚛',
      ammo: 12, maxAmmo: 12, reserve: 36, damage: 50, fireRate: 200,
      color: '#ff0088', canCharge: true, explosive: true, explosionRadius: 60,
      desc: 'ELITE: Chargeable explosive plasma orbs.' },
  ],

  // ---------- ENEMIES ----------
  ENEMIES: {
    spiker:  { health: 30, damage: 8,  speed: 0.85, radius: 16, color: '#00ff66', attackRange: 30,  xp: 20, credit: 8,  spikes: 8 },
    bloater: { health: 70, damage: 20, speed: 0.35, radius: 25, color: '#ff8844', attackRange: 40,  xp: 40, credit: 15, explodesOnDeath: true },
    cloaker: { health: 40, damage: 12, speed: 1.25, radius: 14, color: '#ff44ff', attackRange: 25,  xp: 35, credit: 12, cloaked: true },
    phantom: { health: 25, damage: 10, speed: 1.0,  radius: 18, color: '#ffff44', attackRange: 200, xp: 50, credit: 18, ranged: true },
  },

  BOSSES: [
    { name: 'THE ARCHITECT', health: 600,  damage: 25, speed: 0.45, radius: 55, color: '#ff0066', xp: 500,  credit: 200 },
    { name: 'THE OVERMIND',  health: 1000, damage: 30, speed: 0.50, radius: 60, color: '#aa44ff', xp: 800,  credit: 400 },
    { name: 'THE PRIME',     health: 1500, damage: 35, speed: 0.55, radius: 65, color: '#ff00ff', xp: 1200, credit: 800 },
  ],

  // ---------- ORGANS ----------
  ORGANS: {
    Heart:   { bgColor: '#1a0510', fogColor: '#3d0a1a', accentColor: '#ff3366', enemyTypes: ['spiker', 'bloater'],            count: 8  },
    Lungs:   { bgColor: '#051520', fogColor: '#0a3045', accentColor: '#33aaff', enemyTypes: ['spiker', 'cloaker', 'bloater'], count: 10 },
    Brain:   { bgColor: '#150525', fogColor: '#2a0a45', accentColor: '#aa44ff', enemyTypes: ['spiker', 'cloaker', 'phantom'], count: 12 },
    Stomach: { bgColor: '#251505', fogColor: '#452a0a', accentColor: '#ffaa44', enemyTypes: ['spiker', 'bloater', 'phantom'], count: 9  },
  },

  // ---------- PATIENTS ----------
  PATIENTS: [
    { id: 'p1', name: 'Sarah Chen (Age 8)',         disease: 'Strain-X Pediatric Outbreak',
      desc: 'A young girl with rapidly spreading viral infection. Standard combat. Keep her alive.',
      organs: ['Heart', 'Lungs'],                       parTime: 240,  baseReward: 800,
      unlocked: true,  completed: false, difficulty: 1 },
    { id: 'p2', name: 'Marcus Webb (Age 42)',       disease: 'Encephalitis Virus',
      desc: 'A construction worker with brain inflammation. Beware hallucination zones.',
      organs: ['Brain', 'Lungs'],                       parTime: 300,  baseReward: 1200,
      unlocked: false, completed: false, difficulty: 2 },
    { id: 'p3', name: 'Linda Park (Age 67)',        disease: 'Gastric Mutation',
      desc: 'Elderly patient. Stomach viruses with acid resistance. Final boss.',
      organs: ['Stomach', 'Heart'],                     parTime: 360,  baseReward: 1800,
      unlocked: false, completed: false, difficulty: 3, hasBoss: true },
    { id: 'p4', name: 'Jamal Reeves (Age 28)',      disease: 'Full-Body Necrosis',
      desc: 'Athlete with multi-organ infection. All four organs compromised.',
      organs: ['Heart', 'Lungs', 'Brain', 'Stomach'],   parTime: 600,  baseReward: 3000,
      unlocked: false, completed: false, difficulty: 4, hasBoss: true },
    { id: 'p5', name: 'Dr. Vera Holst (Age 51)',    disease: 'The Architect Strain — Mutated',
      desc: 'A researcher who experimented on herself. Stronger enemies. Two bosses.',
      organs: ['Brain', 'Heart', 'Lungs', 'Stomach'],   parTime: 720,  baseReward: 5000,
      unlocked: false, completed: false, difficulty: 5, hasBoss: true, doubleBoss: true },
    { id: 'p6', name: 'Dr. Elena Vasquez (Age 55)', disease: 'PRIME ARCHITECT — Final Form',
      desc: 'The creator of the program. She infected herself with the master virus. Save her — and humanity.',
      organs: ['Heart', 'Lungs', 'Brain', 'Stomach'],   parTime: 900,  baseReward: 10000,
      unlocked: false, completed: false, difficulty: 6, hasBoss: true, doubleBoss: true, finalBoss: true },
  ],

  // ---------- BIO-LAB UPGRADES ----------
  HUB_UPGRADES: [
    { id: 'health',  name: 'Max Health',      desc: '+25 max HP per level',         baseCost: 500, scale: 1.5, maxLevel: 5 },
    { id: 'speed',   name: 'Movement Speed',  desc: '+10% speed per level',         baseCost: 600, scale: 1.6, maxLevel: 3 },
    { id: 'shield',  name: 'Shield Capacity', desc: '+25 max shield per level',     baseCost: 700, scale: 1.5, maxLevel: 4 },
    { id: 'reload',  name: 'Reload Speed',    desc: 'Auto-reload empty weapons faster', baseCost: 800, scale: 1.5, maxLevel: 3 },
    { id: 'grenade', name: 'Grenade Capacity',desc: '+2 max grenades per level',    baseCost: 600, scale: 1.6, maxLevel: 3 },
    { id: 'dash',    name: 'Dash Cooldown',   desc: '-0.2s dash CD per level',      baseCost: 700, scale: 1.6, maxLevel: 3 },
  ],

  // ---------- MID-MISSION CHOICES ----------
  MID_CHOICES: [
    { id: 'vital',     icon: '❤️',  name: 'Vital Boost',         desc: 'Restore HP fully + 20 max HP' },
    { id: 'agility',   icon: '💨', name: 'Cellular Agility',    desc: '+15% movement speed' },
    { id: 'biocharge', icon: '⚡', name: 'Bio-Charged Rounds',  desc: '+20% weapon damage' },
    { id: 'mags',      icon: '📦', name: 'Extended Magazines',  desc: '+50% magazine capacity' },
    { id: 'reinforce', icon: '🛡', name: 'Reinforced Shield',   desc: '+50 max shield, refilled' },
    { id: 'reflex',    icon: '🤸', name: 'Quick Reflexes',      desc: 'Dash cooldown -40%' },
    { id: 'grenades',  icon: '💣', name: 'Grenade Belt',        desc: '+3 grenades right now' },
    { id: 'rapid',     icon: '🔥', name: 'Rapid Fire',          desc: '+25% fire rate' },
    { id: 'regen',     icon: '✨', name: 'Cell Regeneration',   desc: 'Heal 1 HP/sec passively' },
  ],

  TIME: { BONUS_MULT: 1.0, PENALTY_MAX: 0.7, PENALTY_RATE: 0.3 },
};

// ---------- PLAYER PROGRESSION (persistent) ----------
const playerData = {
  credits: 500,
  totalScore: 0,
  weaponsOwned: ['rifle', 'shotgun', 'smg'],
  equippedWeapons: ['rifle', 'shotgun', 'smg'],
  upgrades: { health: 0, speed: 0, shield: 0, reload: 0, grenade: 0, dash: 0 },
  patientsCompleted: [],
  currentMissionId: null,
};

// ---------- LIVE GAME STATE ----------
const Game = {
  canvas: null, ctx: null,
  W: CONFIG.CANVAS.WIDTH, H: CONFIG.CANVAS.HEIGHT,
  running: false, time: 0, lastTime: 0,

  player: null,
  weapons: [],
  enemies: [], projectiles: [], enemyProjectiles: [],
  particles: [], grenades: [], pickups: [],
  ambientCells: [], decorations: [],
  obstacles: [], hazards: [],

  mission: null,
  currentOrganIdx: 0,
  organCleared: 0,
  score: 0,
  creditsEarned: 0,
  missionTime: 0,
  bossSpawned: false,
  bossesDefeated: 0,

  keys: {}, mouse: { x: 600, y: 375, down: false },
  screenShake: 0,
  audioContext: null,
  heartbeatInterval: null,
  midRunBonuses: { dmgMult: 1, fireRateMult: 1, magMult: 1, regen: 0 },
};
