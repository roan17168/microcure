#!/usr/bin/env node
/**
 * MicroCure static + build gate.
 *
 * This is intentionally dependency-free and readable by the next agent. It
 * checks the design brief, the content graph, the UI action graph, runtime
 * safety rules, and the production build. Browser verification is still a
 * separate, human-observable gate: see design/AGENT-PIPELINE.md.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import * as CONTENT from '../src/content.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const exists = (p) => fs.existsSync(path.join(ROOT, p));
const fail = [];
const pass = [];
const warn = [];

function check(name, fn) {
  try {
    const result = fn();
    if (result === false) throw new Error('returned false');
    if (typeof result === 'string') pass.push(`${name}: ${result}`);
    else pass.push(name);
  } catch (error) {
    fail.push(`${name}: ${error.message}`);
  }
}

function must(condition, message) {
  if (!condition) throw new Error(message);
}

const REQUIRED_FILES = [
  'index.html',
  'package.json',
  'src/main.js',
  'src/content.js',
  'src/level.js',
  'src/entities.js',
  'src/ui.js',
  'src/audio.js',
  'src/fx.js',
  'src/utils.js',
  'src/styles.css',
  'scripts/audit.mjs',
  'design/DESIGN-LOCK.md',
  'design/AGENT-PIPELINE.md',
  'microcure-design-lock.md',
  'AGENTS.md',
];

check('repository files', () => {
  const missing = REQUIRED_FILES.filter((f) => !exists(f));
  must(missing.length === 0, `missing ${missing.join(', ')}`);
  return `${REQUIRED_FILES.length} files`;
});

check('82-answer design brief', () => {
  const brief = read('microcure-design-lock.md');
  const answers = (brief.match(/^- \*\*/gm) || []).length;
  const sections = (brief.match(/^### /gm) || []).length;
  must(answers === 89, `expected 89 answer/fingerprint bullets, found ${answers}`);
  must(sections === 10, `expected 10 decision sections, found ${sections}`);
  for (const phrase of ['Host Integrity', 'First-person 3D', 'Metroidvania', 'Stylized 3D', 'Keyboard and mouse']) {
    must(brief.includes(phrase), `brief lost "${phrase}"`);
  }
  return '82 answers + 7 fingerprint axes';
});

check('canonical design lock', () => {
  const lock = read('design/DESIGN-LOCK.md');
  for (const phrase of [
    'Host Integrity',
    'procedural metroidvania',
    'One patient. Two organs. One boss.',
    'Three.js + Vite',
    'Death is recoverable',
    'Accessibility',
    'Definition of done',
  ]) {
    must(lock.includes(phrase), `lock lost "${phrase}"`);
  }
  must(/amendment/i.test(lock), 'no explicit amendment log for UI realism pass');
  return 'locked systems and amendment log present';
});

function uniqueIds(list, label) {
  const ids = list.map((item) => item.id);
  must(ids.every(Boolean), `${label} has a missing id`);
  must(new Set(ids).size === ids.length, `${label} has duplicate ids`);
  return ids;
}

check('content graph', () => {
  const organIds = Object.keys(CONTENT.ORGANS);
  must(organIds.length >= 8, `release needs eight organs, found ${organIds.length}`);
  for (const id of organIds) {
    const organ = CONTENT.ORGANS[id];
    for (const key of ['name', 'subtitle', 'palette', 'roster', 'intro', 'complete']) must(organ[key], `organ ${id}.${key} missing`);
    must(organ.timer > 0, `organ ${id} has no timer`);
    must(Array.isArray(organ.roster) && organ.roster.length > 0, `organ ${id} has no roster`);
    for (const enemy of organ.roster) must(CONTENT.ENEMIES[enemy], `organ ${id} references unknown enemy ${enemy}`);
    for (const tone of ['tissue', 'tissueDeep', 'membrane', 'glow', 'accent', 'fog', 'floor']) {
      must(typeof organ.palette[tone] === 'number', `organ ${id} palette missing ${tone}`);
    }
  }
  const enemyIds = uniqueIds(Object.values(CONTENT.ENEMIES), 'ENEMIES');
  for (const organ of Object.values(CONTENT.ORGANS)) {
    for (const id of organ.roster) must(enemyIds.includes(id), `roster reference ${id} escaped validation`);
  }
  must(CONTENT.DISCIPLINES.length >= 3, 'release needs three playable disciplines');
  uniqueIds(CONTENT.DISCIPLINES, 'DISCIPLINES');
  must(CONTENT.ADAPTATIONS.length >= 12, 'buildcraft needs at least twelve adaptations');
  uniqueIds(CONTENT.ADAPTATIONS, 'ADAPTATIONS');
  for (const adaptation of CONTENT.ADAPTATIONS) {
    must(adaptation.name && adaptation.branch && adaptation.desc, `adaptation ${adaptation.id} copy incomplete`);
    must(adaptation.effects && Object.keys(adaptation.effects).length > 0, `adaptation ${adaptation.id} has no effect`);
  }
  must(CONTENT.ROUTES.length >= 4, 'route choice needs at least four options');
  uniqueIds(CONTENT.ROUTES, 'ROUTES');
  uniqueIds(CONTENT.RESEARCH, 'RESEARCH');
  uniqueIds(CONTENT.MUTATIONS, 'MUTATIONS');
  must(CONTENT.PROTOCOLS.length >= 5, 'case protocols need at least five stipulations');
  uniqueIds(CONTENT.PROTOCOLS, 'PROTOCOLS');
  for (const protocol of CONTENT.PROTOCOLS) {
    must(protocol.name && protocol.code && protocol.tag && protocol.desc, `protocol ${protocol.id} copy incomplete`);
    must(protocol.host, `protocol ${protocol.id} does not state its Host Integrity interaction`);
    must(protocol.scoreMult > 1 && protocol.rp > 0, `protocol ${protocol.id} has no risk/reward`);
    const effects = ['collateral', 'timer', 'hostMax', 'stabilizers', 'extraEnemies', 'ammoMult', 'light'];
    must(effects.some((key) => protocol[key] !== undefined), `protocol ${protocol.id} has no mechanical effect`);
  }
  must(
    CONTENT.PROTOCOLS.filter((p) => p.onboarding !== false).length >= 3,
    'first case needs at least three onboarding-safe protocols'
  );
  uniqueIds(CONTENT.LORE, 'LORE');
  must(CONTENT.BOSS.phases.length === 3, 'the Warden must have three phases');
  must(CONTENT.BOSS.phaseAt.length === 2, 'boss phase thresholds incomplete');
  must(CONTENT.BOSS_VARIANTS.length >= 3, 'the heart needs at least three boss variants');
  uniqueIds(CONTENT.BOSS_VARIANTS, 'BOSS_VARIANTS');
  for (const boss of CONTENT.BOSS_VARIANTS) {
    must(boss.name && boss.intro && boss.designation, `boss ${boss.id} copy incomplete`);
    must(boss.hpMult > 0, `boss ${boss.id} hp multiplier missing`);
    must(boss.phaseNames?.length === 3, `boss ${boss.id} needs three phase names`);
    must(boss.mech?.nodes > 0 && boss.mech?.barrage > 0, `boss ${boss.id} has no mechanical identity`);
    must(Array.isArray(boss.mech.summonPool) && boss.mech.summonPool.length > 0, `boss ${boss.id} has no summon roster`);
    for (const id of boss.mech.summonPool) must(CONTENT.ENEMIES[id], `boss ${boss.id} summons unknown ${id}`);
  }
  must(CONTENT.ELITES.length >= 3, 'elite pathology pool needs at least three strains');
  uniqueIds(CONTENT.ELITES, 'ELITES');
  for (const elite of CONTENT.ELITES) {
    must(elite.name && elite.hp >= 1 && elite.damage >= 1 && elite.scale >= 1, `elite ${elite.id} incomplete`);
    must(elite.minTier >= 1, `elite ${elite.id} has no tier gate`);
  }
  must(CONTENT.RESEARCH.length >= 8, 'meta progression needs a deeper research tree');
  must(CONTENT.DIRECTIVES.length >= 8, 'ward directives need a long-term ladder');
  uniqueIds(CONTENT.DIRECTIVES, 'DIRECTIVES');
  for (const directive of CONTENT.DIRECTIVES) {
    must(directive.name && directive.desc && directive.stat, `directive ${directive.id} incomplete`);
    must(directive.target > 0 && directive.reward > 0, `directive ${directive.id} has no target or reward`);
    must(
      ['kills', 'clean', 'elites', 'cases', 'organs', 'perfect', 'adaptations', 'bosses'].includes(directive.stat),
      `directive ${directive.id} tracks unknown stat ${directive.stat}`
    );
  }
  for (const rate of CONTENT.BOSS.phaseAt) must(rate > 0 && rate < 1, 'boss phase threshold out of range');
  const loreOrgans = new Set(CONTENT.LORE.map((l) => l.organ));
  for (const organ of organIds) must(loreOrgans.has(organ), `no archive shard for ${organ}`);
  for (const organ of organIds) {
    const h = CONTENT.ORGAN_HAZARDS?.[organ];
    must(h, `no environmental hazard for ${organ}`);
    must(h.label && h.color > 0 && h.damage > 0 && h.interval > 0, `hazard ${organ} incomplete`);
    must(h.host >= 0, `hazard ${organ} must declare its Host Integrity interaction`);
  }
  for (const l of CONTENT.LORE) must(organIds.includes(l.organ), `lore ${l.id} points at an unknown organ`);
  const gr = CONTENT.GRADES.map((g) => g.grade);
  must(gr.includes('S') && gr.includes('D'), 'grade ladder incomplete');
  return `${organIds.length} organs, ${enemyIds.length} enemies + ${CONTENT.ELITES.length} elites, ${CONTENT.LORE.length} archive shards, ${CONTENT.BOSS_VARIANTS.length} boss variants, ${Object.keys(CONTENT.ORGAN_HAZARDS).length} hazards`;
});

