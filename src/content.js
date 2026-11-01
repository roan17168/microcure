// MicroCure — content, tuning, copy. Pure data so the audit can import it in Node.
// Every player-visible number lives here, not in entity logic.

export const GAME = {
  title: 'MICROCURE',
  subtitle: 'VITAL SIGN',
  version: '1.0.0 // OUTBREAK',
  studio: 'NEXUS MEDICAL // FIELD UNIT 07',
  saveKey: 'microcure.save.v1',
  seedPrefix: 'MC',
  caseNumber: '001',
  casePrefix: 'CASE',
};

// The game targets 60 Hz on integrated graphics, not just on the machine it was
// authored on. These are the budgets and the governor that enforces them; no
// entity is allowed to invent its own resolution or frame-rate policy.
export const PERFORMANCE = {
  targetFrameMs: 16.7,
  highFrameMs: 21.5,
  lowFrameMs: 13.8,
  emergencyFrameMs: 30,
  sampleInterval: 0.5,
  adjustInterval: 0.9,
  scaleStep: 0.07,
  minRenderScale: 0.62,
  maxRenderScale: 1.0,
  lowRenderScale: 0.82,
  // Native retina resolution is four times the fragment cost of CSS pixels and
  // is invisible on a stylised tissue surface at speed. Cap it once here.
  maxPixelRatioHigh: 1.25,
  maxPixelRatioLow: 1.0,
  bloomScale: 0.5,
  menuHz: 30,
  hudHz: 20,
  dustHz: 30,
  cullInterval: 0.18,
  enemyCullDistance: 46,
  propCullDistance: 54,
  maxDrawCalls: 520,
  maxLights: 10,
};

export const PATIENT = {
  id: 'elias-voss',
  name: 'ELIAS VOSS',
  age: 34,
  sex: 'M',
  occupation: 'Orbital dockworker',
  blood: 'O−',
  weight: '81 kg',
  condition: 'Engineered sepsis · Chorus-7',
  status: 'CRITICAL / 04:12 TO FLATLINE',
  summary:
    'A second circulatory system is growing in his left lung. It is also keeping him alive.',
  file: [
    'Subject presented with hemoptysis and a systolic murmur. CT shows a non-human vascular lattice in the left lung, extending toward the aortic root.',
    'Compound identified as CHORUS-7, a Nexus regenerative symbiont declared destroyed in 2049. No manufacturing record survives. The sample in Voss is more advanced than anything in our archive.',
    'Patient is conscious during injection. He has asked, twice, whether this will hurt his sister. He has not asked whether it will hurt him.',
  ],
  note: 'The infection has a route and a rhythm. Follow it.',
  vitals: [
    ['HR', '132', 'BPM'],
    ['BP', '78/41', 'MMHG'],
    ['SPO₂', '86', '%'],
    ['TEMP', '40.1', '°C'],
  ],
};

export const DISCIPLINES = [
  {
    id: 'trauma',
    name: 'TRAUMA SURGEON',
    tag: 'Offense / high collateral',
    blurb: 'Hits harder. Misses cost the host more.',
    mods: { damage: 1.15, collateral: 1.3, extraStabilizer: 0, extraMedkit: 0 },
    weapon: { name: 'BV-7 BREACHER', short: 'BREACHER', label: 'BREACHER', accent: 0xff8a3d, muzzle: -0.94 },
    loadout: ['Bio-Volt Rifle', 'Dash', 'Fracture Grenade'],
  },
  {
    id: 'medic',
    name: 'FIELD MEDIC',
    tag: 'Sustain / low collateral',
    blurb: 'Softer rounds. More stabilizers.',
    mods: { damage: 0.93, collateral: 0.8, extraStabilizer: 1, extraMedkit: 1, maxHp: 5 },
    weapon: { name: 'BV-7 FIELD KIT', short: 'FIELD', label: 'FIELD KIT', accent: 0x5fe0cb, muzzle: -0.94 },
    loadout: ['Bio-Volt Rifle', 'Dash', 'Tissue Stabilizer'],
  },
  {
    id: 'pathologist',
    name: 'CLINICAL PATHOLOGIST',
    tag: 'Objective / fragile',
    blurb: 'Faster hands. Weaker shell. Cuts infection nodes harder.',
    mods: {
      damage: 1.06,
      collateral: 0.9,
      extraStabilizer: 0,
      extraMedkit: 0,
      maxHp: -10,
      reserve: -24,
      fireRate: 0.94,
      reload: 0.9,
      nodeDamage: 1.3,
    },
    weapon: { name: 'BV-7 BIOPSY', short: 'BIOPSY', label: 'BIOPSY', accent: 0xcbe39a, muzzle: -1.36 },
    loadout: ['Bio-Volt Rifle', 'Dash', 'Clean Cuts'],
  },
];

export const WEAPON = {
  id: 'bio-volt',
  name: 'BIO-VOLT RIFLE',
  short: 'BV-7',
  description:
    'Tissue-safe conducted-energy rounds. The only weapon cleared for use inside a living host without a waiver.',
  damage: 28,
  fireInterval: 0.12,
  mag: 18,
  reserve: 90,
  reload: 1.62,
  spread: 0.0038,
  movingSpread: 0.026,
  // Braced aim trades mobility for a tighter cone. It does not change damage,
  // ammo or Host Integrity; it rewards reading a weak point before firing.
  aimSpread: 0.42,
  aimSpeed: 0.55,
  aimZoom: 11,
  // Press R again as the reload passes through this band. A matched load snaps
  // the magazine home; an early or late press binds it and costs time. Values
  // are fractions of the current reload duration, except the penalty in seconds.
  activeReload: {
    start: 0.56,
    end: 0.74,
    snap: 0.16,
    penalty: 0.45,
  },
  recoil: 0.007,
  collateral: 0.16,
  range: 90,
  color: 0x9bffe4,
};

// Precision is the answer to a swarm. Body shots wound; exposed sacs, eyes and
// cores rupture. Every creature owns its weak-point anatomy in ENEMIES below so
// the player can learn the tell instead of memorising a global multiplier.
export const FOCUS = {
  max: 100,
  duration: 4.2,
  enemyTime: 0.34,
  hitGain: 10,
  // A dash-through is a deliberate close-range read, so it feeds the focus
  // meter even when it does not finish the target. The rifle remains the main
  // source of focus; this only rewards the repositioning line.
  dashStrikeGain: 4,
  weakKillGain: 8,
  cleanNodeGain: 20,
  eliteKillGain: 18,
  bossNodeGain: 16,
};

export const COMBAT = {
  // How many creatures may commit to a melee wind-up at once. Without a cap a
  // pack reaches the surgeon on the same frame and the room reads as a wall of
  // damage rather than a set of threats to read. Slots are soft reservations:
  // they expire on their own, so a corpse can never hold one forever.
  meleeSlots: 2,
  meleeSlotTierBonus: 1,
  meleeSlotHold: 2.4,
  meleeSlotRetry: [0.45, 0.8],
  bodyDamage: 0.82,
  weakpointDamage: 2.35,
  weakpointStagger: 0.34,
  corpseTime: 4.2,
  ceilingGap: 1.0,
  ceilingHuntSpeed: 4.1,
  ceilingDropRadius: 4.6,
  ceilingHuntTime: 2.6,
  nodeBroodInterval: 15.5,
  nodeBroodJitter: 4.5,
  broodCap: 32,
  broodWaveDelay: 1.15,
  broodWave: {
    infection: ['crawler', 'crawler', 'mite'],
    hub: ['crawler', 'mite'],
    cache: ['crawler', 'mite'],
    secret: ['wall', 'crawler'],
    exit: ['crawler'],
    boss: [],
  },
};