check('combat pressure contract', () => {
  const entities = read('src/entities.js');
  const level = read('src/level.js');
  const main = read('src/main.js');
  const combat = CONTENT.COMBAT;
  const focus = CONTENT.FOCUS;
  must(combat, 'COMBAT tuning block missing');
  must(focus, 'FOCUS tuning block missing');
  must(focus.max > 0 && focus.duration > 0 && focus.enemyTime > 0 && focus.enemyTime < 1, 'focus timing data incomplete');
  must(focus.hitGain > 0 && focus.cleanNodeGain > 0, 'focus gains are not wired');
  must(main.includes('activateFocus(') && main.includes('addFocus('), 'focus actions are not wired');
  must(main.includes('FOCUS.enemyTime'), 'focus does not dilate enemy simulation');
  must(main.includes('this.focusTimer = FOCUS.duration'), 'focus activation does not start a timer');
  must(entities.includes('game.addFocus(FOCUS.hitGain)'), 'weak-point hits do not charge focus');
  must(read('src/ui.js').includes('focus-bar') && read('index.html').includes('focus-bar'), 'focus meter has no HUD');
  must(combat.bodyDamage > 0 && combat.bodyDamage < 1, 'body shots must be weaker than weak-point hits');
  must(combat.weakpointDamage >= 1.5, 'weak-point multiplier is not meaningful');
  must(combat.broodCap >= 20, 'brood cap is too low for late-run pressure');
  must(combat.nodeBroodInterval > 0, 'node brood timer missing');
  for (const [room, wave] of Object.entries(combat.broodWave || {})) {
    must(Array.isArray(wave), `brood wave for ${room} is not a list`);
    for (const id of wave) must(CONTENT.ENEMIES[id], `brood wave ${room} references unknown enemy ${id}`);
  }
  for (const [id, enemy] of Object.entries(CONTENT.ENEMIES)) {
    const w = enemy.weak;
    must(w, `${id} has no weak-point anatomy`);
    must(typeof w.y === 'number' && typeof w.z === 'number' && w.r > 0, `${id} weak point has no volume`);
    must(w.mult >= 1.5 && w.label, `${id} weak point has no payoff`);
  }
  must(entities.includes('weakSphere()'), 'weak-point hit resolution missing');
  must(entities.includes('updateDeath(dt)'), 'corpse staging missing');
  must(entities.includes('wallArmed'), 'ceiling hunter has no ambush state');
  must(entities.includes('this.iframes = Math.max(0, this.iframes - dt)'), 'player invulnerability never expires');
  must(level.includes('ceilingAt(x, z)'), 'ceiling anchor missing from level');
  must(level.includes('broodNests'), 'brood nests are not built into chambers');
  must(main.includes('updateThreat(dt)'), 'threat director missing');
  must(main.includes('COMBAT.broodWave'), 'room-entry brood waves are not wired');
  return `${Object.keys(CONTENT.ENEMIES).length} weak points, ceiling ambushers, brood director, Vital Focus and decaying i-frames`;
});

check('procedural case routing', () => {
  const main = read('src/main.js');
  const level = read('src/level.js');
  const entities = read('src/entities.js');
  must(main.includes('generatePatient('), 'patients are not generated');
  must(main.includes('rollOrgans('), 'organ routes are not generated');
  must(main.includes('organCursor'), 'route cursor missing from run state');
  must(main.includes('caseTier'), 'endless case tier missing');
  must(level.includes('generateLayout(organId, seed, run)'), 'procedural layout is bypassed');
  must(level.includes('layoutShift(points'), 'procedural room jitter missing');
  must(level.includes('nodeRooms') && level.includes("r.type !== 'exit'"), 'nodes can spawn behind a mandatory final gate');
  must(main.includes('bossDef'), 'boss variant is not selected per case');
  must(main.includes('ORGAN_HAZARDS'), 'organ hazards are not wired to runtime');
  must(entities.includes('supportHand'), 'viewmodel has no support hand');
  must(entities.includes('buildHand('), 'viewmodel has no articulated hand builder');
  must(main.includes('rollAdaptationOffers('), 'adaptation offers are not seeded per transition');
  must(main.includes('this.run.adaptations'), 'installed adaptations are not tracked');
  must(main.includes('enemySlowMult'), 'adaptation enemy pacing is not wired');
  must(entities.includes('ELITES'), 'elite pathology is not wired to enemies');
  must(level.includes('ELITE_TUNING') && level.includes('spawn.elite'), 'elite spawning is bypassed');
  must(entities.includes('this.mech') && entities.includes('mech.barrage'), 'boss variant mechanics are not wired');
  return 'patients, routes, adaptation offers, elites, boss mechanics and two-handed viewmodel are wired';
});

check('braced aim contract', () => {
  const main = read('src/main.js');
  const entities = read('src/entities.js');
  const ui = read('src/ui.js');
  const weapon = CONTENT.WEAPON;
  must(weapon.aimSpread > 0 && weapon.aimSpread < 1, 'braced aim has no tighter cone');
  must(weapon.aimSpeed > 0 && weapon.aimSpeed < 1, 'braced aim has no mobility cost');
  must(weapon.aimZoom > 0, 'braced aim has no sight picture');
  must(main.includes('else this.aim = true'), 'right mouse does not enter braced aim');
  must(main.includes('if (e.button === 2) this.aim = false'), 'braced aim never releases');
  must(entities.includes('this.aimBlend') && entities.includes('WEAPON.aimSpread'), 'aim does not drive spread and viewmodel');
  must(ui.includes("classList.toggle('aiming'"), 'reticle has no braced state');
  must(read('src/styles.css').includes('#hud.aiming #crosshair'), 'braced reticle has no styling');
  return 'right-mouse brace: tighter cone, slower strafe, centred viewmodel and reticle';
});

check('matched reload contract', () => {
  const player = read('src/entities.js');
  const ui = read('src/ui.js');
  const audio = read('src/audio.js');
  const weapon = CONTENT.WEAPON;
  const timing = weapon.activeReload;
  must(timing && timing.start > 0 && timing.end > timing.start && timing.end < 1, 'matched reload window is invalid');
  must(timing.snap > 0 && timing.snap < 0.3, 'matched reload has no snap');
  must(timing.penalty > 0, 'seized reload has no penalty');
  must(player.includes('tryReload()') && player.includes('this.reloadMatched'), 'reload timing is not wired');
  must(player.includes('this.reloadTimer += timing.penalty'), 'seized reload does not cost time');
  must(audio.includes('reloadMatched()') && audio.includes('reloadJam()'), 'matched reload has no audio feedback');
  must(player.includes('reloadCues') && audio.includes('magOut()') && audio.includes('magIn()') && audio.includes('boltCycle()'), 'reload choreography has no magazine or bolt audio cues');
  must(read('index.html').includes('id="reload-window"'), 'HUD has no reload timing band');
  must(ui.includes("classList.toggle('window'") && ui.includes('PRESS R // MATCH'), 'reload timing has no HUD feedback');
  must(read('src/styles.css').includes('.reload-line.window u'), 'reload timing band has no styling');
  return 'one-press match window, snap, seize penalty and HUD band wired';
});

check('gore, animation and weapon-feedback contract', () => {
  const fx = read('src/fx.js');
  const entities = read('src/entities.js');
  const main = read('src/main.js');
  const ui = read('src/ui.js');
  const html = read('index.html');
  const styles = read('src/styles.css');
  must(fx.includes('bloodMist('), 'blood has no aerosol mist layer');
  must(fx.includes('wallSplat(') && fx.includes('normal = null'), 'blood decals cannot attach to wall tissue');
  must(main.includes('this.fx.wallSplat(end'), 'missed shots do not mark the host wall');
  must(entities.includes('impactDir = null') && entities.includes('impactDir.clone()'), 'enemy blood is not directed by the shot');
  must(entities.includes('addWound()') && entities.includes('this.woundMesh'), 'enemies have no visible wound state');
  must(entities.includes('leg.root.rotation.y') && entities.includes('curl = 0'), 'enemy gait or death curl is not animated');
  must(entities.includes('mottleGeometry('), 'enemy skin has no vertex-level mottling');
  must(entities.includes('makeFlashTexture(') && entities.includes('muzzleSprite'), 'rifle has no muzzle flash sprite');
  must(entities.includes('const runBlend') && entities.includes('this.vmBase.z + this.vmRecoil'), 'weapon has no sprint pose');
  must(entities.includes('const restZ') && entities.includes('magZ = 0.055'), 'reload hand does not travel to the magazine well');
  must(entities.includes('this.equip') && entities.includes('this.workBlend'), 'weapon has no equip or surgical-work pose');
  must(entities.includes('roughnessMap: makeWearTexture') && entities.includes('makeWearTexture('), 'rifle materials have no generated wear');
  must(entities.includes('this.deathRoll = side >= 0') && entities.includes('this.deathPitch'), 'deaths do not fall away from the shot');
  must(entities.includes('landSquash') && entities.includes('enemyLand()'), 'leaps have no landing weight');
  must(entities.includes('animateHead(') && entities.includes('addKeep(this.head)'), 'creature heads do not hunt or twitch independently');
  must(html.includes('id="gore-flash"') && ui.includes('goreFlash('), 'close kills have no visor gore wash');
  must(styles.includes('#gore-flash::before'), 'visor gore has no styling');
  return 'directed spray, wall decals, wounds, gait, muzzle flash, sprint pose and visor gore wired';
});