// The infection is supposed to feel like it is already inside the room. Higher
// aggression ranges, lower silhouettes, and one ceiling ambusher make retreat
// and spray-fire less reliable than reading the floor and the walls.

export const GAMEPAD = {
  deadzone: 0.18,
  fireThreshold: 0.22,
  lookRate: 2.7,
  menuRepeat: 0.3,
};

export const PLAYER = {
  maxHp: 100,
  eyeHeight: 1.68,
  radius: 0.44,
  speed: 5.3,
  sprintSpeed: 7.1,
  // Sprint is earned by sustained forward movement, not a second modifier key.
  // Shift is now the dedicated dash, so there is always one input per verb.
  sprintHold: 0.55,
  // Apex is ~1.54 m: enough to reach the 0.9 m tissue shelves and the 1.66 m
  // boss tier from the first shelf, without turning rooms into trampolines.
  jumpSpeed: 8.6,
  gravity: 24,
  coyoteTime: 0.13,
  jumpBuffer: 0.13,
  airControl: 0.78,
  // Melee and floor hazards pass under boots above this height. Ranged shots
  // use full 3D distance, so height is cover from the floor, not from the room.
  airDodgeHeight: 0.62,
  landSlamSpeed: 7.2,
  landSlamRadius: 2.6,
  landSlamStagger: 0.38,
  // The boots are a weapon. A full jump lands above the slam threshold, so
  // every committed jump can be turned into a close-range answer to a swarm.
  // It costs no Host Integrity: this is the surgeon's body, not a round.
  landSlamDamage: 34,
  accel: 46,
  friction: 14,
  dashSpeed: 22,
  dashTime: 0.2,
  dashCooldown: 1.05,
  dashIFrames: 0.34,
  dashProjectileClear: 1.15,
  dashStaggerRadius: 2.0,
  dashStaggerTime: 0.28,
  // The dash is a shoulder-first shove, not a second gun. It ruptures a clot
  // already in reach and staggers the room for the follow-up shot. It costs no
  // Host Integrity because nothing is discharged into the patient: the damage
  // is the surgeon's mass and the suit, so it stays a positioning tool.
  dashStrikeRadius: 1.15,
  dashStrikeDamage: 24,
  dashStrikeStagger: 0.55,
  dashStrikeKillRefund: 0.45,
  spawnIFrames: 0.65,
  hitIFrames: 0.24,
  respawnIFrames: 1.5,
  // Taking a hit costs a short committed stagger. It never removes input and
  // never chains: iframes expire long before a second hit can land.
  hitStun: 0.2,
  hitStunSpeed: 0.55,
  // Below this fraction of the surgeon's own bar the vitals warning escalates.
  criticalFrac: 0.34,
  medkitHeal: 38,
  medkits: 2,
  stabilizers: 2,
  stabilizeHeal: 12,
  grenades: 2,
  grenadeRadius: 4.6,
  grenadeDamage: 130,
  grenadeHostCost: 4,
  cauteryRange: 4.2,
  cauteryDamage: 34,
  cauteryCooldown: 3.4,
  channelTime: 0.95,
  injections: 2,
  respawnHp: 65,
  respawnHostCost: 18,
  respawnTimeLoss: 30,
  interOrganHeal: 20,
  interOrganAmmo: 30,
};

export const HOST = {
  max: 100,
  baseDrain: 0.04,
  nodeDrain: 0.065,
  heartBaseDrain: 0.055,
  heartNodeDrain: 0.085,
  shotNodeCost: 6,
  sporeBurstCost: 2,
  lowWarning: 40,
  criticalWarning: 20,
};

// The body is not one texture. These are presentation-only signatures: the
// breath sway of the lung, the ventricular kick of the heart. They never change
// damage, Host Integrity, speed or score.
export const ORGAN_AMBIENCE = {
  lung: { breathRate: 0.42, breathDepth: 0.55, heartKick: 0, heartRate: 0 },
  heart: { breathRate: 0.16, breathDepth: 0.15, heartKick: 1, heartRate: 0.9 },
  brain: { breathRate: 0.3, breathDepth: 0.2, heartKick: 0.35, heartRate: 0.7 },
  stomach: { breathRate: 0.22, breathDepth: 0.25, heartKick: 0.25, heartRate: 0.6 },
  liver: { breathRate: 0.26, breathDepth: 0.2, heartKick: 0.3, heartRate: 0.65 },
  kidney: { breathRate: 0.34, breathDepth: 0.18, heartKick: 0.25, heartRate: 0.7 },
  marrow: { breathRate: 0.5, breathDepth: 0.12, heartKick: 0.2, heartRate: 0.55 },
  eye: { breathRate: 0.38, breathDepth: 0.1, heartKick: 0.3, heartRate: 0.75 },
};

export const TIMER_WARNING = 60;

// Loot is part of the combat economy, so its chances and caps belong here with
// the rest of the tuning. A drop is a decision about when to cross a room, not
// an invisible random bonus buried in the update loop.
export const PICKUPS = {
  ammoChance: 0.24,
  medkitChance: 0.09,
  grenadeChance: 0.03,
  ammoAmount: 14,
  medkitCap: 4,
  grenadeCap: 3,
};

// A case is a patient, not a corridor. Every so often the host destabilises
// while the surgeon is inside: a vessel opens in the current chamber, the
// theatre alarms and the player has one short window to reach it and cauterise
// it. Sealing is the only clean answer; ignoring it costs the patient directly
// and opens a brood breach. The event is seeded per organ, so a case still
// plays differently without becoming a random punishment.
export const CRISES = {
  firstDelay: 26,
  interval: 58,
  jitter: 10,
  maxPerOrgan: 2,
  // A surgeon who has not found the cautery yet cannot be handed an impossible
  // emergency. The event waits a short grace period after the tool is acquired.
  toolGrace: 5,
  window: 17,
  sealTime: 1.25,
  // The wound is a target the player must resist, not cover fire into. Each
  // hit tears it wider; the countdown is the feedback, so no extra HUD is
  // needed to explain the penalty.
  shotPenalty: 2.4,
  hostLoss: 9,
  hostGain: 6,
  score: 140,
  focus: 14,
  ruptureEnemies: 2,
  spawnRadius: 0.55,
  spawnMinPlayerDistance: 3.4,
  interactRange: 4.2,
};