check('case protocol contract', () => {
  const main = read('src/main.js');
  const level = read('src/level.js');
  const ui = read('src/ui.js');
  must(main.includes('preview.protocol'), 'case preview does not roll a protocol');
  must(main.includes('const protocolTime = this.run.protocol?.timer'), 'protocol timer is not applied per organ');
  must(main.includes('this.run.scoreMult'), 'protocol score multiplier is not wired');
  must(main.includes('protocolId') && main.includes('scoreMult: this.run.scoreMult'), 'protocol is not checkpointed');
  must(main.includes('protocolRp'), 'protocol research payout is not wired');
  must(level.includes('this.run.protocol?.extraEnemies'), 'protocol enemy pressure is not applied to spawns');
  must(ui.includes('protocol-slip'), 'case board does not show the protocol');
  must(ui.includes('doc-protocol') && ui.includes('debrief-protocol'), 'protocol is absent from chart or debrief');
  return `${CONTENT.PROTOCOLS.length} seeded protocols, host interaction stated, board-to-debrief wired`;
});

check('DOM reference contract', () => {
  const html = read('index.html');
  const ui = read('src/ui.js');
  const valid = new Set(
    [...html.matchAll(/id="([^"]+)"/g), ...ui.matchAll(/id="([^"]+)"/g)].map((m) => m[1])
  );
  const refs = new Set();
  for (const file of ['src/ui.js', 'src/main.js', 'src/entities.js', 'src/level.js']) {
    const code = read(file);
    for (const m of code.matchAll(/\$\('([^']+)'\)/g)) refs.add(m[1]);
    for (const m of code.matchAll(/getElementById\('([^']+)'\)/g)) refs.add(m[1]);
  }
  const missing = [...refs].filter((id) => !valid.has(id)).sort();
  must(missing.length === 0, `UI looks up missing ids: ${missing.join(', ')}`);
  return `${refs.size} runtime ids resolve against ${valid.size} static/template ids`;
});

check('audio API contract', () => {
  const audio = read('src/audio.js');
  const methods = new Set([...audio.matchAll(/^  ([A-Za-z0-9_]+)\(/gm)].map((m) => m[1]));
  const calls = new Map();
  for (const file of ['src/main.js', 'src/entities.js', 'src/ui.js', 'src/level.js']) {
    const code = read(file);
    for (const m of code.matchAll(/\b(?:this\.)?(?:game\.)?audio\.([A-Za-z0-9_]+)\(/g)) {
      if (!calls.has(m[1])) calls.set(m[1], new Set());
      calls.get(m[1]).add(file);
    }
  }
  const missing = [...calls.keys()].filter((name) => !methods.has(name)).sort();
  must(missing.length === 0, `runtime calls undefined audio cues: ${missing.join(', ')}`);
  return `${calls.size} cue call-sites resolve against ${methods.size} audio methods`;
});

check('save schema contract', () => {
  const main = read('src/main.js');
  must(main.includes('sanitiseSettings('), 'imported settings are not sanitised');
  must(main.includes('sanitiseCheckpoint(') && main.includes('return this.sanitiseCheckpoint(cp)'), 'resumed checkpoints bypass field normalisation');
  must(main.includes('bounded(cp.hostMax') && main.includes('bounded(cp.host,') && main.includes('bounded(raw.maxHp'), 'checkpoint numbers are not bounded');
  must(main.includes('integer(cp.injections') && main.includes('integer(cp.organCursor'), 'checkpoint counters are not integers');
  must(main.includes("['low', 'medium', 'high']"), 'quality tiers are not allowlisted');
  must(
    main.includes('clamp(raw.sensitivity') &&
      main.includes('clamp(raw.fov') &&
      main.includes('clamp(raw.volume') &&
      main.includes('clamp(raw.shake'),
    'settings ranges are not clamped'
  );
  must(
    main.includes('Number.isFinite(this.meta[key])') && main.includes("['rp', 'bestScore', 'bestChain', 'runs', 'completed']"),
    'meta counters are not normalised'
  );
  must(main.includes('!GRADES.some((g) => g.grade === this.meta.bestGrade)'), 'unknown grades survive import');
  must(
    main.includes('data.game !== \'microcure\'') &&
      main.includes('!Number.isFinite(cp.seed)') &&
      main.includes('!cp.organs.every((id) => !!ORGANS[id])'),
    'save or checkpoint schema checks missing'
  );
  return 'settings and checkpoint fields bounded; meta counters normalised';
});

check('UI action coverage', () => {
  const ui = read('src/ui.js');
  const actions = new Set([...ui.matchAll(/data-action="([a-zA-Z-]+)"/g)].map((m) => m[1]));
  const cases = new Set([...ui.matchAll(/case '([a-zA-Z-]+)':/g)].map((m) => m[1]));
  const missing = [...actions].filter((a) => !cases.has(a));
  must(missing.length === 0, `buttons with no handler: ${missing.join(', ')}`);
  return `${actions.size} UI actions wired`;
});

check('screen inventory', () => {
  const ui = read('src/ui.js');
  const screens = ['showTitle', 'showHub', 'showCaseFile', 'showLoadout', 'showInterOrgan', 'showDebrief', 'showFail', 'showPause', 'showSettings', 'showManual'];
  const missing = screens.filter((s) => !ui.includes(`${s}(`));
  must(missing.length === 0, `missing screens: ${missing.join(', ')}`);
  return `${screens.length} screens`;
});

check('terminal state integrity', () => {
  const main = read('src/main.js');
  must(main.includes("this.player.dead && this.state === 'playing'"), 'death guard can overwrite the terminal fail state');
  const failStart = main.indexOf('if (this.run.injections <= 0)');
  const failEnd = main.indexOf('this.ui.showFail', failStart);
  must(failStart !== -1 && failEnd > failStart, 'terminal injection path is missing');
  const failBranch = main.slice(failStart, failEnd);
  must(failBranch.includes("this.state = 'failed'"), 'zero injections do not enter the failed state');
  must(failBranch.includes('this.clearCheckpoint()'), 'terminal run leaves a resume checkpoint');
  must(main.includes("this.state = 'recovering'") && main.includes("this.state = 'playing'"), 're-injection recovery state is missing');
  return 'terminal fail is preserved; re-injection only leaves live play';
});

check('vascular crisis contract', () => {
  const crises = CONTENT.CRISES;
  must(crises, 'CRISES tuning block missing');
  for (const key of ['firstDelay', 'interval', 'jitter', 'maxPerOrgan', 'toolGrace', 'window', 'sealTime', 'shotPenalty', 'hostLoss', 'hostGain', 'score', 'focus', 'ruptureEnemies', 'interactRange']) {
    must(Number.isFinite(crises[key]), `CRISES.${key} is missing`);
  }
  must(crises.window > crises.sealTime && crises.hostLoss > crises.hostGain, 'crisis risk/reward is inverted');
  must(crises.shotPenalty > 0 && crises.shotPenalty < crises.window, 'a wound hit can erase or ignore the seal window');
  must(crises.maxPerOrgan >= 1 && crises.maxPerOrgan <= 3, 'crisis frequency is outside the authored range');
  const level = read('src/level.js');
  const entities = read('src/entities.js');
  const ui = read('src/ui.js');
  const html = read('index.html');
  must(level.includes('CRISES') && level.includes('updateCrisis(') && level.includes('spawnCrisis('), 'crisis scheduler is missing');
  must(level.includes('sealCrisis(') && level.includes('ruptureCrisis('), 'crisis resolution paths are missing');
  must(level.includes('damageCrisis(') && read('src/main.js').includes("kind: 'crisis'") && read('src/main.js').includes('CRISES.shotPenalty'), 'gunfire cannot tear the wound');
  must(level.includes("type: 'crisis'") && level.includes('SEAL ARTERIAL RUPTURE'), 'crisis has no interactable prompt');
  must(entities.includes("this.channel.type === 'crisis'") && entities.includes('this.interaction.time'), 'crisis cannot be channelled');
  must(ui.includes('setCrisisActive') && ui.includes('crisis-readout') && ui.includes('crisis-time'), 'crisis has no HUD readout');
  must(html.includes('id="crisis-readout"') && html.includes('id="crisis-fx"'), 'crisis markup or screen wash missing');
  must(/HOLD <b>E<\/b> TO SEAL/.test(html) && html.includes('FIRE TEARS THE WOUND'), 'crisis copy does not state its actual rule');
  must(read('src/audio.js').includes('crisisStart(') && read('src/audio.js').includes('crisisSealed(') && read('src/audio.js').includes('crisisTear('), 'crisis has no audio identity');
  return 'seeded emergency, shot consequence, cautery seal, Host consequence and readout wired';
});

check('HUD contract', () => {
  const html = read('index.html');
  for (const id of ['hud', 'host-bar', 'hp-bar', 'infection-bar', 'timer', 'objective', 'minimap', 'crosshair', 'boss-bar', 'interact-prompt']) {
    must(html.includes(`id="${id}"`), `HUD element #${id} missing`);
  }
  must(html.includes('Host Integrity') === false || html.includes('HOST INTEGRITY'), 'Host Integrity label missing');
  return 'host, surgeon, infection, timer, map, reticle and prompts present';
});

check('no external runtime resources', () => {
  const runtime = ['index.html', 'src/main.js', 'src/ui.js', 'src/level.js', 'src/entities.js', 'src/fx.js', 'src/audio.js', 'src/styles.css'];
  for (const file of runtime) {
    const text = read(file);
    if (/<script[^>]+src=["']https?:/i.test(text)) throw new Error(`${file} loads a remote script`);
    if (/<link[^>]+href=["']https?:/i.test(text)) throw new Error(`${file} loads a remote stylesheet`);
    if (/\bfetch\s*\(/.test(text)) throw new Error(`${file} contains a runtime fetch`);
    if (/new WebSocket/.test(text)) throw new Error(`${file} contains a runtime WebSocket`);
    if (/XMLHttpRequest/.test(text)) throw new Error(`${file} contains XMLHttpRequest`);
  }
  const html = read('index.html');
  must(!/src=["'](?:\.\/)?js\//.test(html), 'legacy js/ prototype is still loaded');
  must(!/href=["'](?:\.\/)?css\//.test(html), 'legacy css/ stylesheet is still loaded');
  return 'self-contained runtime; legacy prototype not loaded';
});

check('no debug leftovers', () => {
  for (const file of ['src/main.js', 'src/ui.js', 'src/level.js', 'src/entities.js', 'src/fx.js', 'src/audio.js']) {
    const text = read(file);
    for (const line of text.split('\n')) {
      if (/console\.(log|debug|info)\s*\(/.test(line)) throw new Error(`${file}: ${line.trim()}`);
      if (/\bdebugger\b/.test(line)) throw new Error(`${file}: debugger`);
    }
  }
  return 'no console.log/debugger in runtime';
});

check('fixed-step simulation', () => {
  const main = read('src/main.js');
  const utils = read('src/utils.js');
  must(/STEP\s*=\s*1\s*\/\s*60/.test(utils), 'STEP 1/60 missing from utils');
  must(/import[\s\S]*\bSTEP\b[\s\S]*from '\.\/utils\.js'/.test(main), 'main does not import the fixed step');
  must(main.includes('accumulator'), 'accumulator missing');
  must(main.includes('while (this.accumulator'), 'fixed-step loop missing');
  return '60 Hz accumulator';
});

check('seeded run data', () => {
  const main = read('src/main.js');
  must(/newSeed\s*\(/.test(main), 'newSeed missing');
  must(main.includes('new RNG(seed'), 'run RNG not derived from seed');
  must(!/MUTATIONS\[Math\.floor\(Math\.random/.test(main), 'case mutation is not seeded');
  return 'layout and mutation seeded';
});

check('Host Integrity contract', () => {
  const main = read('src/main.js');
  const content = read('src/content.js');
  must(content.includes('hostDrain'), 'host drain missing from data');
  must(main.includes('damageHost('), 'damageHost missing');
  must(main.includes('patientLost('), 'patient loss state missing');
  must(main.includes('healHost('), 'host healing missing');
  must(content.includes('shotNodeCost'), 'node shooting cost missing');
  return 'damage, drain, stabilizer and loss states present';
});

check('save and settings', () => {
  const main = read('src/main.js');
  const content = read('src/content.js');
  for (const fn of ['exportSave', 'importSave', 'resetProgress', 'saveCheckpoint', 'resumeCheckpoint']) {
    must(main.includes(`${fn}(`), `${fn} missing`);
  }
  must(/saveKey:\s*'microcure\.save\.v\d+'/.test(content), 'versioned save key missing');
  must(main.includes('GAME.saveKey'), 'save key is not read from content data');
  return 'local save, export/import, settings and checkpoint';
});

check('package scripts', () => {
  const pkg = JSON.parse(read('package.json'));
  for (const s of ['dev', 'build', 'preview', 'audit']) must(pkg.scripts?.[s], `npm run ${s} missing`);
  return Object.keys(pkg.scripts).join(', ');
});

check('data-driven content references', () => {
  const level = read('src/level.js');
  const main = read('src/main.js');
  // Layouts are generated from ORGANS data rather than one literal block per
  // organ, so the gate checks the generic lookup plus the style data each
  // procedural builder needs.
  must(level.includes('ORGANS[organId]'), 'level does not read the organ definition by id');
  must(level.includes('generateLayout(organId, seed, run)'), 'level bypasses seeded procedural layout generation');
  for (const organ of Object.values(CONTENT.ORGANS)) {
    must(organ.layoutStyle, `${organ.id} has no layoutStyle`);
    must(organ.propStyle || organ.id === 'lung', `${organ.id} has no propStyle`);
  }
  must(level.includes('this.def.roster'), 'enemy roster is not read from organ data');
  must(main.includes('spawnEnemyAt('), 'runtime cannot spawn roster enemies');
  must(main.includes('adaptation.effects'), 'adaptation effects are not applied');
  must(main.includes('route?.timer'), 'route timer is not applied');
  must(main.includes('route.host') && main.includes('route.ammo'), 'route host and ammo effects are not applied');
  must(level.includes('route?.addElite'), 'route elite is not applied');
  for (const id of ['adrenal', 'loader', 'trauma', 'pathology']) {
    must(main.includes(`unlocked('${id}')`), `research ${id} is not wired to the run`);
  }
  must(main.includes('DIRECTIVES') && main.includes('recordStat(') && main.includes('checkDirectives('), 'ward directives are not tracked');
  must(read('src/ui.js').includes('directive-grid'), 'ward directives have no case-board UI');
  return 'organs, enemy rosters, adaptations, routes, research and directives are wired to runtime';
});

check('safe scene teardown', () => {
  const level = read('src/level.js');
  must(level.includes('const lights = []'), 'level dispose does not collect lights before detaching');
  must(level.includes('for (const light of lights) light.removeFromParent()'), 'lights are not detached after traversal');
  must(!/if \(obj\.isLight\) obj\.removeFromParent\(\)/.test(level), 'dispose mutates the scene graph during traverse');
  return 'teardown detaches lights outside the traversal';
});

check('performance budget and batching', () => {
  const perf = CONTENT.PERFORMANCE;
  must(perf, 'PERFORMANCE tuning block missing');
  must(perf.targetFrameMs > 0 && perf.highFrameMs > perf.targetFrameMs, 'frame-time thresholds incomplete');
  must(perf.emergencyFrameMs >= perf.highFrameMs, 'emergency frame threshold missing');
  must(perf.minRenderScale > 0.4 && perf.maxRenderScale <= 1.5, 'render-scale bounds unsafe');
  must(perf.hudHz > 0 && perf.hudHz <= 30, 'HUD refresh rate is not throttled');
  must(perf.maxLights <= 12, 'light budget exceeds the forward-render budget');
  must(perf.maxDrawCalls <= 700, 'draw-call budget is too high for the target');

  const level = read('src/level.js');
  const entities = read('src/entities.js');
  const fx = read('src/fx.js');
  const main = read('src/main.js');
  must(level.includes("from 'three/addons/utils/BufferGeometryUtils.js'"), 'level does not merge static geometry');
  must(level.includes('batchStaticGeometry()'), 'static batching is not called');
  must(level.includes('this.retiredGeometries'), 'batched source geometry is not retired safely');
  must(level.includes('dynamicRoots'), 'static batching does not preserve animated props');
  must(entities.includes('mergeEnemyGeometry()'), 'enemy anatomy is not batched');
  must(entities.includes('buildInstancedLegs()'), 'enemy legs are not instanced');
  must(entities.includes('updateLegInstances()'), 'instanced legs are not animated');
  must(entities.includes('vertexColors'), 'batched anatomy has no per-part tint');
  must(fx.includes('tracerCapacity'), 'tracers are not pooled');
  must(!fx.includes('new THREE.BufferGeometry().setFromPoints'), 'tracers still allocate a geometry per shot');
  must(fx.includes('this.dormant'), 'particle fields never sleep');
  must(main.includes('updatePerformance('), 'adaptive performance governor missing');
  must(main.includes('PERFORMANCE.hudHz'), 'HUD throttle missing');
  must(main.includes('webglcontextlost') && main.includes('webglcontextrestored'), 'GPU context loss is not handled');
  must(main.includes('handleRenderError('), 'render failures are not contained');
  must(main.includes('refreshRenderSize('), 'render scale cannot be applied');
  must(main.includes('composer.setPixelRatio('), 'composer pixel ratio is not updated with render scale');
  must(main.includes('bloomAllowed'), 'emergency bloom fallback missing');
  must(main.includes('togglePerfHud(') && read('index.html').includes('perf-hud'), 'diagnostic overlay missing');
  must(main.includes('renderer.info'), 'runtime draw-call telemetry missing');
  must(main.includes('resizeBloom()') && perf.bloomScale < 1, 'bloom is not rendered below native resolution');
  must(perf.maxPixelRatioHigh <= 1.25, 'high-DPI cap is too expensive');
  must(main.includes('renderer.compile('), 'level shaders are not prewarmed under the injection screen');
  must(main.includes('menuHz') && main.includes('document.hidden'), 'menus or hidden tabs still render every frame');
  must(main.includes('updateCulling(') && main.includes('enemy.culled'), 'off-screen enemies are still simulated and drawn');
  must(level.includes('propCullDistance'), 'far organ props are never culled');
  must(entities.includes('mergeDirectMeshesByMaterial('), 'viewmodel parts are not batched');
  must(entities.includes('PROJECTILE_GEOMETRY') && entities.includes('PROJECTILE_MATERIALS'), 'projectile assets are not shared');
  must(main.includes('readCheckpoint()') && main.includes('handleRuntimeError('), 'save and simulation faults are not contained');
  return `${perf.maxDrawCalls} draw budget, ${perf.maxLights} light budget, ${Math.round(perf.bloomScale * 100)}% bloom buffers, adaptive ${Math.round(perf.minRenderScale * 100)}–${Math.round(perf.maxRenderScale * 100)}% render scale`;
});

check('chain scoring and medals', () => {
  const scoring = CONTENT.SCORING;
  const medals = CONTENT.MEDALS;
  must(scoring && scoring.chainWindow > 0 && scoring.chainStep > 0, 'SCORING tuning block missing');
  must(Array.isArray(medals) && medals.length >= 4, 'medal set is incomplete');
  must(new Set(medals.map((m) => m.id)).size === medals.length, 'duplicate medal ids');
  must(medals.every((m) => m.name && m.desc && m.stat), 'medal metadata incomplete');
  const main = read('src/main.js');
  const ui = read('src/ui.js');
  const html = read('index.html');
  for (const token of ['awardChain(', 'breakChain(', 'chainBest', 'score', 'medals']) {
    must(main.includes(token), `run scoring missing ${token}`);
  }
  must(main.includes('awardChain(SCORING.cleanNode'), 'clean cauteries do not pay score');
  must(main.includes('SCORING.bossNode'), 'boss anchors do not pay score');
  must(main.includes('this.breakChain()'), 'taking damage does not break the chain');
  must(ui.includes('chain-readout') && ui.includes('run-score'), 'HUD chain readout missing');
  must(html.includes('chain-readout') && html.includes('run-score'), 'markup chain readout missing');
  must(ui.includes('medal-strip') && ui.includes('FIELD MEDALS'), 'debrief has no medal strip');
  must(main.includes('score: this.run.score') && main.includes('chain: this.run.chain'), 'score is not checkpointed');
  return `${medals.length} medals, ${scoring.chainWindow}s chain window, ${scoring.milestones.join('/')} milestones`;
});

check('keyboard and screen access', () => {
  const main = read('src/main.js');
  const ui = read('src/ui.js');
  const html = read('index.html');
  const css = read('src/styles.css');
  const inputStart = main.indexOf('initInput()');
  const input = main.slice(inputStart, main.indexOf('requestLock()', inputStart));
  const stateGuard = input.indexOf("if (this.state !== 'playing') return;");
  const tabOwnership = input.indexOf("e.code === 'Tab'");
  must(inputStart >= 0 && stateGuard >= 0 && tabOwnership > stateGuard, 'Tab is still captured before the playing-state guard');
  must(html.includes('width=device-width, initial-scale=1.0') && !/user-scalable=no|maximum-scale=1/.test(html), 'viewport blocks page zoom');
  must(/<link rel="icon" href="data:image\/svg\+xml/.test(html), 'no inline favicon; production can request a missing icon');
  const hudTag = html.slice(html.indexOf('<div id="hud"'), html.indexOf('>', html.indexOf('<div id="hud"')) + 1);
  must(!hudTag.includes('aria-live'), 'the whole HUD is still a live region');
  const crisisTag = html.slice(html.indexOf('<div id="crisis-readout"'), html.indexOf('>', html.indexOf('<div id="crisis-readout"')) + 1);
  must(!crisisTag.includes('aria-live'), 'the crisis countdown is a live region');
  must(ui.includes("this.currentScreen === 'settings' && this.settingsBack") && ui.includes("this.currentScreen === 'manual' && this.manualBack"), 'Escape does not back out of settings or the pocket card');
  must(ui.includes('const tip = $(') && ui.includes('this.hideTutorial()'), 'Escape cannot dismiss a field tip');
  must(/button:focus-visible[\s\S]*?outline:\s*2px solid/.test(css), 'no visible keyboard focus ring');
  must(ui.includes('<dt>SHIFT</dt>') && ui.includes('<dt>TAB</dt>'), 'the pocket card omits Shift or Tab');
  return 'Tab returns to the browser outside play, Esc backs out, HUD stays quiet, zoom and favicon intact';
});

check('gamepad input contract', () => {
  const main = read('src/main.js');
  const entities = read('src/entities.js');
  const content = read('src/content.js');
  const ui = read('src/ui.js');
  const css = read('src/styles.css');
  must(content.includes('export const GAMEPAD') && content.includes('lookRate'), 'gamepad tuning is not data-driven');
  must(main.includes('pollGamepad(rawDt)'), 'gamepad is not polled by the frame loop');
  must(main.includes('navigator.getGamepads'), 'gamepad discovery missing');
  must(main.includes('this.pad.fire = pressed[7]') && main.includes('this.pad.aim = pressed[6]'), 'trigger mapping missing');
  must(main.includes('this.pad.interact = pressed[5]') && main.includes('this.pad.sprint = pressed[10]'), 'cautery or sprint mapping missing');
  must(main.includes("actions.add('dash')") && main.includes("actions.add('focus')"), 'gamepad ability buttons missing');
  must(main.includes('gamepadMenu(pressed, dt)') && main.includes('querySelectorAll(\'button:not([disabled]), select, input'), 'gamepad menus cannot reach controls');
  must(main.includes('focusedThisPress') && main.includes('padMenuScreen'), 'controller focus can be lost or skip a screen on activation');
  // Accept both `pad.x` and `pad?.x`; the contract is that the player reads
  // analog look/move and the held fire/interact/aim/sprint buttons, not that it
  // spells them with optional chaining.
  const readsPad = (field) => new RegExp(`pad\\??\\.${field}\\b`).test(entities);
  must(['lookX', 'lookY', 'moveX', 'moveZ', 'fire', 'aim', 'interact', 'sprint'].every(readsPad), 'player ignores gamepad axes or held buttons');
  must(ui.includes('PAD STICKS') && ui.includes('START pauses'), 'the pocket card does not document the controller');
  must(css.includes('html[data-input="gamepad"] .screen button:focus'), 'controller focus has no visible ring');
  return 'standard mapping, analog look, pointer-free menus and data-driven tuning';
});

check('accessibility presets', () => {
  const main = read('src/main.js');
  const ui = read('src/ui.js');
  const css = read('src/styles.css');
  const entities = read('src/entities.js');
  const fx = read('src/fx.js');
  must(main.includes('highContrast: false') && main.includes('reduceMotion: false') && main.includes("colorVision: 'off'"), 'accessibility defaults missing');
  must(main.includes("dataset.contrast = s.highContrast ? 'high' : 'normal'"), 'high contrast is not applied to the document');
  must(main.includes("dataset.motion = s.reduceMotion ? 'reduced' : 'normal'"), 'reduce motion is not applied to the document');
  must(main.includes("dataset.vision = COLOR_VISION_MODES"), 'color vision mode is not applied to the document');
  must(main.includes('LMS daltonization') && main.includes('uColorVision') && main.includes('vec3 colorVision(vec3 c)'), 'color vision shader is missing daltonization');
  must(main.includes('1.10104433') && main.includes('0.90822864') && main.includes('-0.15773032'), 'color vision matrices are incomplete');
  must(ui.includes('data-setting="colorVision"') && ui.includes('DEUTERANOPIA') && ui.includes('TRITANOPIA'), 'color vision selector is incomplete');
  must(css.includes('html[data-vision="deuteranopia"]') && css.includes('html[data-vision="tritanopia"]'), 'color vision HUD palette is missing');
  must(main.includes('typeof raw.highContrast') && main.includes('typeof raw.reduceMotion'), 'imported accessibility presets are not sanitised');
  must(main.includes('COLOR_VISION_MODES.includes(raw.colorVision)'), 'imported color vision mode is not allowlisted');
  must(ui.includes('data-setting="highContrast"') && ui.includes('data-setting="reduceMotion"'), 'presets have no settings controls');
  must(css.includes('html[data-contrast="high"]') && css.includes('html[data-motion="reduced"]'), 'preset CSS is missing');
  must(ui.includes("const hc = !!this.game.settings?.highContrast") && ui.includes('A white contour keeps the infection visible'), 'minimap ignores the high-contrast preset');
  must(entities.includes('const motion = this.game?.settings?.reduceMotion ? 0 : 1'), 'camera bob and roll ignore reduce motion');
  must(fx.includes('this.motionScale = 1') && fx.includes('if (this.motionScale <= 0)'), 'screen shake ignores reduce motion');
  must(main.includes('this.fx.motionScale = this.settings.reduceMotion ? 0 : 1'), 'per-organ FX ignores a persisted reduce-motion preset');
  must(!/reduceMotion[\s\S]{0,200}(damageHost|damagePlayer|run\.host|score)/.test(main), 'reduce motion leaks into gameplay math');
  return 'high contrast and reduce motion are persisted, rendered and presentation-only';
});

check('settings write boundary and quality tiers', () => {
  const main = read('src/main.js');
  const ui = read('src/ui.js');
  must(ui.includes("input.addEventListener('input', () => apply(false))"), 'range input still persists on every pixel of a drag');
  must(ui.includes("input.addEventListener('change', () => { apply(false); this.game.save(); })"), 'range release does not commit settings');
  must(ui.includes("'sensitivity', 0.2, 2.5"), 'sensitivity control minimum drifted from the sanitiser');
  must(main.includes('clamp(raw.sensitivity, 0.2, 2.5)'), 'imported sensitivity range is not clamped to the UI range');
  must(ui.includes("['low', 'medium', 'high']") && main.includes("['low', 'medium', 'high']"), 'quality tiers are not allowlisted end to end');
  must(main.includes("quality === 'low'") && main.includes("quality === 'high'" ) && main.includes('PERFORMANCE.lowRenderScale'), 'medium quality has no distinct render path');
  must(ui.includes('this.showSettings(back)') && ui.includes('file.value = \'\''), 'import does not refresh settings or reset the file input');
  return 'live preview, commit on release, aligned ranges, three real quality tiers, repeatable import';
});

check('run continuity and seeded gameplay', () => {
  const main = read('src/main.js');
  const entities = read('src/entities.js');
  const content = read('src/content.js');
  const start = main.indexOf('completeOrgan()');
  const end = main.indexOf('\n  descend(', start);
  must(start >= 0 && end > start, 'completeOrgan boundary not found');
  const complete = main.slice(start, end);
  must(complete.includes('this.saveCheckpoint()'), 'organ completion does not preserve a resumable checkpoint');
  must(!complete.includes('clearCheckpoint()'), 'organ completion still erases the checkpoint before the route screen');
  must(complete.indexOf('this.saveCheckpoint()') < complete.indexOf('showInterOrgan('), 'checkpoint is written after the route screen can be reloaded');
  must(complete.includes('this.run.interorgan =') && complete.includes('selectedAdaptation: null'), 'route-screen state is not captured');
  const resumeStart = main.indexOf('resumeCheckpoint()');
  const resume = main.slice(resumeStart, main.indexOf('\n  saveCheckpoint()', resumeStart));
  must(resume.includes("cp.stage === 'interorgan'") && resume.includes('this.restoreInterorgan(cp)'), 'Continue cannot restore the route screen');
  must(main.includes('routeStop') && main.includes("stage: routeStop ? 'interorgan' : 'organ'"), 'route-screen checkpoints are not validated');
  must(main.includes('recordInterorganChoice()') && read('src/ui.js').includes('recordInterorganChoice?.()'), 'adaptation and route selections are not persisted');
  must(content.includes('export const PICKUPS') && main.includes('PICKUPS.ammoChance') && main.includes('PICKUPS.medkitCap'), 'loot tuning is not data-driven');
  must(entities.includes('HOST.sporeBurstCost'), 'spore burst still hard-codes Host damage');
  const fireStart = main.indexOf('fireShot(player, spread)');
  const fire = main.slice(fireStart, main.indexOf('\n  }', fireStart));
  must(fire.includes('const shotRng = this.run?.rng;') && fire.includes('shotRng ? shotRng.next() : Math.random()'), 'shot spread is not seeded');
  must(entities.includes('const gameplayRandom = (game) =>') && (entities.match(/gameplayRandom\(game\)/g) || []).length >= 6, 'boss attack decisions are not seeded');
  return 'route screen restores exactly, loot and Host numbers are data, boss and spread use the run stream';
});

check('runtime smoke procedure', () => {
  must(exists('design/SMOKE-TEST.md'), 'no repeatable browser smoke procedure for the next pass');
  const smoke = read('design/SMOKE-TEST.md');
  for (const token of ['eight organs', 'checkpoint', 'Tab', 'crisis', 'settings', 'console']) {
    must(smoke.toLowerCase().includes(token.toLowerCase()), `smoke procedure omits ${token}`);
  }
  return 'eight-organ, input, save, crisis and console probes documented';
});

check('production build', () => {
  const started = Date.now();
  execSync('npm run build', { cwd: ROOT, stdio: 'pipe', encoding: 'utf8' });
  const ms = Date.now() - started;
  const dist = path.join(ROOT, 'dist');
  must(fs.existsSync(path.join(dist, 'index.html')), 'dist/index.html missing');
  const html = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
  const refs = [...html.matchAll(/(?:src|href)="\.?\/?(assets\/[^"]+)"/g)].map((m) => m[1]);
  must(refs.length >= 2, 'built HTML has no hashed assets');
  for (const ref of refs) must(fs.existsSync(path.join(dist, ref)), `missing built asset ${ref}`);
  const assets = fs.readdirSync(path.join(dist, 'assets'));
  const js = assets.filter((f) => f.endsWith('.js'));
  const css = assets.filter((f) => f.endsWith('.css'));
  must(js.length > 0 && css.length > 0, 'build produced no JS/CSS');
  const jsBytes = js.reduce((n, f) => n + fs.statSync(path.join(dist, 'assets', f)).size, 0);
  const cssBytes = css.reduce((n, f) => n + fs.statSync(path.join(dist, 'assets', f)).size, 0);
  const total = jsBytes + cssBytes;
  if (jsBytes > 1_200_000) fail.push(`bundle budget: JS ${(jsBytes / 1024).toFixed(0)} kB exceeds 1.2 MB`);
  else pass.push(`bundle budget: JS ${(jsBytes / 1024).toFixed(0)} kB, CSS ${(cssBytes / 1024).toFixed(0)} kB`);
  if (total > 1_500_000) warn.push(`total build ${(total / 1024).toFixed(0)} kB`);
  return `build passed in ${ms} ms, ${refs.length} hashed assets`;
});

check('no absolute asset base', () => {
  const distHtml = read('dist/index.html');
  must(!/(?:src|href)="\/assets\//.test(distHtml), 'build uses absolute /assets paths; set Vite base to "./"');
  return 'portable relative asset base';
});

check('grain and postfx budget', () => {
  const main = read('src/main.js');
  must(main.includes('toneMapping'), 'ACES tone mapping missing');
  must(main.includes('bloomPass'), 'bloom pass missing');
  must(main.includes('uVignette'), 'vignette control missing');
  return 'tone mapping, bloom and grade pass';
});

check('accessibility controls', () => {
  const main = read('src/main.js');
  const ui = read('src/ui.js');
  for (const key of ['sensitivity', 'invertY', 'fov', 'shake', 'volume', 'quality', 'aberration']) {
    must(main.includes(key) || ui.includes(key), `setting ${key} missing`);
  }
  must(main.includes('requestPointerLock') || ui.includes('requestPointerLock'), 'pointer lock missing');
  return 'sensitivity, FOV, invert, shake, volume and quality';
});

check('vertical traversal, injection cinema and heart landmark', () => {
  const content = read('src/content.js');
  const level = read('src/level.js');
  const entities = read('src/entities.js');
  const main = read('src/main.js');
  const ui = read('src/ui.js');
  const html = read('index.html');
  const css = read('src/styles.css');
  // Tuning is data, not magic numbers in the controller.
  must(CONTENT.PLAYER.jumpSpeed > 0 && CONTENT.PLAYER.gravity > 0, 'jump tuning is not data-driven');
  must(CONTENT.PLAYER.airDodgeHeight > 0, 'jump dodge window missing');
  must(CONTENT.PLAYER.dashProjectileClear > 0, 'dash projectile clear radius missing');
  must(CONTENT.PLAYER.landSlamDamage > 0, 'landing slam has no damage tuning');
  must(CONTENT.ORGAN_AMBIENCE.heart.heartRate > CONTENT.ORGAN_AMBIENCE.lung.heartRate, 'heart organ has no faster ambience');
  // World and collision.
  for (const token of ['this.platforms = []', 'this.heartLandmarks = []', 'groundAt(x, z', 'heartProximity(pos)', 'buildLedges(room', 'buildHeartLandmark(room', 'this.platforms.push', 'addRoot(h.group)']) {
    must(level.includes(token), `level missing ${token}`);
  }
  // Player must use the swept shelf test and clear rounds while dashing.
  must(entities.includes('level.groundAt'), 'player never asks the shelf for a surface');
  must(entities.includes('clearDashingProjectiles()'), 'dash does not clear projectiles');
  must(entities.includes('PLAYER.airDodgeHeight'), 'jump does not grant the height dodge');
  must(entities.includes('1.15 + player.airHeight'), 'enemy projectiles ignore the player height');
  must(entities.includes('landPulse'), 'hard landings have no feedback');
  must(entities.includes('this.slamNearby(') && entities.includes('e.takeDamage(damage *'), 'landing slam is not wired to enemies');
  // dist2 already returns metres. Three separate sites compared it to a
  // squared radius, quietly doubling dash, slam and return-home ranges.
  for (const bad of ['dashProjectileClear ** 2', 'const r2 = radius * radius', '(home.r * 0.92) ** 2']) {
    must(!entities.includes(bad), `distance compared to a squared radius: ${bad}`);
  }
  // Heart tempo and presentation wiring.
  must(main.includes('heartProximity') && main.includes('pulseHeart'), 'heartbeat is not proximity-driven');
  must(ui.includes("classList.add('running')") && ui.includes('inject-scale'), 'injection cinema is not started');
  must(css.includes('.inject-cine') && css.includes('@keyframes needleDive'), 'injection cinematic styles missing');
  must(css.includes('#heart-pulse.beat') && css.includes('#land-fx.fire'), 'heart/landing overlays missing styles');
  must(html.includes('inject-cine') && html.includes('heart-pulse') && html.includes('land-fx'), 'presentation nodes missing from markup');
  return 'swept ledges, damage-free jump dodge, dash projectile clear, injection dive, beating heart landmark';
});

check('dash strike and kill refund', () => {
  const entities = read('src/entities.js');
  const audio = read('src/audio.js');
  const ui = read('src/ui.js');
  must(CONTENT.PLAYER.dashStrikeDamage > 0, 'dash strike has no damage tuning');
  must(CONTENT.PLAYER.dashStrikeRadius > 0, 'dash strike has no reach');
  must(CONTENT.PLAYER.dashStrikeKillRefund > 0, 'dash kill refund missing');
  must(CONTENT.FOCUS.dashStrikeGain > 0, 'dash strike does not feed focus');
  must(entities.includes('dashStrikeNearby()'), 'dash never resolves a contact hit');
  must(entities.includes('dashStrikeSet.clear()'), 'dash strike is not limited to one hit per enemy');
  must(entities.includes('dashStrikeKillRefund'), 'dash kill does not return cooldown');
  must(entities.includes('segmentClear'), 'dash strike can hit through walls');
  must(audio.includes('dashStrike()'), 'dash strike has no impact sound');
  must(ui.includes('rupture on contact'), 'controls do not teach the dash strike');
  return 'contact rupture, one hit per burst, wall-safe, kill refund';
});

check('protective entry chamber', () => {
  const level = read('src/level.js');
  const main = read('src/main.js');
  must(level.includes('entryProtected') && level.includes('entryRoomId'), 'entry chamber has no spawn shield');
  must(level.includes('entry.r * 0.9'), 'spawn shield is not released by leaving the chamber');
  must(main.includes('if (this.level?.entryProtected)'), 'damage path ignores the spawn shield');
  must(main.includes('STERILE FIELD'), 'spawn shield has no visible cue');
  return 'airlock shields the first steps and announces itself';
});

check('resupply kits and sealed airlock', () => {
  const entities = read('src/entities.js');
  const level = read('src/level.js');
  const main = read('src/main.js');
  must(entities.includes('Surgical resupply') && entities.includes('RoundedBoxGeometry(0.25'), 'pickups are still primitive blocks');
  must(entities.includes('Fracture grenade'), 'grenade pickup has no canister model');
  must(level.includes('this.entryRoom =') && main.includes('entryGuard'), 'spawn chamber has no physical enemy seal');
  must(main.includes('nowInside && !wasInside'), 'enemy seal does not hold the boundary');
  return 'detailed resupply kits and an enemy-sealed airlock';
});

check('directional damage feedback', () => {
  const markup = read('index.html');
  const main = read('src/main.js');
  const ui = read('src/ui.js');
  const entities = read('src/entities.js');
  const css = read('src/styles.css');
  must(markup.includes('id="damage-dir"'), 'hit direction has no HUD element');
  must(ui.includes('damageDirection(degrees)') && ui.includes("setProperty('--dir'"), 'hit direction has no bearing setter');
  must(main.includes('damagePlayer(amount, source = null, cause = null)'), 'damage path does not accept an attacker or a cause');
  must(main.includes('worldToLocal(v)') && main.includes('Math.atan2(v.x, -v.z)'), 'bearing is not derived from camera space');
  // A hit that does not identify its source would silently lose the indicator.
  const sourced = (entities.match(/damagePlayer\([^)]*,\s*(this\.pos|\{ x: this\.x)/g) || []).length;
  must(sourced >= 4, `only ${sourced} of 4 damage sources pass an attacker position`);
  must(css.includes('#damage-dir') && css.includes('conic-gradient'), 'hit direction has no arc');
  must(css.includes('html[data-motion="reduced"] #damage-dir') && css.includes('html[data-contrast="high"] #damage-dir'), 'hit direction ignores accessibility presets');
  return 'camera-space bearing, four sourced attackers, reduced-motion and contrast variants';
});

check('enemy attack telegraphs', () => {
  const fx = read('src/fx.js');
  const main = read('src/main.js');
  const entities = read('src/entities.js');
  must(fx.includes('class TelegraphField') && fx.includes('InstancedMesh'), 'telegraphs are not batched');
  must(fx.includes("'enemy-telegraphs'"), 'telegraph mesh is not named for profiling');
  must(main.includes('beginTelegraphs') && main.includes('endTelegraphs'), 'telegraph field is not driven per fixed step');
  must(main.includes('enemy.windup > 0') && main.includes('this.fx.telegraph('), 'enemy wind-up draws no telegraph');
  // Regression guard: the telegraph used to sit after `if (!entryGuard) continue;`,
  // so it vanished on every frame after the airlock opened.
  const tel = main.indexOf('this.fx.telegraph(');
  const guard = main.indexOf('if (!entryGuard) continue;');
  must(tel > 0 && guard > tel, 'telegraph is unreachable once the entry guard is active');
  must(entities.includes('this.windup = def.windup'), 'enemies never enter a wind-up state');
  return 'instanced ground rings driven by wind-up, emitted before the entry guard';
});

check('spatial audio', () => {
  const audio = read('src/audio.js');
  const main = read('src/main.js');
  const entities = read('src/entities.js');
  must(audio.includes('createStereoPanner'), 'world sounds are not panned');
  must(audio.includes('setListener(') && main.includes('this.audio.setListener('), 'no listener update in the fixed step');
  // Without the camera basis the pan is a coin flip rather than a bearing.
  must(main.includes('this.player.camera'), 'listener is not fed the camera orientation');
  must(audio.includes('playAt(x, z, fn)'), 'no scoped pan context for multi-voice events');
  const placed = (entities.match(/playAt\(/g) || []).length;
  must(placed >= 6, `only ${placed} world cues are positioned`);
  // A pan left set after an event would silently drag every later sound to one side.
  must(audio.includes('this._pendingPan = prev'), 'pan context is not restored after an event');
  return `${placed} positioned world cues, camera-space listener, restored pan context`;
});

check('living audio bed', () => {
  const audio = read('src/audio.js');
  const main = read('src/main.js');
  must(audio.includes('ambientTick(dt, tension'), 'ambience has no per-step life');
  must(main.includes('this.audio.ambientTick('), 'ambience is never ticked by the game loop');
  must(audio.includes('ambientOneShot()'), 'the tissue never shifts');
  must(audio.includes('ambientFilterTimer'), 'breath filter is unthrottled');
  // A static report fired nine times a second is the clearest synthesised tell.
  must(/gunshot\([^)]*\)[\s\S]{0,900}?Math\.random\(\)/.test(audio), 'gunshot is sample-identical on every shot');
  must(audio.includes('ui(confirm = false)') && audio.includes("type: 'highpass', freq: 2500"), 'menu click has no contact layer');
  return 'breathing bed, off-centre tissue events, randomised report, layered UI click';
});

check('sequenced menu entrance', () => {
  const css = read('src/styles.css');
  must(css.includes('@keyframes screenPartIn'), 'screen bands have no entrance animation');
  must(css.includes('.screen > *') && css.includes('animation: screenPartIn'), 'screen bands do not animate');
  // The order of the delays is the reading order; without them the screen lands flat.
  const delays = (css.match(/\.screen > \*:nth-child\([^)]*\) \{\s*animation-delay/g) || []).length;
  must(delays >= 4, `only ${delays} staggered bands`);
  must(css.includes('html[data-motion="reduced"] .screen > *'), 'sequenced entrance ignores reduced motion');
  // A translating parent plus translating children made the rise mushy.
  const fade = css.slice(css.indexOf('@keyframes screenIn'), css.indexOf('@keyframes screenPartIn'));
  must(!fade.includes('translateY'), 'screen parent double-animates the rise');
  return `${delays} staggered bands, reduced-motion off switch, fade-only parent`;
});

check('discipline weapon silhouettes', () => {
  const content = read('src/content.js');
  const entities = read('src/entities.js');
  const main = read('src/main.js');
  const ui = read('src/ui.js');
  const kits = (content.match(/weapon: \{ name:/g) || []).length;
  must(kits >= 3, `only ${kits} disciplines declare weapon hardware`);
  must(content.includes('accent: 0x') && content.includes('muzzle:'), 'kit accents or barrel lengths are missing');
  must(entities.includes('buildKitModule(kitId)') && entities.includes('setKit(kitId ='), 'no per-kit module builder');
  must(entities.includes('clearKitModule()') && entities.includes('this.kitModule'), 'kit hardware is never replaced');
  must(entities.includes('muzzleLocalZ'), 'a longer kit barrel never moves the muzzle');
  must(main.includes('this.player.setKit('), 'run start never applies the chosen kit');
  must(ui.includes('player.weaponLabel'), 'HUD never reads the kit weapon label');
  // The three silhouettes must differ, not just their paint: the module builder
  // has to branch per discipline.
  const branches = (entities.match(/kitId === '(trauma|medic)'/g) || []).length;
  must(branches >= 2, 'kit modules do not branch by discipline');
  return `${kits} kit identities, per-discipline hardware, muzzle length wired`;
});

check('surgeon vitals escalation', () => {
  const markup = read('index.html');
  const css = read('src/styles.css');
  const ui = read('src/ui.js');
  const main = read('src/main.js');
  const entities = read('src/entities.js');
  must(markup.includes('id="surgeon-warning"') && markup.includes('id="surgeon-vignette"'), 'no surgeon critical UI');
  must(ui.includes('surgeonCritical') && ui.includes("classList.toggle('on', surgeonCritical)"), 'critical vignette is never driven');
  must(css.includes('@keyframes surgeonBreath') && css.includes('@keyframes surgeonBlink'), 'critical state has no pulse');
  must(css.includes('html[data-motion="reduced"] #surgeon-vignette'), 'critical vignette ignores reduced motion');
  // The warning has to be about the player's own body, not the patient's.
  must(main.includes('hurt * 0.66') && main.includes('this.player.hp / Math.max(1, this.player.maxHp)'), 'heartbeat ignores surgeon HP');
  must(entities.includes('this.hitStun = PLAYER.hitStun'), 'taking damage has no physical response');
  must(read('src/content.js').includes('criticalFrac:'), 'critical threshold is not data');
  must(main.includes('this.run.lastHit ='), 'damage source is not recorded');
  must(ui.includes('PROXIMATE CAUSE'), 'fail screen never explains the death');
  return 'persistent wash, blinking instruction, hit stun, cause recorded and shown';
});

check('enemy death staging', () => {
  const entities = read('src/entities.js');
  must(entities.includes('this.deathSlide') && entities.includes('this.deathDir'), 'death has no impact displacement');
  must(entities.includes("style === 'heavy'") && entities.includes("style === 'skitter'"), 'deaths do not branch by silhouette');
  must(entities.includes('twitch') && entities.includes('t > 0.66'), 'corpses never spasm after collapse');
  must(entities.includes('this.game.fx.splat('), 'deaths leave no pooling');
  // Creepy means slit pupils, not glowing cartoon discs.
  must(entities.includes('slitParts') && entities.includes('mergeGeometries(slitParts'), 'enemy eyes are still round and unbatched');
  return 'throw, style-specific collapse, late spasms, pooled blood, slit-pupil eye batches';
});

check('ability refusal feedback', () => {
  const entities = read('src/entities.js');
  const ui = read('src/ui.js');
  const css = read('src/styles.css');
  const audio = read('src/audio.js');
  must(entities.includes('NO MEDKITS') && entities.includes('NO INJURY') && entities.includes('INJECTOR CYCLING'), 'a refused medkit is silent');
  must(entities.includes('NO STABILIZERS') && entities.includes('RESERVOIR PRESSURIZING'), 'a refused stabilizer is silent');
  must(entities.includes('PROCEDURE ABORTED') && entities.includes('PROCEDURE RELEASED'), 'channel cancel is silent');
  must(entities.includes('this.medkitTimer = 0.62') && entities.includes('inject * 0.3'), 'medkit has no body animation');
  must(ui.includes("abilityState('ability-medkit'"), 'ability tiles do not reflect state');
  must(css.includes('.ability.empty') && css.includes('.ability.urgent'), 'ability states have no styling');
  // Kits have to sound different, or the shared chassis is all the player hears.
  must(audio.includes("gunshot(tone = 'trauma')") && audio.includes("'pathologist'"), 'kits share one report');
  must(entities.includes('audio.gunshot(this.kitId'), 'the report is not fed the kit');
  return 'refusal toasts, channel cancel cue, injection pose, tile states, per-kit report';
});

check('committed enemy attacks', () => {
  const content = read('src/content.js');
  const main = read('src/main.js');
  const entities = read('src/entities.js');
  must(content.includes('meleeSlots:') && content.includes('meleeSlotHold:'), 'attack concurrency is not data');
  must(main.includes('tryAttackSlot(enemy)'), 'no attack slot arbiter');
  must(main.includes('attackSlotUntil') && main.includes('COMBAT.meleeSlotHold'), 'reservations do not expire');
  must(entities.includes('game.tryAttackSlot(this)'), 'melee attacks ignore the arbiter');
  must(entities.includes('COMBAT.meleeSlotRetry'), 'denied attackers do not wait');
  // A hand-released slot could leak on death or culling; expiry is the guard.
  must(!main.includes('releaseAttackSlot'), 'slots are hand-released instead of expiring');
  return `${content.match(/meleeSlots: (\d+)/)?.[1]} concurrent melee commits, time-expired reservations, retry window`;
});

check('jockeying attackers and creature voices', () => {
  const entities = read('src/entities.js');
  const audio = read('src/audio.js');
  must(entities.includes('this.holdTimer = this.attackCd + 0.2'), 'denied attackers do not jockey');
  must(entities.includes('this.holdSide *= -1'), 'jockeying never changes direction');
  must(entities.includes('this.holdTimer > 0 && d < def.range * 2.6'), 'jockeying is not bounded to the engagement');
  must(entities.includes('this.holdTimer = 0;'), 'jockeying is never cleared on commitment');
  must(audio.includes("enemyVoice(style = 'ground')"), 'creatures have no idle voice');
  must(entities.includes('game.audio.enemyVoice(style)'), 'idle voice is never emitted');
  // Distance gate keeps a distant nest off the mix.
  must(entities.includes('< 196'), 'idle voices are not distance gated');
  must(entities.includes('6 + Math.random() * 8'), 'idle voices are not rate limited');
  return 'orbiting denied attackers, per-silhouette idle voices, distance and rate gated';
});

check('death and low-health audio', () => {
  const audio = read('src/audio.js');
  const entities = read('src/entities.js');
  must(audio.includes('enemyDeath(weight = 1)'), 'no death rattle');
  must(entities.includes('audio.enemyDeath('), 'deaths are silent');
  must(entities.includes('game.audio.playAt(this.pos.x, this.pos.z') && entities.includes('enemyDeath('), 'death rattle is not positioned');
  must(audio.includes('enemyDeath') && audio.includes('delay: 0.16'), 'death has no settling beat');
  must(audio.includes('gunshot(tone') && entities.includes('audio.gunshot(this.kitId'), 'kits share one report');
  return 'three-stage positioned death rattle, per-kit report';
});

check('github pages package', () => {
  const pkg = JSON.parse(read('package.json'));
  must(pkg.version.startsWith('1.'), `version ${pkg.version} is not a release version`);
  must(pkg.scripts.build.includes('postbuild'), 'build does not run the Pages postbuild');
  must(fs.existsSync(path.join(ROOT, 'dist', '.nojekyll')), 'dist/.nojekyll missing');
  must(fs.existsSync(path.join(ROOT, 'dist', '404.html')), 'dist/404.html fallback missing');
  // A copy of index.html would resolve ./assets against the missing deep path.
  must(read('dist/404.html').includes('location.replace'), '404 fallback does not redirect to the project root');
  const html = read('dist/index.html');
  must(!/\/src\//.test(html), 'development entry leaked into dist');
  must(!/(?:src|href)="\/assets\//.test(html), 'dist uses absolute asset paths');
  const maps = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.map')) maps.push(full);
    }
  };
  walk(path.join(ROOT, 'dist'));
  must(maps.length === 0, 'source maps are shipped in dist');
  must(fs.existsSync(path.join(ROOT, '.github', 'workflows', 'deploy.yml')), 'no Pages deploy workflow');
  const wf = read('.github/workflows/deploy.yml');
  must(wf.includes('actions/deploy-pages@v4') && wf.includes('path: dist'), 'workflow does not publish dist');
  must(wf.includes('npm run audit'), 'workflow publishes without running the gates');
  must(read('README.md').includes('Settings → Pages'), 'README does not explain Pages setup');
  return `v${pkg.version} artifact with .nojekyll, 404 fallback, gate-first workflow and deploy docs`;
});

check('browser lifecycle and capture recovery', () => {
  const main = read('src/main.js');
  const audio = read('src/audio.js');
  const markup = read('index.html');
  const css = read('src/styles.css');
  const ignores = read('.gitignore');
  // Pointer lock is a permission the browser can refuse, not a given.
  must(main.includes('pointerlockerror') && main.includes('syncLockHint'), 'pointer lock refusals are silent');
  must(markup.includes('id="aim-lock"') && css.includes('#aim-lock'), 'no click-to-aim surface');
  must(main.includes('this.syncLockHint()'), 'lock state never refreshes the hint');
  // A background tab should not keep a body breathing.
  must(audio.includes('suspendForHidden') && audio.includes('wakeFromHidden'), 'audio has no hidden-tab lifecycle');
  must(main.includes('audio.suspendForHidden()') && main.includes('audio.wakeFromHidden()'), 'hidden tabs keep playing');
  // beforeunload is skipped by bfcache; pagehide is the durable save hook.
  must(main.includes("addEventListener('pagehide'") && main.includes("addEventListener('pageshow'"), 'bfcache lifecycle not handled');
  // The boot layer must be visible before JS and removed after the title paints.
  must(!/id="boot"[^>]*class="hidden"/.test(markup) && main.includes('dismissBoot()'), 'boot layer is dead or never removed');
  must(css.includes('.boot-out') && markup.includes('<noscript>'), 'boot has no exit or no-JS notice');
  for (const entry of ['node_modules/', 'dist/', 'screenshots/', 'design/shots/']) {
    must(ignores.includes(entry), `.gitignore missing ${entry}`);
  }
  return 'capture-failure UI, hidden-tab suspend, bfcache persistence, boot layer, lean repo';
});

check('production surface', () => {
  const main = read('src/main.js');
  const markup = read('index.html');
  const css = read('src/styles.css');
  must(
    /if \(import\.meta\.env\.DEV\) \{[\s\S]{0,140}?window\.__microcure/.test(main),
    'debug game handle ships in production'
  );
  must(markup.includes('id="device-gate"') && markup.includes('id="device-continue"'), 'no touch device gate');
  must(css.includes('(pointer: coarse)') && css.includes('body.device-gate-dismissed'), 'device gate is not scoped/dismissible');
  must(markup.includes('og:title') && markup.includes('og:description'), 'no link preview metadata');
  return 'DEV-only debug handle, dismissible touch gate, social metadata';
});

const bold = (s) => `\x1b[1m${s}\x1b[0m`;
console.log(`\n${bold('MICROCURE AUDIT')}\n`);
for (const line of pass) console.log(`  \x1b[32mPASS\x1b[0m  ${line}`);
for (const line of warn) console.log(`  \x1b[33mWARN\x1b[0m  ${line}`);
for (const line of fail) console.log(`  \x1b[31mFAIL\x1b[0m  ${line}`);
console.log(`\n${pass.length} passed · ${warn.length} warnings · ${fail.length} failed\n`);
if (fail.length) process.exit(1);