export const ENEMIES = {
  spore: {
    id: 'spore',
    name: 'SPORE BROOD',
    hp: 52,
    speed: 5.4,
    radius: 0.72,
    explodeRadius: 3.5,
    explodeDamage: 34,
    fuse: 0.58,
    aggro: 46,
    weak: { y: 0.54, z: -0.36, r: 0.34, mult: COMBAT.weakpointDamage, label: 'SAC' },
    score: 20,
    color: 0xd9e58a,
    glow: 0xcfff74,
    style: 'skitter',
    behavior: 'skitter',
    hint: 'Low, fast and ripe. Kill it before it splits open.',
  },
  crawler: {
    id: 'crawler',
    name: 'MACROPHAGE',
    hp: 112,
    speed: 5.5,
    radius: 0.68,
    damage: 18,
    range: 2.2,
    windup: 0.4,
    cooldown: 1.05,
    leapSpeed: 10.4,
    leapTime: 0.28,
    aggro: 46,
    weave: 0.34,
    weak: { y: 0.72, z: 0.9, r: 0.26, mult: COMBAT.weakpointDamage, label: 'EYES' },
    score: 35,
    color: 0xe39b7a,
    glow: 0xffb08a,
    style: 'ground',
    behavior: 'leap',
    hint: 'Crouches, then launches. Dash late, not early.',
  },
  turret: {
    id: 'turret',
    name: 'CLOT NODE',
    hp: 132,
    speed: 0,
    radius: 0.95,
    damage: 15,
    range: 29,
    windup: 0.52,
    cooldown: 1.7,
    projectileSpeed: 21,
    lead: 0.24,
    burst: 1,
    aggro: 32,
    weak: { y: 1.45, z: 0.38, r: 0.3, mult: COMBAT.weakpointDamage, label: 'EYE' },
    score: 45,
    color: 0x9e3b3b,
    glow: 0xff7a55,
    style: 'anchored',
    hint: 'Anchored. It leads your sprint. Break sight or close the gap.',
  },
  brute: {
    id: 'brute',
    name: 'FIBRIN BRUTE',
    hp: 344,
    speed: 3.9,
    radius: 1.15,
    damage: 36,
    range: 3.0,
    windup: 0.56,
    cooldown: 1.25,
    chargeSpeed: 14,
    chargeTime: 0.32,
    aggro: 48,
    weak: { y: 1.5, z: 1.02, r: 0.34, mult: COMBAT.weakpointDamage, label: 'CORE' },
    score: 95,
    color: 0xba4c4c,
    glow: 0xff5e48,
    style: 'heavy',
    behavior: 'charge',
    hint: 'Armored mass. Cautery staggers it; grenades break it.',
  },
  mite: {
    id: 'mite',
    name: 'BILIOUS SWARM',
    hp: 32,
    speed: 6.6,
    radius: 0.5,
    explodeRadius: 2.6,
    explodeDamage: 22,
    fuse: 0.42,
    aggro: 50,
    pack: 3,
    weak: { y: 0.5, z: -0.3, r: 0.28, mult: COMBAT.weakpointDamage, label: 'SAC' },
    score: 12,
    color: 0xc3d36d,
    glow: 0xeaff7a,
    style: 'skitter',
    behavior: 'skitter',
    hint: 'They come in threes. Kill the swarm before it surrounds you.',
  },
  spitter: {
    id: 'spitter',
    name: 'SEROUS SPITTER',
    hp: 92,
    speed: 0,
    radius: 0.9,
    damage: 12,
    range: 27,
    windup: 0.44,
    cooldown: 1.28,
    projectileSpeed: 23,
    lead: 0.34,
    burst: 2,
    aggro: 34,
    weak: { y: 1.38, z: 0.34, r: 0.26, mult: COMBAT.weakpointDamage, label: 'MUCUS GUT' },
    score: 40,
    color: 0x6f9b72,
    glow: 0xb6f58e,
    style: 'anchored',
    hint: 'Anchored artillery. Two shots, both leading your sprint.',
  },
  stalker: {
    id: 'stalker',
    name: 'FASCIA STALKER',
    hp: 86,
    speed: 6.8,
    radius: 0.6,
    damage: 17,
    range: 1.85,
    windup: 0.28,
    cooldown: 0.8,
    flank: 0.95,
    aggro: 52,
    weave: 0.55,
    weak: { y: 0.72, z: 0.88, r: 0.23, mult: COMBAT.weakpointDamage, label: 'EYES' },
    score: 40,
    color: 0x9a665c,
    glow: 0xffaa86,
    style: 'ground',
    behavior: 'flank',
    hint: 'It circles before it strikes. Watch your blind side.',
  },
  wall: {
    id: 'wall',
    name: 'PARIETAL CRAWLER',
    hp: 96,
    speed: 6.0,
    radius: 0.62,
    damage: 18,
    range: 2.0,
    windup: 0.3,
    cooldown: 0.9,
    aggro: 18,
    dropHeight: 3.4,
    dropDelay: 0.52,
    weave: 0.3,
    weak: { y: 0.54, z: -0.36, r: 0.33, mult: COMBAT.weakpointDamage, label: 'SAC' },
    score: 55,
    color: 0x8e5e5e,
    glow: 0xff9c7a,
    style: 'wall',
    behavior: 'drop',
    hint: 'Clings above the room. Watch the walls, not the floor.',
  },
  goliath: {
    id: 'goliath',
    name: 'CALCIFIED GOLIATH',
    hp: 430,
    speed: 2.8,
    radius: 1.28,
    damage: 40,
    range: 3.2,
    windup: 0.68,
    cooldown: 1.45,
    aggro: 42,
    weak: { y: 1.5, z: 1.02, r: 0.36, mult: COMBAT.weakpointDamage, label: 'CORE' },
    score: 120,
    color: 0x8d795d,
    glow: 0xffc07a,
    style: 'heavy',
    hint: 'Slow, plated, and relentless. Cautery opens its shell.',
  },
};

// Elite pathology. These are modifiers applied to an existing roster enemy, so
// every organ can produce a rare threat without a second model set. Tier gates
// keep the nastier strains out of a first case.
export const ELITES = [
  {
    id: 'calcified',
    name: 'CALCIFIED',
    hp: 1.85,
    damage: 1.25,
    speed: 0.84,
    scale: 1.2,
    tint: 0xd8c2a0,
    glow: 0xffcf9a,
    minTier: 1,
  },
  {
    id: 'frenzied',
    name: 'FRENZIED',
    hp: 1.35,
    damage: 1.15,
    speed: 1.3,
    scale: 1.06,
    tint: 0xff9b82,
    glow: 0xff5a3c,
    minTier: 2,
  },
  {
    id: 'septic',
    name: 'SEPTIC',
    hp: 1.55,
    damage: 1.1,
    speed: 1.05,
    scale: 1.12,
    tint: 0xbde47e,
    glow: 0xd6ff74,
    minTier: 3,
  },
];

export const ELITE_TUNING = {
  chance: 0.08,
  tierStep: 0.035,
  maxChance: 0.26,
  score: 2,
};

// Room pressure. Infection rooms get one extra body from the first case; every
// non-entry room gets a second body once the player reaches tier 2. Ceiling
// crawlers spawn on the room lip so they read as attached to the wall.
export const SPAWN_TUNING = {
  roomBonus: 1,
  infectionBonus: 2,
  tierBonus: 1,
  tierBonusAt: 2,
  wallRadius: 0.86,
};

export const BOSS = {
  id: 'warden',
  name: 'THE THROMBUS WARDEN',
  designation: 'CHORUS-7 / NEXUS SURGICAL DRONE 04',
  hp: 2600,
  coreRadius: 1.35,
  intro:
    'It was a surgical drone. The infection grew a body around it. It is still trying to finish an operation that ended nine years ago.',
  phases: [
    {
      id: 0,
      name: 'CALCIFIED',
      note: 'Two calcified relays shield the core. Break them.',
      shieldNodes: 2,
      nodeHp: 150,
      volley: 2.6,
      summon: 9,
    },
    {
      id: 1,
      name: 'RUPTURE',
      note: 'The core is exposed. It is angry.',
      volley: 2.1,
      summon: 7,
      charge: 5.5,
    },
    {
      id: 2,
      name: 'FIBRILLATION',
      note: 'No more surgery. Only rhythm.',
      volley: 1.5,
      summon: 5.5,
      charge: 4.2,
      hazard: 3.2,
    },
  ],
  phaseAt: [0.66, 0.33],
  score: 600,
};

// The heart always ends the case, but the thing wearing the drone changes.
// Same surgical rig, different pathology and palette, so repeated cases do not
// rehearse the same final fight.
// Each variant changes the fight, not just the palette: shield relay count,
// barrage density, summon roster and the cadence of the phase attacks.
export const BOSS_VARIANTS = [
  {
    id: 'warden',
    name: 'THE THROMBUS WARDEN',
    designation: 'CHORUS-7 / NEXUS SURGICAL DRONE 04',
    hpMult: 1,
    core: 0xff5b46,
    halo: 0x6fe3d2,
    phaseNames: ['CALCIFIED', 'RUPTURE', 'FIBRILLATION'],
    intro: 'It was a surgical drone. The infection grew a body around it. It is still trying to finish an operation that ended nine years ago.',
    mech: {
      nodes: 2,
      nodeHp: 1,
      volley: 1,
      summon: 1,
      charge: 1,
      hazard: 1,
      barrage: 10,
      aimed: 3,
      ring: false,
      summonPool: ['spore', 'crawler'],
    },
  },
  {
    id: 'choir',
    name: 'THE CALCIFIED CHOIR',
    designation: 'CHORUS-7 / NEXUS SUTURE ARRAY 11',
    hpMult: 1.18,
    core: 0xffb45c,
    halo: 0x9dd7ff,
    phaseNames: ['OSSIFIED', 'HARMONIC', 'DISCORD'],
    intro: "Eleven surgical arms fused into a single voice. It sings the patient's pulse back at you, half a beat late.",
    mech: {
      nodes: 3,
      nodeHp: 0.82,
      volley: 1.18,
      summon: 0.85,
      charge: 0.78,
      hazard: 0.9,
      barrage: 14,
      aimed: 2,
      ring: true,
      summonPool: ['mite', 'spitter'],
    },
  },
  {
    id: 'saint',
    name: 'THE SUTURE SAINT',
    designation: 'CHORUS-7 / NEXUS FIELD UNIT 00',
    hpMult: 0.92,
    core: 0xd08bff,
    halo: 0xffc27a,
    phaseNames: ['STITCHED', 'UNRAVELLED', 'EXPOSED'],
    intro: 'It still believes it is saving the patient. Every incision it makes is a prayer with the wrong address.',
    mech: {
      nodes: 1,
      nodeHp: 1.5,
      volley: 0.82,
      summon: 1.2,
      charge: 0.58,
      hazard: 0.55,
      barrage: 8,
      aimed: 5,
      ring: false,
      earlyHazard: true,
      summonPool: ['stalker', 'brute'],
    },
  },
];

// Twelve installable adaptations. Each transition offers three seeded choices
// from this pool, and installed ones are excluded until the pool runs dry, so
// two cases do not build the same surgeon.
export const ADAPTATIONS = [
  {
    id: 'vasodilation',
    name: 'VASODILATION',
    branch: 'Sustain',
    desc: '+20 suit integrity. Heal 20 now.',
    effects: { maxHp: 20, healNow: 20 },
  },
  {
    id: 'suture',
    name: 'TISSUE SUTURE',
    branch: 'Host',
    desc: '+1 stabilizer, +8 Host, 12% slower drain.',
    effects: { stabilizer: 1, hostHeal: 8, hostDrain: 0.88 },
  },
  {
    id: 'overclock',
    name: 'OVERCLOCK',
    branch: 'Speed',
    desc: '15% faster fire, 25% more collateral.',
    effects: { fireRate: 0.85, collateral: 1.25 },
  },
  {
    id: 'hemostat',
    name: 'HEMOSTAT',
    branch: 'Offense',
    desc: '+12% rifle damage. No Host cost.',
    effects: { damage: 1.12 },
  },
  {
    id: 'cardiac',
    name: 'CARDIAC ASSIST',
    branch: 'Host',
    desc: '+10 maximum Host. Heal 10 now.',
    effects: { hostMax: 10, hostHeal: 10 },
  },
  {
    id: 'field-kit',
    name: 'FIELD KIT',
    branch: 'Sustain',
    desc: '+1 medkit. Medkits heal 25% more.',
    effects: { medkit: 1, medkitHeal: 1.25 },
  },
  {
    id: 'light-feet',
    name: 'LIGHT FEET',
    branch: 'Speed',
    desc: '8% faster movement. 15% shorter dash cooldown.',
    effects: { moveSpeed: 1.08, dashCooldown: 0.85 },
  },
  {
    id: 'steady-hands',
    name: 'STEADY HANDS',
    branch: 'Speed',
    desc: '15% faster reload. +24 reserve rounds.',
    effects: { reload: 0.85, ammo: 24 },
  },
  {
    id: 'conductor',
    name: 'CONDUCTOR',
    branch: 'Tool',
    desc: '+40% cautery damage. 20% shorter cooldown.',
    effects: { cautery: 1.4, cauteryCooldown: 0.8 },
  },
  {
    id: 'clean-field',
    name: 'CLEAN FIELD',
    branch: 'Host',
    desc: '20% less Host lost to wall hits.',
    effects: { collateral: 0.8 },
  },
  {
    id: 'immunosuppression',
    name: 'IMMUNOSUPPRESSION',
    branch: 'Offense',
    desc: '+18% damage. Infection drains 10% faster.',
    effects: { damage: 1.18, hostDrain: 1.1 },
  },
  {
    id: 'anticoagulant',
    name: 'ANTICOAGULANT',
    branch: 'Tool',
    desc: 'Enemies 8% slower. Host drains 5% faster.',
    effects: { enemySlow: 0.92, hostDrain: 1.05 },
  },
];

export const ROUTES = [
  {
    id: 'aortic',
    name: 'AORTIC DIRECT',
    tag: 'Faster · one elite',
    desc: 'Through the aortic root. −45 seconds. One extra Brute.',
    timer: -45,
    addElite: true,
    medkit: 0,
  },
  {
    id: 'vagal',
    name: 'VAGAL BYPASS',
    tag: 'Longer · safer',
    desc: 'Along the vagus nerve. +60 seconds. One medkit.',
    timer: 60,
    addElite: false,
    medkit: 1,
  },
  {
    id: 'lymphatic',
    name: 'LYMPHATIC DETOUR',
    tag: 'Safer · host repair',
    desc: 'Through the lymph nodes. +25 seconds. Recover 12 Host.',
    timer: 25,
    addElite: false,
    medkit: 0,
    host: 12,
  },
  {
    id: 'venous',
    name: 'VENOUS SHUNT',
    tag: 'Brutal · fast + ammo',
    desc: 'Straight through the vein. −80 seconds. +60 reserve.',
    timer: -80,
    addElite: true,
    medkit: 0,
    ammo: 60,
  },
];

export const MUTATIONS = [
  {
    id: 'fever',
    name: 'FEVER DREAM',
    desc: 'Enemies 12% faster. Infection drains 15% more.',
    enemySpeed: 1.12,
    hostDrain: 1.15,
  },
  {
    id: 'brittle',
    name: 'BRITTLE TISSUE',
    desc: 'Wall hits cost 50% more Host. Richer ammo.',
    collateral: 1.5,
    ammoDrop: 1.35,
  },
  {
    id: 'hemorrhage',
    name: 'HEMORRHAGIC SHIFT',
    desc: 'Start at 88 Host. Stabilizers +25%.',
    startHost: -12,
    stabilize: 1.25,
  },
  {
    id: 'hyperplasia',
    name: 'HYPERPLASIA',
    desc: 'One extra enemy per room. One extra medkit.',
    extraEnemies: 1,
    extraMedkit: 1,
  },
  {
    id: 'acidosis',
    name: 'ACIDOSIS',
    desc: 'Infection drains 25% faster. Stabilizers +20%.',
    hostDrain: 1.25,
    stabilize: 1.2,
  },
  {
    id: 'swarm',
    name: 'SWARM SEASON',
    desc: 'Two extra enemies per room. Ammo drops richer.',
    extraEnemies: 2,
    ammoDrop: 1.2,
  },
  {
    id: 'calcific',
    name: 'CALCIFIC STORM',
    desc: 'Wall hits cost 35% more Host. Start with +10 Host.',
    collateral: 1.35,
    startHost: 10,
  },
  {
    id: 'fibrillation',
    name: 'FIBRILLATION',
    desc: 'Enemies 8% faster. Stabilizers +25%.',
    enemySpeed: 1.08,
    stabilize: 1.25,
  },
];

// Case protocols are the stipulation attached to a patient, not a menu
// difficulty setting. They are rolled from the run seed, shown before the
// surgeon commits, and cannot be re-rolled. Host interaction is explicit so a
// modifier never quietly changes the patient behind the player's back.
export const PROTOCOLS = [
  {
    id: 'sterile',
    name: 'STERILE FIELD',
    code: 'P-01',
    tag: 'NO COLLATERAL',
    desc: 'Wall hits cost 50% more Host. Score ×1.3 · +2 RP.',
    host: 'Wall hits cost 50% more Host.',
    collateral: 1.5,
    scoreMult: 1.3,
    rp: 2,
  },
  {
    id: 'blackout',
    name: 'BLACKOUT DRILL',
    code: 'P-02',
    tag: 'LOW LIGHT',
    desc: 'Theatre lighting cut. Score ×1.2 · +1 RP.',
    host: 'No Host Integrity interaction.',
    light: 0.58,
    scoreMult: 1.2,
    rp: 1,
  },
  {
    id: 'rush',
    name: 'RUSH ORDER',
    code: 'P-03',
    tag: '−90 SEC PER ORGAN',
    desc: 'Each extraction window is 90 seconds shorter. Score ×1.25 · +2 RP.',
    host: 'No Host Integrity interaction.',
    timer: -90,
    scoreMult: 1.25,
    rp: 2,
  },
  {
    id: 'fragile',
    name: 'FRAGILE HOST',
    code: 'P-04',
    tag: '−15 HOST',
    desc: 'Host Integrity ceiling −15. One extra stabilizer. Score ×1.3 · +2 RP.',
    host: 'Maximum and starting Host Integrity −15.',
    hostMax: -15,
    stabilizers: 1,
    scoreMult: 1.3,
    rp: 2,
  },
  {
    id: 'saturation',
    name: 'SATURATED FIELD',
    code: 'P-05',
    tag: '+2 PER ROOM',
    desc: 'Two extra infections per room. Score ×1.35 · +3 RP.',
    host: 'No Host Integrity interaction.',
    extraEnemies: 2,
    scoreMult: 1.35,
    rp: 3,
    onboarding: false,
  },
  {
    id: 'famine',
    name: 'AMMUNITION FAMINE',
    code: 'P-06',
    tag: 'HALF RESERVE',
    desc: 'Reserve ammunition halved. Score ×1.25 · +2 RP.',
    host: 'No Host Integrity interaction.',
    ammoMult: 0.5,
    scoreMult: 1.25,
    rp: 2,
    onboarding: false,
  },
];

export const RESEARCH = [
  {
    id: 'suit',
    name: 'REINFORCED SHELL',
    cost: 3,
    desc: '+15 surgeon integrity.',
    effects: { maxHp: 15 },
  },
  {
    id: 'stabilizer',
    name: 'AUXILIARY STABILIZER',
    cost: 3,
    desc: '+1 Stabilizer per organ.',
    effects: { stabilizer: 1 },
  },
  {
    id: 'scaffold',
    name: 'TISSUE SCAFFOLD',
    cost: 4,
    desc: '−25% Host lost to wall hits.',
    effects: { collateral: 0.75 },
  },
  {
    id: 'rifle',
    name: 'MATCHED BARREL',
    cost: 4,
    desc: '+12% Bio-Volt damage.',
    effects: { damage: 1.12 },
  },
  {
    id: 'medkit',
    name: 'FIELD DOSES',
    cost: 3,
    desc: '+1 medkit per case.',
    effects: { medkit: 1 },
  },
  {
    id: 'reserve',
    name: 'DEEP RESERVE',
    cost: 3,
    desc: '+60 reserve rounds per organ.',
    effects: { ammo: 60 },
  },
  {
    id: 'armor',
    name: 'SURGEON PLATING',
    cost: 5,
    desc: '+20 surgeon integrity.',
    effects: { maxHp: 20 },
  },
  {
    id: 'host',
    name: 'CARDIAC ASSIST',
    cost: 5,
    desc: '+10 starting Host Integrity.',
    effects: { host: 10 },
  },
  {
    id: 'cautery',
    name: 'WIDE-AREA CAUTERY',
    cost: 4,
    desc: '+50% cautery burst damage.',
    effects: { cautery: 1.5 },
  },
  {
    id: 'adrenal',
    name: 'ADRENAL PUMP',
    cost: 5,
    desc: '−15% dash cooldown.',
    effects: { dash: 0.85 },
  },
  {
    id: 'loader',
    name: 'AUTO-LOADER',
    cost: 4,
    desc: '−15% reload time.',
    effects: { reload: 0.85 },
  },
  {
    id: 'trauma',
    name: 'TRAUMA PROTOCOL',
    cost: 5,
    desc: 'Medkits heal +25%.',
    effects: { medkitHeal: 1.25 },
  },
  {
    id: 'pathology',
    name: 'NODE PATHOLOGY',
    cost: 5,
    desc: '+20% damage to infection nodes.',
    effects: { nodeDamage: 1.2 },
  },
];

export const ORGANS = {
  lung: {
    id: 'lung',
    index: 1,
    name: 'LEFT LUNG',
    subtitle: 'THE ALVEOLAR FIELDS',
    timer: 480,
    nodeDrain: HOST.nodeDrain,
    baseDrain: HOST.baseDrain,
    roster: ['spore', 'crawler', 'turret', 'mite', 'stalker', 'wall'],
    palette: {
      tissue: 0xb56a63,
      tissueDeep: 0x5e2a2a,
      membrane: 0xf0b6a3,
      glow: 0xffd39a,
      accent: 0x79e6d3,
      fog: 0x1a0b0b,
      sky: 0x2a1010,
      floor: 0x4b2424,
    },
    intro: 'The lung is breathing for you. Every alveolus is a room you could drown in.',
    complete: 'Lung clear. The infection is moving.',
    propStyle: 'alveolar',
    layoutStyle: 'alveolar',
  },
  heart: {
    id: 'heart',
    index: 2,
    name: 'HEART',
    subtitle: 'THE VENTRICULAR SPIRE',
    timer: 540,
    nodeDrain: HOST.heartNodeDrain,
    baseDrain: HOST.heartBaseDrain,
    roster: ['spore', 'crawler', 'turret', 'brute', 'wall'],
    palette: {
      tissue: 0x8e2f35,
      tissueDeep: 0x3c0c12,
      membrane: 0xd98a6c,
      glow: 0xffb65c,
      accent: 0xe8c27a,
      fog: 0x140507,
      sky: 0x310a0f,
      floor: 0x3a1015,
    },
    intro: 'It keeps its rhythm until one of you stops.',
    complete: 'The Warden is dead. The heart is still beating.',
    propStyle: 'cardiac',
    layoutStyle: 'spire',
    finale: true,
  },
  liver: {
    id: 'liver',
    index: 3,
    name: 'LIVER',
    subtitle: 'THE HEPATIC LABYRINTH',
    timer: 450,
    nodeDrain: HOST.nodeDrain,
    baseDrain: HOST.baseDrain,
    roster: ['crawler', 'spitter', 'brute', 'stalker', 'wall'],
    palette: {
      tissue: 0x9b5938,
      tissueDeep: 0x3c1b10,
      membrane: 0xe0a875,
      glow: 0xffc06a,
      accent: 0xb8d38a,
      fog: 0x160e07,
      sky: 0x2a180d,
      floor: 0x3f2618,
    },
    intro: 'The liver filters everything. Today it is filtering you.',
    complete: 'Hepatic flow restored. The infection moves deeper.',
    propStyle: 'hepatic',
    layoutStyle: 'branch',
  },
  kidney: {
    id: 'kidney',
    index: 4,
    name: 'KIDNEY',
    subtitle: 'THE NEPHRON FILTER',
    timer: 430,
    nodeDrain: HOST.nodeDrain * 1.08,
    baseDrain: HOST.baseDrain * 1.08,
    roster: ['spore', 'spitter', 'crawler', 'wall'],
    palette: {
      tissue: 0x7c3b4b,
      tissueDeep: 0x2d0d19,
      membrane: 0xd59b8d,
      glow: 0xe9b9a0,
      accent: 0x9dcfc2,
      fog: 0x11070b,
      sky: 0x240f16,
      floor: 0x33151f,
    },
    intro: 'Two million filters, all failing. Find the one that matters.',
    complete: 'Renal pressure stable. The route is open.',
    propStyle: 'renal',
    layoutStyle: 'ring',
  },
  brain: {
    id: 'brain',
    index: 5,
    name: 'CEREBRUM',
    subtitle: 'THE SYNAPTIC FOLD',
    timer: 460,
    nodeDrain: HOST.nodeDrain * 0.92,
    baseDrain: HOST.baseDrain * 0.92,
    roster: ['mite', 'crawler', 'turret', 'stalker', 'wall'],
    palette: {
      tissue: 0x8f6f78,
      tissueDeep: 0x2a1b2c,
      membrane: 0xd9b6b0,
      glow: 0xb7c9ff,
      accent: 0x8fd8ff,
      fog: 0x0c0b14,
      sky: 0x1a1828,
      floor: 0x272134,
    },
    intro: 'The patient is dreaming. Do not trust the room with no doors.',
    complete: 'Cortical activity steady. You leave the dream intact.',
    propStyle: 'neural',
    layoutStyle: 'spiral',
  },
  marrow: {
    id: 'marrow',
    index: 6,
    name: 'FEMORAL MARROW',
    subtitle: 'THE BONE WELL',
    timer: 440,
    nodeDrain: HOST.nodeDrain * 1.15,
    baseDrain: HOST.baseDrain * 1.15,
    roster: ['spitter', 'goliath', 'stalker', 'wall'],
    palette: {
      tissue: 0x9b8367,
      tissueDeep: 0x342519,
      membrane: 0xe8d4b1,
      glow: 0xffd28e,
      accent: 0xd9a06a,
      fog: 0x120f0a,
      sky: 0x2a2419,
      floor: 0x3d3122,
    },
    intro: 'Bone remembers every impact. The infection is writing in it.',
    complete: 'Marrow cleared. The scaffold holds.',
    propStyle: 'marrow',
    layoutStyle: 'ladder',
  },
  intestine: {
    id: 'intestine',
    index: 7,
    name: 'SMALL INTESTINE',
    subtitle: 'THE ACID COILS',
    timer: 470,
    nodeDrain: HOST.nodeDrain * 1.05,
    baseDrain: HOST.baseDrain * 1.05,
    roster: ['spore', 'mite', 'crawler', 'brute', 'wall'],
    palette: {
      tissue: 0xa15f51,
      tissueDeep: 0x391410,
      membrane: 0xe7a789,
      glow: 0xffbc75,
      accent: 0xcfd77d,
      fog: 0x120b08,
      sky: 0x28130c,
      floor: 0x3c2015,
    },
    intro: 'Every fold is a corridor. Every corridor is digesting.',
    complete: 'The coils are clear. Keep moving before the acid returns.',
    propStyle: 'intestinal',
    layoutStyle: 'coil',
  },
  lymph: {
    id: 'lymph',
    index: 8,
    name: 'LYMPHATIC CHAIN',
    subtitle: 'THE FILTER GARDEN',
    timer: 455,
    nodeDrain: HOST.nodeDrain * 0.95,
    baseDrain: HOST.baseDrain * 0.95,
    roster: ['mite', 'turret', 'stalker', 'spitter', 'wall'],
    palette: {
      tissue: 0x71815c,
      tissueDeep: 0x1e2b1a,
      membrane: 0xd7d5a4,
      glow: 0xe9edb0,
      accent: 0x9dd7b0,
      fog: 0x0b1109,
      sky: 0x171f14,
      floor: 0x283322,
    },
    intro: 'The immune system built a garden. It is growing something else now.',
    complete: 'Filtration restored. The chain is quiet.',
    propStyle: 'lymphatic',
    layoutStyle: 'branch',
  },
};

// One signature environmental hazard per biome. These are not enemies or
// weapons; they are the organ doing its job badly. They damage the surgeon
// suit. Only the acid and the cardiac pulse also touch Host Integrity, and the
// amount is declared here so the player can read the risk.
export const ORGAN_HAZARDS = {
  lung: {
    id: 'alveolar-collapse',
    label: 'ALVEOLAR COLLAPSE',
    color: 0xe8b06a,
    interval: 13,
    radius: 3.5,
    delay: 1.35,
    damage: 24,
    host: 0,
  },
  heart: {
    id: 'ventricular-pulse',
    label: 'VENTRICULAR PULSE',
    color: 0xff6a4a,
    interval: 11,
    radius: 4.2,
    delay: 1.15,
    damage: 28,
    host: 1.5,
  },
  liver: {
    id: 'bile-surge',
    label: 'BILE SURGE',
    color: 0xd8b25a,
    interval: 12,
    radius: 3.1,
    delay: 1.2,
    damage: 26,
    host: 0,
  },
  kidney: {
    id: 'pressure-jet',
    label: 'PRESSURE JET',
    color: 0x9dcfc2,
    interval: 10,
    radius: 2.8,
    delay: 0.95,
    damage: 22,
    host: 0,
  },
  brain: {
    id: 'dream-lurch',
    label: 'DREAM LURCH',
    color: 0x8fd8ff,
    interval: 14,
    radius: 4.0,
    delay: 1.6,
    damage: 20,
    host: 0,
  },
  marrow: {
    id: 'trabecular-snap',
    label: 'TRABECULAR SNAP',
    color: 0xffd28e,
    interval: 12,
    radius: 3.2,
    delay: 1.1,
    damage: 30,
    host: 0,
  },
  intestine: {
    id: 'acid-reflux',
    label: 'ACID REFLUX',
    color: 0xcfd77d,
    interval: 9,
    radius: 3.6,
    delay: 1.1,
    damage: 20,
    host: 2,
  },
  lymph: {
    id: 'follicle-burst',
    label: 'FOLLICLE BURST',
    color: 0xd7d5a4,
    interval: 12,
    radius: 3.0,
    delay: 1.45,
    damage: 18,
    host: 0,
  },
};

export const LORE = [
  {
    id: 'l1',
    title: 'MEMORY // DOCK 9',
    text: '“They said the trial was closed. They said the compound was inert. I signed the manifest anyway. I signed it for my sister.”',
    organ: 'lung',
  },
  {
    id: 'l2',
    title: 'NEXUS INTERNAL // 2049',
    text: 'CHORUS-7 was not a failure. It was a prototype for a patient who could be repaired from the inside. The patient was the program.',
    organ: 'lung',
  },
  {
    id: 'l3',
    title: 'SURGICAL LOG // DRONE 04',
    text: 'Procedure: aortic root repair. Patient: VOSS, M. Outcome: aborted. Surgeon: KADE, M. Note: “The tissue kept rebuilding itself around my hands.”',
    organ: 'heart',
  },
  {
    id: 'l4',
    title: 'MEMORY // ELIAS',
    text: '“If you find my sister in here, tell her I did not know what I was carrying. Tell her the infection was not the only thing they put inside me.”',
    organ: 'heart',
  },
  { id: 'l5', title: 'NEXUS // INTake 19', text: 'The liver was the first organ to accept the compound without rejection. The team called that a success. The patient called it a taste he could not wash out.', organ: 'liver' },
  { id: 'l6', title: 'PHARMACY // LOT 77', text: 'A bile-reactive marker was added to the trial dose. It was never meant to reach a patient. It is in every sample we have recovered.', organ: 'liver' },
  { id: 'l7', title: 'NEPHROLOGY // 04:40', text: 'Both filters are producing the same protein. Neither kidney belongs to the patient on the chart.', organ: 'kidney' },
  { id: 'l8', title: 'SURGEON NOTE // KADE', text: '“I counted the nephrons twice. There are more of them than there were yesterday.”', organ: 'kidney' },
  { id: 'l9', title: 'COGNITIVE LOG // DREAM 3', text: 'The patient described a white room with no doors and a surgeon who would not stop apologizing. I have never apologized to a patient. I am not sure that matters.', organ: 'brain' },
  { id: 'l10', title: 'NEXUS // NEURAL TRIAL', text: 'The compound was designed to repair nerve tissue. It learned the shape of the patient first. That was not in the protocol.', organ: 'brain' },
  { id: 'l11', title: 'ORTHOPEDICS // SAMPLE 12', text: 'The marrow is producing a cell that does not exist in any human atlas. It is being logged as a clerical error.', organ: 'marrow' },
  { id: 'l12', title: 'MEMORY // THE DONOR', text: '“They said the graft came from a volunteer. There was no volunteer. There was a purchase order.”', organ: 'marrow' },
  { id: 'l13', title: 'GASTRO // UNLISTED', text: 'The acid is not corrosive to the infection. It is corrosive to the chart. Someone has been editing the results from inside the patient.', organ: 'intestine' },
  { id: 'l14', title: 'NUTRITION // 2049', text: 'The trial subject was fed through a line for eleven months. The line is still here. It is still warm.', organ: 'intestine' },
  { id: 'l15', title: 'IMMUNOLOGY // GARDEN', text: 'The lymph nodes have organized themselves into something with a pulse. It is not hostile. It is waiting to be asked a question.', organ: 'lymph' },
  { id: 'l16', title: 'NEXUS // CHORUS-7', text: 'The compound does not attack the host. It replaces the parts that are afraid of dying. The program calls that a cure.', organ: 'lymph' },
];

export const GRADES = [
  { grade: 'S', min: 88, title: 'EXEMPLARY', note: 'The host will never know how close it came.' },
  { grade: 'A', min: 72, title: 'CLEAN', note: 'A good surgery. A few bruises the charts will explain.' },
  { grade: 'B', min: 54, title: 'SURVIVABLE', note: 'The patient lives. The review board will have questions.' },
  { grade: 'C', min: 30, title: 'COMPROMISED', note: 'You kept a body alive. Some of it will stay broken.' },
  { grade: 'D', min: 0, title: 'CATASTROPHIC', note: 'The case is closed. The patient is not.' },
];

// A run needs a moment-to-moment chase, not only a survival timer. Chained
// kills inside the window multiply points and feed the final grade; taking a
// hit breaks the chain immediately. All numbers live here.
export const SCORING = {
  chainWindow: 4.5,
  chainStep: 0.1,
  chainCap: 20,
  weakMultiplier: 1.5,
  eliteMultiplier: 2,
  cleanNode: 250,
  nodeDestroyed: 80,
  bossNode: 1000,
  bossKill: 5000,
  gradeChainStep: 0.35,
  gradeChainCap: 7,
  milestones: [5, 10, 15, 20],
};

// Case medals are the visible proof of a clean operation. They persist in the
// ward record so a player can chase a complete set across procedural cases.
export const MEDALS = [
  { id: 'host', name: 'HOST INTACT', desc: 'Close above 80 Host', stat: 'host', min: 80 },
  { id: 'ghost', name: 'NO DEBRIS', desc: 'Zero collateral', stat: 'collateral', max: 0 },
  { id: 'clean', name: 'CLEAN HANDS', desc: '75% nodes cauterized', stat: 'cleanRatio', min: 0.75 },
  { id: 'chain', name: 'CHAIN SURGEON', desc: 'Reach a 10-link chain', stat: 'bestChain', min: 10 },
  { id: 'par', name: 'UNDER PAR', desc: 'Beat the case par time', stat: 'underPar', min: 1 },
];

// Long-term ward goals. They pay once, persist across runs, and give the case
// board a reason to stay open after the research tree is finished.
export const DIRECTIVES = [
  { id: 'kills', name: 'BODY COUNT', stat: 'kills', target: 100, reward: 4, desc: 'Neutralize 100 infections.' },
  { id: 'clean', name: 'CLEAN HANDS', stat: 'clean', target: 30, reward: 4, desc: 'Clean-cauterize 30 nodes.' },
  { id: 'elites', name: 'STRAIN HUNTER', stat: 'elites', target: 10, reward: 5, desc: 'Kill 10 elite pathogens.' },
  { id: 'cases', name: 'STAFF SURGEON', stat: 'cases', target: 5, reward: 6, desc: 'Close 5 cases.' },
  { id: 'organs', name: 'LONG SHIFT', stat: 'organs', target: 20, reward: 6, desc: 'Clear 20 organs.' },
  { id: 'perfect', name: 'STEADY HANDS', stat: 'perfect', target: 3, reward: 8, desc: 'Close 3 cases above 85 Host.' },
  { id: 'adaptations', name: 'BUILD A BETTER SURGEON', stat: 'adaptations', target: 12, reward: 5, desc: 'Install 12 adaptations.' },
  { id: 'bosses', name: 'BIO-SIGNATURE HUNTER', stat: 'bosses', target: 4, reward: 7, desc: 'Break 4 bio-signatures.' },
];

export const MUTATION_PICK = 'One mutation per case. Shown before injection.';

// ------------------------------------------------------------------ patients
// Procedural cases: the chart, the person and the condition change every run.
export const CASE_CONDITIONS = [
  {
    id: 'chorus7',
    label: 'Engineered sepsis · Chorus-7',
    mutation: 'hemorrhage',
    summary: 'A second circulatory system is growing inside them. It is also the only thing keeping them alive.',
    note: 'The infection has a route and a rhythm. Follow it.',
  },
  {
    id: 'calcific',
    label: 'Accelerated calcification',
    mutation: 'brittle',
    summary: 'Calcium is replacing soft tissue. Every heartbeat makes the patient harder to cut.',
    note: 'The chart says stone. The scanner says tissue. Trust the scanner.',
  },
  {
    id: 'hyperplastic',
    label: 'Runaway hyperplasia',
    mutation: 'hyperplasia',
    summary: 'The infection is growing faster than the chart can track. It has started building its own rooms.',
    note: 'If the tissue is new, it is not the patient.',
  },
  {
    id: 'febrile',
    label: 'Necrotizing fever',
    mutation: 'fever',
    summary: 'A fever is cooking the host from the inside. The infection likes the heat.',
    note: 'Cool the room before you cool the patient.',
  },
  {
    id: 'fibrous',
    label: 'Fibrous replacement',
    mutation: 'calcific',
    summary: 'Scar tissue is replacing the organ one layer at a time. The infection hides in the seams.',
    note: 'Cut the seam, not the organ.',
  },
  {
    id: 'septic',
    label: 'Septic cascade',
    mutation: 'acidosis',
    summary: 'The immune response has become the disease. Every clean cut triggers another wave.',
    note: 'Speed is a scalpel. Use it once.',
  },
  {
    id: 'necrotic',
    label: 'Necrotizing fasciitis',
    mutation: 'swarm',
    summary: 'Dead tissue is spreading along the nerve sheath. It is bringing friends.',
    note: 'The dark tissue is already lost. Do not spend the host on it.',
  },
  {
    id: 'fibrillating',
    label: 'Ventricular fibrillation',
    mutation: 'fibrillation',
    summary: 'The heart is keeping time with something that is not the patient.',
    note: 'Find the rhythm before you find the source.',
  },
];

const FIRST_NAMES_MALE = [
  'ELIAS', 'NOAH', 'DOV', 'TOBIAS', 'KAI', 'AMOS', 'SILAS', 'MILO', 'JONAS', 'RUNE',
  'OMAR', 'LEO', 'IVAN', 'SETH', 'HUGO',
];
const FIRST_NAMES_FEMALE = [
  'MARA', 'IRIS', 'SANA', 'RHEA', 'LENA', 'NIA', 'YUNA', 'ADA', 'PIA', 'ZARA',
  'TESS', 'MAYA', 'NORA', 'AISHA', 'VERA',
];
const LAST_NAMES = [
  'VOSS', 'OKONKWO', 'MERCER', 'HALVORSEN', 'TAN', 'REYES', 'KOVAC', 'SUZUKI',
  'ELDER', 'NADIA', 'BERG', 'QUINN', 'SATO', 'MORROW', 'ADEYEMI', 'KESTREL',
  'LIND', 'ORLOV', 'PARK', 'VEGA', 'DRAKE', 'AMARI', 'SOL', 'WREN', 'CHEN',
];
const OCCUPATIONS = [
  'Orbital dockworker', 'Night-shift paramedic', 'Deep-sea welder', 'Hospital archivist',
  'Cargo pilot', 'Union negotiator', 'Pharmacy courier', 'Sewer engineer',
  'Research technician', 'Long-haul driver', 'Surgical resident', 'Mine surveyor',
  'Broadcast editor', 'Logistics dispatcher', 'Lab animal handler', 'Retired teacher',
  'Ferry captain', 'Server room technician', 'Transit inspector', 'Independent journalist',
];
const BLOOD_TYPES = ['O−', 'O+', 'A−', 'A+', 'B−', 'B+', 'AB−', 'AB+'];
const CASE_NOTES = [
  'Patient is conscious during injection. They have asked whether this will hurt someone else.',
  'Patient has no next of kin on file. The form was signed by a program officer.',
  'Patient requested that the chart not be shown to their employer.',
  'Patient has been inside the program before. The file says otherwise.',
  'Patient is awake. They are counting the seconds between your footsteps.',
  'Patient signed the consent form before the diagnosis was written.',
];

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

export function generatePatient(rng, caseIndex = 1) {
  const sex = rng.pick(['M', 'F']);
  const first = rng.pick(sex === 'M' ? FIRST_NAMES_MALE : FIRST_NAMES_FEMALE);
  const last = rng.pick(LAST_NAMES);
  const pronoun = sex === 'M'
    ? { subject: 'he', object: 'him', possessive: 'his' }
    : { subject: 'she', object: 'her', possessive: 'her' };
  const condition = rng.pick(CASE_CONDITIONS);
  const age = rng.int(19, 74);
  const caseNo = String(caseIndex).padStart(3, '0');
  const mrn = `${rng.int(1000, 9999)}-${String(caseIndex).padStart(2, '0')}`;
  const statusTime = `${String(rng.int(1, 6)).padStart(2, '0')}:${String(rng.int(4, 58)).padStart(2, '0')}`;
  const heartRate = rng.int(104, 158);
  const systolic = rng.int(62, 94);
  const diastolic = rng.int(28, 56);
  const oxygen = rng.int(77, 93);
  const temperature = (37.2 + rng.float(0, 3.4)).toFixed(1);
  const weight = rng.int(51, 106);
  const note = rng.chance(0.5) ? condition.note : rng.pick(CASE_NOTES);
  const personalize = (text) =>
    text
      .replace(/\bthem\b/g, pronoun.object)
      .replace(/\btheir\b/g, pronoun.possessive)
      .replace(/\bthey\b/g, pronoun.subject);

  return {
    id: `${first.toLowerCase()}-${last.toLowerCase()}-${caseNo}`,
    name: `${first} ${last}`,
    first,
    last,
    age,
    sex,
    pronoun,
    caseNo,
    mrn,
    blood: rng.pick(BLOOD_TYPES),
    weight: `${weight} kg`,
    occupation: rng.pick(OCCUPATIONS),
    condition: condition.label,
    conditionId: condition.id,
    mutationId: condition.mutation,
    summary: personalize(condition.summary),
    note: personalize(note),
    status: `CRITICAL / ${statusTime} TO FLATLINE`,
    vitals: [
      ['HR', String(heartRate), 'BPM'],
      ['BP', `${systolic}/${diastolic}`, 'MMHG'],
      ['SPO₂', String(oxygen), '%'],
      ['TEMP', temperature, '°C'],
    ],
  };
}
