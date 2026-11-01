// MicroCure — screens, HUD, minimap, toasts, settings and the hospital hub.
import * as THREE from 'three';
import { GAME, PATIENT, DISCIPLINES, WEAPON, PLAYER, HOST, BOSS, ADAPTATIONS, ROUTES, RESEARCH, GRADES, ORGANS, MUTATIONS, PROTOCOLS, DIRECTIVES, FOCUS, SCORING, MEDALS } from './content.js';
import { clamp, formatClock, formatTime, shortSeed, storage } from './utils.js';

const $ = (id) => document.getElementById(id);
const esc = (s) =>
  String(s)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');

const hexCss = (n) => `#${n.toString(16).padStart(6, '0')}`;

function scanSvg(patient = PATIENT) {
  const name = `${patient.last || ''}, ${patient.first || ''}`;
  return `
  <svg class="scan-svg" viewBox="0 0 260 340" role="img" aria-label="Printed thoracic CT scan">
    <rect width="260" height="340" fill="#e4dccb"/>
    <g stroke="#c8bfab" stroke-width=".6" opacity=".55">
      <path d="M0 34h260M0 306h260M18 0v340M242 0v340"/>
      <path d="M0 170h260" stroke-dasharray="2 4"/>
    </g>
    <text x="15" y="20" fill="#37413d" font-family="IBM Plex Mono, monospace" font-size="7" letter-spacing="1.4">NEXUS UNIVERSITY HOSPITAL</text>
    <text x="15" y="30" fill="#6f6a5d" font-family="IBM Plex Mono, monospace" font-size="6" letter-spacing="1">CT THORAX / CONTRAST / SAGITTAL</text>
    <g fill="none" stroke="#4a5852" stroke-width="1" opacity=".78">
      <path d="M130 42c-27 0-42 16-45 41l-6 52c-3 25 2 43 12 63l16 31c7 13 21 19 23 36 3-17 17-23 24-36l16-31c11-20 15-38 12-63l-6-52c-3-25-19-41-46-41z"/>
      <path d="M130 42v223M96 106c13-11 25-13 34-5M164 106c-13-11-25-13-34-5"/>
      <path d="M96 168c-22 8-35 27-42 51M164 168c22 8 35 27 42 51"/>
      <path d="M107 137c-9 19-7 39 2 55 6 10 14 14 21 16M153 137c9 19 7 39-2 55-6 10-14 14-21 16"/>
    </g>
    <g class="scan-lesions" fill="#9b2f2a" opacity=".86">
      <circle cx="108" cy="162" r="3"/><circle cx="115" cy="170" r="2.2"/>
      <circle cx="101" cy="181" r="1.8"/><circle cx="152" cy="188" r="2.8"/>
      <circle cx="145" cy="198" r="2"/><circle cx="158" cy="178" r="1.5"/>
    </g>
    <g fill="none" stroke="#9b2f2a" stroke-width=".8" opacity=".6">
      <circle cx="108" cy="162" r="7"/><circle cx="152" cy="188" r="8"/>
    </g>
    <rect x="176" y="292" width="66" height="19" fill="none" stroke="#9b2f2a" stroke-width="1.2" opacity=".8" transform="rotate(-4 176 292)"/>
    <text x="183" y="305" fill="#9b2f2a" font-family="IBM Plex Mono, monospace" font-size="7" letter-spacing="1.8" transform="rotate(-4 176 292)">CRITICAL</text>
    <g fill="#5f655c" font-family="IBM Plex Mono, monospace" font-size="6" letter-spacing="1">
      <text x="15" y="325">${esc(name)} / MRN ${esc(patient.mrn || '4471-02')}</text>
      <text x="190" y="325">SLICE 3/12</text>
    </g>
  </svg>`;
}

// A compact operative plan: first organ to last, with a sterile-route line.
// It is a visual map, not another paragraph; the route text above names the
// organs for screen readers and for anyone who wants the words.
function routeMapSvg(route = []) {
  const ids = route.filter((id) => ORGANS[id]);
  const count = Math.max(1, ids.length);
  const nodes = ids.map((id, i) => {
    const x = 24 + (i / Math.max(1, count - 1)) * 272;
    return `<g class="route-node"><circle cx="${x}" cy="19" r="9" class="route-ring"/><circle cx="${x}" cy="19" r="4" class="route-core"/><text x="${x}" y="38" text-anchor="middle">${i + 1}</text></g>`;
  }).join('');
  return `<svg class="route-map" viewBox="0 0 320 44" aria-hidden="true">
    <path class="route-tick" d="M18 9h284M18 29h284" />
    <path class="route-line" d="M24 19H296" />
    ${nodes}
    <path class="route-tick" d="M18 4v10M302 4v10M18 24v10M302 24v10" />
  </svg>`;
}

function topline(right = 'CASE OPEN', left = 'NEXUS UNIVERSITY HOSPITAL', mid = 'SURGICAL SERVICES') {
  return `<header class="topline">
    <span class="brandmark"><i class="cross"></i>${esc(left)}</span>
    <span class="top-mid">${esc(mid)}</span>
    <span class="top-status"><i></i>${esc(right)}</span>
  </header>`;
}

export class UI {
  constructor(game) {
    this.game = game;
    this.root = $('screen-root');
    this.hud = $('hud');
    this.toastLayer = $('toasts');
    this.fadeEl = $('fade');
    this.injectionEl = $('injection');
    this.selectedDiscipline = 'trauma';
    this.selectedAdaptation = null;
    this.selectedRoute = null;
    this.interorgan = null;
    this.settingsBack = null;
    this.manualBack = null;
    this.currentScreen = '';
    this.minimapAcc = 0;
    this.crisisActive = false;
    this.lastHud = {};
    this.tutorialTimer = null;
    this.subtitleTimer = null;
    this.chapterTimer = null;
    this.injectionToken = 0;
    this.boundSettings = false;
    this._bindGlobal();
  }

  _bindGlobal() {
    document.addEventListener('click', (e) => {
      const target = e.target.closest('[data-action]');
      if (!target) return;
      const action = target.dataset.action;
      if (target.disabled) return;
      this.game.audio.ui(true);
      switch (action) {
        case 'title':
          this.closeSettings();
          this.game.returnToTitle();
          break;
        case 'begin':
          this.game.openCaseFile();
          break;
        case 'continue':
          this.game.resumeCheckpoint();
          break;
        case 'hub':
          this.closeSettings();
          this.game.openHub();
          break;
        case 'case-back':
          this.game.openHub();
          break;
        case 'authorize':
          this.game.openLoadout();
          break;
        case 'loadout-back':
          this.game.openCaseFile();
          break;
        case 'discipline':
          this.selectedDiscipline = target.dataset.id;
          this.showLoadout();
          break;
        case 'inject':
          this.game.startRun(this.selectedDiscipline);
          break;
        case 'resume':
          this.game.resume();
          break;
        case 'pause':
          this.game.pause();
          break;
        case 'manual': {
          const back = this.game.state === 'paused'
            ? () => this.showPause()
            : this.currentScreen === 'title'
              ? () => this.showTitle()
              : () => this.game.openHub();
          this.showManual(back);
          break;
        }
        case 'settings': {
          const back = this.game.state === 'paused'
            ? () => this.showPause()
            : this.currentScreen === 'title'
              ? () => this.showTitle()
              : () => this.game.openHub();
          this.showSettings(back);
          break;
        }
        case 'settings-back':
          if (this.settingsBack) this.settingsBack();
          break;
        case 'manual-back':
          if (this.manualBack) this.manualBack();
          break;
        case 'restart':
          this.game.restartCase();
          break;
        case 'abandon':
          this.game.abandonToHub();
          break;
        case 'debrief-hub':
          this.game.returnToHub();
          break;
        case 'retry':
          this.game.retryCase();
          break;
        case 'research':
          this.game.buyResearch(target.dataset.id);
          this.showHub();
          break;
        case 'adapt':
          this.selectedAdaptation = target.dataset.id;
          this.game.recordInterorganChoice?.();
          this.showInterOrgan(this.interorgan);
          break;
        case 'route':
          this.selectedRoute = target.dataset.id;
          this.game.recordInterorganChoice?.();
          this.showInterOrgan(this.interorgan);
          break;
        case 'descend':
          if (this.selectedAdaptation && this.selectedRoute) {
            this.game.descend(this.selectedAdaptation, this.selectedRoute);
          }
          break;
        case 'export':
          this.game.exportSave();
          break;
        case 'import':
          $('import-file')?.click();
          break;
        case 'reset':
          if (window.confirm('Erase local research, records and settings? This cannot be undone.')) {
            this.game.resetProgress();
            this.showTitle();
          }
          break;
        case 'tutorial-dismiss':
          this.hideTutorial();
          break;
        case 'close-settings':
          this.closeSettings();
          break;
        default:
          break;
      }
    });

    $('tutorial-dismiss')?.addEventListener('click', () => this.hideTutorial());

    document.addEventListener('keydown', (e) => {
      if (e.code !== 'Escape') return;
      // Overlay screens own Escape before the simulation does. This keeps the
      // pause state intact when Settings or the pocket card was opened over it.
      if (this.currentScreen === 'settings' && this.settingsBack) {
        e.preventDefault();
        this.settingsBack();
        return;
      }
      if (this.currentScreen === 'manual' && this.manualBack) {
        e.preventDefault();
        this.manualBack();
        return;
      }
      if (this.game.state === 'playing') {
        const tip = $('tutorial');
        if (tip && !tip.classList.contains('hidden')) {
          e.preventDefault();
          this.hideTutorial();
          return;
        }
        e.preventDefault();
        this.game.pause();
      } else if (this.game.state === 'paused') {
        e.preventDefault();
        this.game.resume();
      }
    });
  }

  setHudVisible(visible) {
    this.hud.classList.toggle('hidden', !visible);
    // The global paper-grain layer is a full-screen blend over a live WebGL
    // canvas. The grade shader already owns film grain in-game; keep the DOM
    // one for menus only, where the extra layer costs nothing.
    document.body.classList.toggle('in-game', visible);
    if (!visible) {
      $('focus-fx')?.classList.remove('active');
      this.setCrisisActive(false);
    }
  }

  setCrisisActive(active) {
    const next = !!active;
    if (this.crisisActive === next) return;
    this.crisisActive = next;
    document.body.classList.toggle('crisis', next);
    $('crisis-readout')?.classList.toggle('hidden', !next);
  }

  showScreen(html, name = '') {
    if (this._titleClock) {
      clearInterval(this._titleClock);
      this._titleClock = null;
    }
    this.root.innerHTML = html;
    this.root.classList.remove('hidden');
    this.currentScreen = name;
    this.setHudVisible(false);
    const screen = this.root.querySelector('.screen');
    if (screen) screen.scrollTop = 0;
  }

  hideScreens() {
    if (this._titleClock) {
      clearInterval(this._titleClock);
      this._titleClock = null;
    }
    this.root.innerHTML = '';
    this.root.classList.add('hidden');
    this.currentScreen = '';
    $('focus-fx')?.classList.remove('active');
  }

  // ---------------------------------------------------------------- title
  patient() {
    if (this.game.patient) return this.game.patient;
    if (this.game.ensurePreview) return this.game.ensurePreview().patient;
    return PATIENT;
  }

  showTitle() {
    const p = this.patient();
    const best = this.game.meta.bestGrade ? `BEST GRADE ${this.game.meta.bestGrade}` : 'NO COMPLETED CASES';
    const cp = this.game.checkpoint;
    const canContinue = !!cp;
    // Name the subject on the continue card. The chart beside it shows the next
    // case, so a bare organ name made Continue look like it opened the wrong
    // patient's file.
    const cpName = cp?.patient ? `${esc(cp.patient.name)} // ` : '';
    this.showScreen(
      `<section class="screen title-screen">
        ${topline('CASE OPEN', 'NEXUS UNIVERSITY HOSPITAL', 'SURGICAL SERVICES')}
        <div class="title-body">
          <div class="title-left" data-case="CASE ${esc(p.caseNo)}">
            <span class="kicker">SURGICAL SERVICES // CASE ${esc(p.caseNo)} // CONFIDENTIAL</span>
            <h1 class="game-title"><span>MICRO</span><span class="stroke">CURE</span></h1>
            <div class="title-sub"><i></i><span>VITAL SIGN</span></div>
            <p class="tagline">The body is the level.</p>
            <div class="title-actions">
              <button class="menu-btn primary" data-action="begin"><span>01</span><b>BEGIN CASE</b><em>${esc(p.name)} // CRITICAL</em></button>
              ${canContinue ? `<button class="menu-btn continue" data-action="continue"><span>↳</span><b>CONTINUE CASE</b><em>${cpName}${ORGANS[cp.organId]?.name || 'CASE 001'} // ${cp.stage === 'interorgan' ? 'ROUTE CHOICE' : 'IN PROGRESS'}</em></button>` : ''}
              <button class="menu-btn" data-action="hub"><span>02</span><b>CASE BOARD</b></button>
              <button class="menu-btn" data-action="manual"><span>03</span><b>CONTROLS</b></button>
              <button class="menu-btn" data-action="settings"><span>04</span><b>SETTINGS</b></button>
            </div>
          </div>
          <aside class="title-aside">
            <div class="title-specimen" data-case="CASE ${esc(p.caseNo)}">
              <div class="specimen-head"><span>PATIENT CHART</span><b>CRITICAL</b></div>
              <div class="specimen-scan" aria-hidden="true"></div>
              ${scanSvg(p)}
              <div class="specimen-foot"><b>${esc(p.last)}, ${esc(p.first)}</b><span>${p.age} Y / ${esc(p.sex)}</span></div>
            </div>
            <div class="title-record">MRN ${esc(p.mrn)} · ADMITTED 03:58<br>${best}${this.game.meta.bestScore ? ` · BEST ${String(this.game.meta.bestScore).padStart(6, '0')} PTS` : ''}</div>
            <div class="title-version">${GAME.version}</div>
          </aside>
        </div>
        <footer class="title-footer">
          <span>DEPARTMENT OF INTERNAL MEDICINE // CONFIDENTIAL</span>
          <span>KEYBOARD + MOUSE</span>
          <span id="title-clock">SHIFT 00:00:00</span>
          <span>RECORDS STORED ON THIS WORKSTATION</span>
        </footer>
      </section>`,
      'title'
    );
    // A running shift clock. Small, but it turns a poster into a place where
    // time is passing while you decide.
    const tickClock = () => {
      const el = document.getElementById('title-clock');
      if (!el) {
        if (this._titleClock) clearInterval(this._titleClock);
        this._titleClock = null;
        return;
      }
      const now = new Date();
      el.textContent = `SHIFT ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
    };
    tickClock();
    if (this._titleClock) clearInterval(this._titleClock);
    this._titleClock = setInterval(tickClock, 1000);
  }

  // ---------------------------------------------------------------- hub
  showHub() {
    const p = this.patient();
    const preview = this.game.preview;
    const m = this.game.meta;
    const tier = this.game.caseTier ? this.game.caseTier() : 1;
    const best = m.bestGrade || '—';
    const medalCount = MEDALS.filter((medal) => m.medals?.[medal.id]).length;
    const route = (preview?.organs || this.game.run?.organs || ['lung', 'heart']).map((id) => ORGANS[id]?.name).join(' → ');
    const protocol = preview?.protocol || this.game.run?.protocol || PROTOCOLS[0];
    const research = RESEARCH.map((r) => {
      const owned = m.unlocked.includes(r.id);
      const can = m.rp >= r.cost;
      return `<article class="research-row ${owned ? 'owned' : ''}">
        <div class="research-copy">
          <div class="research-head"><span>${r.id.toUpperCase()}</span><h4>${esc(r.name)}</h4></div>
          <p>${esc(r.desc)}</p>
        </div>
        <div class="research-act">
          <b>${owned ? 'IN SERVICE' : `${r.cost} RP`}</b>
          ${owned ? '' : `<button class="mini-btn" data-action="research" data-id="${r.id}" ${can ? '' : 'disabled'}>${can ? 'APPROVE' : 'NEED RP'}</button>`}
        </div>
      </article>`;
    }).join('');
    const directives = DIRECTIVES.map((d) => {
      const value = Math.min(d.target, m.stats?.[d.stat] || 0);
      const done = m.claimed.includes(d.id);
      return `<article class="directive-card ${done ? 'done' : ''}">
        <div class="directive-head"><span>${done ? 'COMPLETE' : 'IN PROGRESS'}</span><b>+${d.reward} RP</b></div>
        <h4>${esc(d.name)}</h4>
        <p>${esc(d.desc)}</p>
        <div class="directive-meter"><i style="width:${(value / d.target) * 100}%"></i></div>
        <div class="directive-foot"><b>${value}</b><span>/ ${d.target}</span></div>
      </article>`;
    }).join('');

    this.showScreen(
      `<section class="screen hub-screen">
        ${topline('CASE BOARD', 'NEXUS UNIVERSITY HOSPITAL', 'SURGICAL THEATRE 03')}
        <div class="hub-body">
          <div class="hub-heading">
            <span class="kicker">SHIFT BOARD // 06:12</span>
            <h2>ONE PATIENT.<br><em>ONE WINDOW.</em></h2>
            <p>Research carries forward. The infection does not.</p>
          </div>
          <div class="hub-grid">
            <section class="case-board">
              <div class="section-head"><span>01</span><h3>ACTIVE CASE</h3><em>1 OPEN</em></div>
              <article class="case-card">
                <span class="case-clip" aria-hidden="true"></span>
                <div class="case-card-top">
                  <span class="case-number">CASE ${esc(p.caseNo)} // ${esc(p.name)}</span>
                  <span class="critical-tag">CRITICAL // TIER ${tier}</span>
                </div>
                <h3>${esc(p.name)} <span>${p.age}</span></h3>
                <p class="case-condition">${esc(p.condition)}</p>
                <p class="case-copy">${esc(p.summary)}</p>
                <p class="case-route">${esc(route)}</p>
                <div class="case-route-map">${routeMapSvg(preview?.organs || ['lung', 'heart'])}</div>
                <div class="protocol-slip" title="${esc(protocol.host)}">
                  <div class="protocol-slip-head"><span>${esc(protocol.code)} // CASE PROTOCOL</span><em>SCORE ×${(protocol.scoreMult || 1).toFixed(2)}</em></div>
                  <b>${esc(protocol.name)}</b>
                  <p>${esc(protocol.desc)}</p>
                </div>
                <div class="case-meta">
                  <div><span>BEST GRADE</span><b>${best}</b></div>
                  <div><span>CASES</span><b>${m.completed || 0}</b></div>
                  <div><span>RESEARCH</span><b>${m.rp || 0} RP</b></div>
                  <div><span>BEST SCORE</span><b>${String(m.bestScore || 0).padStart(6, '0')}</b></div>
                  <div><span>MEDALS</span><b>${medalCount}/${MEDALS.length}</b></div>
                </div>
                <div class="case-filing">
                  <span class="case-barcode" aria-hidden="true"></span>
                  <span class="case-stamp">NEXUS // INTERNAL</span>
                </div>
                <button class="cta" data-action="begin"><span>START CASE</span><i>→</i></button>
              </article>
              <div class="hub-medals">
                <div class="medal-head"><span>WARD MEDAL CASE</span><em>${medalCount} / ${MEDALS.length}</em></div>
                <div class="medal-list">
                  ${MEDALS.map((medal) => `<span class="medal ${m.medals?.[medal.id] ? 'earned' : ''}" title="${esc(medal.desc)}"><i></i>${esc(medal.name)}</span>`).join('')}
                </div>
              </div>
              <div class="locked-case">
                <div><span>OUTBREAK WARD</span><b>LOCKED</b></div>
              </div>
            </section>
            <aside class="research-panel">
              <div class="section-head"><span>02</span><h3>REQUISITIONS</h3><em>${m.rp || 0} RP</em></div>
              <div class="research-list">${research}</div>
            </aside>
          </div>
          <section class="directive-section">
            <div class="section-head"><span>03</span><h3>WARD DIRECTIVES</h3><em>${m.claimed.length}/${DIRECTIVES.length} COMPLETE</em></div>
            <div class="directive-grid">${directives}</div>
          </section>
        </div>
        <footer class="hub-footer">
          <button class="text-btn" data-action="title">← TITLE</button>
          <button class="text-btn" data-action="manual">CONTROLS</button>
          <button class="text-btn" data-action="settings">SETTINGS</button>
          <span>RECORDS SAVED ON THIS WORKSTATION</span>
        </footer>
      </section>`,
      'hub'
    );
  }

  // ---------------------------------------------------------------- case file
  showCaseFile() {
    const p = this.patient();
    const preview = this.game.ensurePreview ? this.game.ensurePreview() : this.game.preview;
    const route = (preview?.organs || ['lung', 'heart']).map((id) => ORGANS[id]?.name).join(' → ');
    const protocol = preview?.protocol || PROTOCOLS[0];
    const tier = this.game.caseTier ? this.game.caseTier() : 1;
    this.showScreen(
      `<section class="screen case-screen">
        ${topline('PATIENT CHART', 'NEXUS UNIVERSITY HOSPITAL', `CASE ${p.caseNo} // TIER ${tier} // ${p.condition.split('·')[0].trim().toUpperCase()}`)}
        <div class="case-layout">
          <aside class="patient-portrait">
            <span class="kicker">SUBJECT RECORD</span>
            <div class="portrait-frame">
              ${scanSvg(p)}
              <div class="portrait-tag">CT THORAX</div>
            </div>
            <h3>${esc(p.name)}</h3>
            <p>${p.age} // ${esc(p.sex)} // ${esc(p.blood)} // ${esc(p.weight)}</p>
            <div class="vitals-grid">
              ${p.vitals.map(([k, v, u]) => `<div><span>${k}</span><b>${v}</b><em>${u}</em></div>`).join('')}
            </div>
            <div class="portrait-status"><i></i>${esc(p.status)}</div>
          </aside>
          <article class="patient-document">
            <div class="doc-head">
              <span class="kicker">CASE ${esc(p.caseNo)} // ${esc(p.occupation)}</span>
              <h2>${esc(p.name)}<br><em>CRITICAL.</em></h2>
              <p class="doc-condition">${esc(p.condition)}</p>
            </div>
            <p class="doc-lede">${esc(p.summary)}</p>
            <p class="doc-route">ROUTE // ${esc(route)}</p>
            <div class="doc-protocol" title="${esc(protocol.host)}">
              <span>${esc(protocol.code)} // CASE PROTOCOL</span>
              <b>${esc(protocol.name)}</b>
              <em>${esc(protocol.tag)} · SCORE ×${(protocol.scoreMult || 1).toFixed(2)}</em>
            </div>
            <div class="warning-strip">
              <span>HOST INTEGRITY</span>
              <p>Shots and missed cauteries damage the patient. At zero, the case ends.</p>
            </div>
            <div class="doc-actions">
              <button class="text-btn" data-action="case-back">← CASE BOARD</button>
              <button class="cta" data-action="authorize"><span>PRE-OP CHECK</span><i>→</i></button>
            </div>
            <div class="doc-signature">
              <div>
                <span>SURGEON</span>
                <svg class="doc-signature-mark" viewBox="0 0 150 26" aria-hidden="true">
                  <path d="M3 19c8-12 10 3 16-4 4-5 2 9 9 4 6-4 3-11 9-9 5 2 1 11 7 10 7-1 5-13 13-10 6 2 3 12 10 10 6-2 2-9 8-7 5 2 2 8 9 7 5-1 7-8 13-6 5 1 3 7 9 6 5-1 7-6 12-4 4 1 3 5 7 5" />
                </svg>
              </div>
              <div><span>MRN</span><b>${esc(p.mrn)}</b></div>
              <div><span>DATE</span><b>30 OCT 2026</b></div>
            </div>
          </article>
        </div>
      </section>`,
      'case'
    );
  }

  // ---------------------------------------------------------------- loadout
  showLoadout() {
    const p = this.patient();
    const preview = this.game.ensurePreview ? this.game.ensurePreview() : this.game.preview;
    const route = preview?.organs || ['lung', 'heart'];
    const mutation = MUTATIONS.find((m) => m.id === p.mutationId) || MUTATIONS[0];
    const protocol = preview?.protocol || PROTOCOLS[0];
    const hostMax = Math.max(25, HOST.max + (mutation.startHost || 0) + (this.game.meta.unlocked.includes('host') ? 10 : 0) + (protocol.hostMax || 0));
    const selected = DISCIPLINES.find((d) => d.id === this.selectedDiscipline) || DISCIPLINES[0];
    const protocolAmmo = Math.round(WEAPON.reserve * ((protocol.ammoMult || 1) - 1));
    const reserve = WEAPON.reserve + (this.game.meta.unlocked.includes('reserve') ? 60 : 0) + (selected.mods.reserve || 0) + protocolAmmo;
    const disciplineCards = DISCIPLINES.map(
      (d, idx) => `<button class="discipline-card ${d.id === selected.id ? 'selected' : ''}" data-action="discipline" data-id="${d.id}">
        <div class="disc-top"><span>${String.fromCharCode(65 + idx)}</span><b>${d.tag}</b></div>
        <h3>${esc(d.name)}</h3>
        <p>${esc(d.blurb)}</p>
        <ul>${d.loadout.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
        <i class="select-mark">${d.id === selected.id ? 'SELECTED' : 'SELECT'}</i>
      </button>`
    ).join('');

    this.showScreen(
      `<section class="screen loadout-screen">
        ${topline('PRE-OP', 'NEXUS UNIVERSITY HOSPITAL', 'SURGICAL THEATRE 03')}
        <div class="loadout-layout">
          <div class="loadout-main">
            <span class="kicker">02 // PRE-OP CHECK</span>
            <h2>SELECT<br><em>SURGEON.</em></h2>
            <p class="loadout-lede">Loadout changes are free between cases.</p>
            <div class="discipline-grid">${disciplineCards}</div>
            <div class="equipment-strip">
              <div><span>PRIMARY</span><b>${selected.weapon?.name || WEAPON.name}</b><em>${WEAPON.mag} / ${reserve} · TISSUE-SAFE</em></div>
              <div><span>TOOL</span><b>CAUTERY CHARGE</b><em>ACQUIRE IN ORGAN 1</em></div>
              <div><span>DEFENSE</span><b>JUMP · DASH · STABILIZER</b><em>SPACE / SHIFT / Q</em></div>
              <div class="protocol-cell"><span>PROTOCOL</span><b>${esc(protocol.name)}</b><em>${esc(protocol.tag)} · SCORE ×${(protocol.scoreMult || 1).toFixed(2)}</em></div>
            </div>
          </div>
          <aside class="loadout-side">
            <div class="patient-mini">
              <span>SUBJECT ${esc(p.caseNo)}</span>
              <h3>${esc(p.name)}</h3>
              <p>${esc(p.status)}</p>
              <div class="mini-meter"><i style="width:26%"></i></div>
            </div>
            <div class="primer">
              <span class="kicker">HOST INTEGRITY</span>
              <h4>THE PATIENT<br><em>CAN DIE.</em></h4>
              <p>Shots damage ${esc(p.pronoun?.object || 'the patient')}. Stabilizers heal ${esc(p.pronoun?.object || 'the patient')}.</p>
              <div class="primer-row"><span>HOST</span><b>${hostMax}</b><em>INTEGRITY</em></div>
              <div class="primer-row"><span>STABILIZERS</span><b>${selected.mods.extraStabilizer + PLAYER.stabilizers + (this.game.meta.unlocked.includes('stabilizer') ? 1 : 0) + (protocol.stabilizers || 0)}</b><em>CHARGES</em></div>
              <div class="primer-row"><span>MEDKITS</span><b>${PLAYER.medkits + selected.mods.extraMedkit + (mutation.extraMedkit || 0) + (this.game.meta.unlocked.includes('medkit') ? 1 : 0)}</b><em>DOSES</em></div>
            </div>
            <div class="loadout-notes">
              <div><span>DIFFICULTY</span><b>FIXED</b></div>
            </div>
          </aside>
        </div>
        <footer class="loadout-footer">
          <button class="text-btn" data-action="loadout-back">← PATIENT CHART</button>
          <div class="inject-cta">
            <span>${route.map((id) => esc(ORGANS[id].name)).join(' → ')}</span>
            <button class="cta" data-action="inject"><span>INJECT</span><i>↘</i></button>
          </div>
        </footer>
      </section>`,
      'loadout'
    );
  }

  // ---------------------------------------------------------------- inter-organ
  showInterOrgan(data) {
    if (data) {
      const isNew = data !== this.interorgan;
      this.interorgan = data;
      if (isNew) {
        this.selectedAdaptation = null;
        this.selectedRoute = null;
      }
    }
    const d = this.interorgan;
    if (!d) return;
    const offers = d.adaptations?.length ? d.adaptations : ADAPTATIONS;
    const adapts = offers.map((a) => {
      const selected = this.selectedAdaptation === a.id;
      return `<button class="adapt-card ${selected ? 'selected' : ''}" data-action="adapt" data-id="${a.id}">
        <div class="adapt-top"><span>${a.branch.toUpperCase()}</span><b>${selected ? 'INSTALLED' : 'INSTALL'}</b></div>
        <h4>${esc(a.name)}</h4>
        <p>${esc(a.desc)}</p>
      </button>`;
    }).join('');
    const routes = ROUTES.map((r) => {
      const selected = this.selectedRoute === r.id;
      return `<button class="route-card ${selected ? 'selected' : ''}" data-action="route" data-id="${r.id}">
        <div><span>${esc(r.tag)}</span><b>${selected ? 'ROUTE LOCKED' : 'SELECT ROUTE'}</b></div>
        <h4>${esc(r.name)}</h4>
        <p>${esc(r.desc)}</p>
      </button>`;
    }).join('');
    const shortName = {
      lung: 'LUNG', heart: 'HEART', liver: 'LIVER', kidney: 'KIDNEY',
      brain: 'CEREBRUM', marrow: 'MARROW', intestine: 'INTESTINE', lymph: 'LYMPH',
    }[d.organId] || d.organName;
    const ready = this.selectedAdaptation && this.selectedRoute;
    this.showScreen(
      `<section class="screen interorgan-screen">
        ${topline('ORGAN CLEARED', 'NEXUS UNIVERSITY HOSPITAL', 'TRANSITION // STABLE')}
        <div class="inter-head">
          <span class="kicker">ORGAN ${String(d.organIndex || 1).padStart(2, '0')} / ${String(d.organTotal || 2).padStart(2, '0')} CLEARED // ${esc(d.organName)}</span>
          <h2>${esc(shortName)}<br><em>IS CLEAR.</em></h2>
          <p>${esc(d.copy)}</p>
          <div class="inter-stats">
            <div><span>HOST</span><b>${Math.round(d.host)}</b><em>INTEGRITY</em></div>
            <div><span>NODES</span><b>${d.nodesCleared}/${d.nodesTotal}</b><em>CLEARED</em></div>
            <div><span>CLEAN</span><b>${d.clean}</b><em>CAUTERIES</em></div>
            <div><span>TIME</span><b>${formatClock(d.time)}</b><em>IN ORGAN</em></div>
          </div>
        </div>
        <div class="inter-grid">
          <section class="inter-section">
            <div class="section-head"><span>01</span><h3>ADAPTATION</h3><em>CHOOSE ONE // ${d.installed || 0} INSTALLED</em></div>
            <div class="adapt-grid">${adapts}</div>
          </section>
          <section class="inter-section">
            <div class="section-head"><span>02</span><h3>ROUTE</h3><em>CHOOSE ONE</em></div>
            <div class="route-list">${routes}</div>
          </section>
        </div>
        <footer class="inter-footer">
          <span>${ready ? 'INJECTION READY.' : 'SELECT ONE OF EACH.'}</span>
          <button class="cta" data-action="descend" ${ready ? '' : 'disabled'}><span>ENTER ${esc(d.nextName || 'HEART')}</span><i>↘</i></button>
        </footer>
      </section>`,
      'interorgan'
    );
  }

  // ---------------------------------------------------------------- debrief / fail
  showDebrief(data) {
    const p = data.patient || this.patient();
    const grade = GRADES.find((g) => g.grade === data.grade) || GRADES[GRADES.length - 1];
    this.showScreen(
      `<section class="screen debrief-screen">
        ${topline('CASE CLOSED', 'NEXUS UNIVERSITY HOSPITAL', 'OPERATIVE NOTE // SEALED')}
        <div class="debrief-layout">
          <div class="grade-panel">
            <span class="kicker">CURE GRADE</span>
            <div class="grade-letter">${data.grade}</div>
            <h3>${esc(grade.title)}</h3>
            <p>${esc(grade.note)}</p>
            <div class="grade-seed"><span>SEED</span><b>${esc(shortSeed(data.seed))}</b></div>
          </div>
          <div class="debrief-document">
            <span class="kicker">CASE ${esc(p.caseNo)} // TIER ${data.tier || 1} // ${esc(p.name)}</span>
            <h2>${data.patientAlive ? 'PATIENT<br><em>STABLE.</em>' : 'PATIENT<br><em>LOST.</em>'}</h2>
            <p class="debrief-lede">${esc(data.outcome)}</p>
            <div class="debrief-stats">
              <div><span>HOST INTEGRITY</span><b>${Math.round(data.host)}</b><em>/ ${Math.round(data.hostMax || 100)}</em></div>
              <div><span>TIME</span><b>${formatClock(data.time)}</b><em>${data.parTime ? `PAR ${formatClock(data.parTime)}` : 'TOTAL'}</em></div>
              <div><span>COLLATERAL</span><b>${Math.round(data.collateral)}</b><em>INTEGRITY LOST</em></div>
              <div><span>INFECTION</span><b>${data.nodesCleared}/${data.nodesTotal}</b><em>NODES</em></div>
              <div><span>CLEAN CAUTERIES</span><b>${data.clean}</b><em>PROCEDURES</em></div>
              <div><span>ACCURACY</span><b>${data.accuracy}%</b><em>SHOTS</em></div>
            </div>
            <div class="debrief-scoreline"><span>RUN SCORE</span><b>${String(data.score || 0).padStart(6, '0')}</b><em>BEST ${String(this.game.meta.bestScore || 0).padStart(6, '0')}</em></div>
            ${data.protocol ? `<div class="debrief-protocol"><span>${esc(data.protocol.code)} // ${esc(data.protocol.name)}</span><b>SCORE ×${(data.scoreMult || 1).toFixed(2)}</b><em>+${data.protocolRp || 0} RP INCLUDED</em></div>` : ''}
            <div class="medal-strip">
              <div class="medal-head"><span>FIELD MEDALS</span><em>${(data.medals || []).length} / ${MEDALS.length}</em></div>
              <div class="medal-list">
                ${MEDALS.map((m) => `<span class="medal ${(data.medals || []).includes(m.id) ? 'earned' : ''}" title="${esc(m.desc)}"><i></i>${esc(m.name)}</span>`).join('')}
              </div>
            </div>
            <div class="research-earned"><span>RESEARCH EARNED</span><b>+${data.research}</b><em>RP</em></div>
            <div class="debrief-actions">
              <button class="text-btn" data-action="debrief-hub">← CASE BOARD</button>
              <button class="cta" data-action="retry"><span>NEW CASE</span><i>↻</i></button>
            </div>
          </div>
        </div>
      </section>`,
      'debrief'
    );
  }

  showFail(data) {
    this.showScreen(
      `<section class="screen fail-screen">
        ${topline('CASE TERMINATED', 'NEXUS UNIVERSITY HOSPITAL', 'TIME OF DEATH // PENDING')}
        <div class="fail-layout">
          <div class="fail-code">${esc(data.code || 'HOST LOST')}</div>
          <h2>${data.title || 'PATIENT<br><em>LOST.</em>'}</h2>
          <p>${esc(data.reason)}</p>
          <p class="fail-cause"><span>PROXIMATE CAUSE</span>${esc(data.cause || 'UNRECORDED')}</p>
          <div class="fail-stats">
            <div><span>HOST</span><b>${Math.round(data.host)}</b><em>INTEGRITY</em></div>
            <div><span>TIME</span><b>${formatClock(data.time)}</b><em>ELAPSED</em></div>
            <div><span>NODES</span><b>${data.nodesCleared}/${data.nodesTotal}</b><em>CLEARED</em></div>
            <div><span>SEED</span><b>${esc(shortSeed(data.seed))}</b><em>RUN</em></div>
          </div>
          <div class="fail-actions">
            <button class="text-btn" data-action="debrief-hub">← CASE BOARD</button>
            <button class="cta" data-action="retry"><span>NEW CASE</span><i>↻</i></button>
          </div>
          <span class="fail-foot">${esc(data.foot || 'CASE CLOSED // NO FURTHER ACTION.')}</span>
        </div>
      </section>`,
      'fail'
    );
  }

  // ---------------------------------------------------------------- pause / settings / manual
  showPause() {
    this.showScreen(
      `<section class="screen pause-screen">
        <div class="pause-panel">
          <span class="kicker">PROCEDURE PAUSED</span>
          <h2>PAUSED.</h2>
          <p>The organ will wait.</p>
          <div class="pause-menu">
            <button class="menu-btn primary" data-action="resume"><span>01</span><b>RESUME</b><em>ESC</em></button>
            <button class="menu-btn" data-action="settings"><span>02</span><b>SETTINGS</b></button>
            <button class="menu-btn" data-action="manual"><span>03</span><b>CONTROLS</b></button>
            <button class="menu-btn" data-action="restart"><span>04</span><b>RESTART CASE</b><em>NEW SEED</em></button>
            <button class="menu-btn danger" data-action="abandon"><span>05</span><b>LEAVE CASE</b><em>RUN ENDS</em></button>
          </div>
          <div class="pause-footer"><span>HOST ${Math.round(this.game.run?.host ?? 100)}%</span><span>SEED ${this.game.run ? shortSeed(this.game.run.seed) : '—'}</span></div>
        </div>
      </section>`,
      'pause'
    );
  }

  showSettings(backFn) {
    this.settingsBack = backFn || (() => this.showTitle());
    const s = this.game.settings;
    // The track fill is a CSS variable so the slider reads as a real control on
    // the paper theme; a native range on cream is nearly invisible.
    const row = (label, key, min, max, step, val, suffix = '') => {
      const pct = Math.round(((val - min) / (max - min)) * 100);
      return `
      <label class="setting-row">
        <span>${label}</span>
        <div class="setting-control">
          <input type="range" min="${min}" max="${max}" step="${step}" value="${val}" style="--fill:${pct}%" data-setting="${key}" aria-label="${label}" />
          <b data-value="${key}">${val}${suffix}</b>
        </div>
      </label>`;
    };
    this.showScreen(
      `<section class="screen settings-screen">
        ${topline('LOCAL CONFIG', 'NEXUS UNIVERSITY HOSPITAL', 'PREFERENCES')}
        <div class="settings-layout">
          <div class="settings-head"><span class="kicker">SYSTEM PREFERENCES</span><h2>SETTINGS</h2><p>Changes save to this browser.</p></div>
          <div class="settings-columns">
            <div class="settings-col">
            <section class="settings-group">
              <div class="section-head"><span>01</span><h3>INPUT</h3></div>
              ${row('MOUSE SENSITIVITY', 'sensitivity', 0.2, 2.5, 0.05, s.sensitivity, '×')}
              ${row('FIELD OF VIEW', 'fov', 65, 100, 1, s.fov, '°')}
              <label class="setting-row toggle"><span>INVERT VERTICAL LOOK</span><input type="checkbox" data-setting="invertY" ${s.invertY ? 'checked' : ''} /><i></i></label>
            </section>
            <section class="settings-group">
              <div class="section-head"><span>03</span><h3>AUDIO</h3></div>
              ${row('MASTER VOLUME', 'volume', 0, 1, 0.05, s.volume, '')}
              <p class="settings-note">The heartbeat follows the patient's integrity.</p>
            </section>
            <section class="settings-group save-group">
              <div class="section-head"><span>04</span><h3>RECORDS</h3></div>
              <div class="save-row"><div><span>LOCAL SAVE</span><b>${this.game.meta.runs || 0} RUNS · ${this.game.meta.rp || 0} RP</b></div><button class="mini-btn" data-action="export">EXPORT</button></div>
              <div class="save-row"><div><span>RESTORE</span><b>IMPORT A SAVE FILE</b></div><button class="mini-btn" data-action="import">IMPORT</button></div>
              <div class="save-row"><div><span>DANGER</span><b>ERASE RECORDS</b></div><button class="mini-btn danger" data-action="reset">RESET</button></div>
              <input type="file" id="import-file" accept="application/json" hidden />
            </section>
            </div>
            <div class="settings-col">
            <section class="settings-group">
              <div class="section-head"><span>02</span><h3>DISPLAY</h3></div>
              <label class="setting-row toggle"><span>HIGH CONTRAST</span><input type="checkbox" data-setting="highContrast" ${s.highContrast ? 'checked' : ''} /><i></i></label>
              <label class="setting-row toggle"><span>REDUCE MOTION</span><input type="checkbox" data-setting="reduceMotion" ${s.reduceMotion ? 'checked' : ''} /><i></i></label>
              <label class="setting-row toggle"><span>CHROMATIC / FILM GRAIN</span><input type="checkbox" data-setting="aberration" ${s.aberration ? 'checked' : ''} /><i></i></label>
              <label class="setting-row"><span>COLOR VISION</span><div class="setting-control"><select data-setting="colorVision">${[
                ['off', 'STANDARD'],
                ['deuteranopia', 'DEUTERANOPIA'],
                ['protanopia', 'PROTANOPIA'],
                ['tritanopia', 'TRITANOPIA'],
              ].map(([value, label]) => `<option value="${value}" ${s.colorVision === value ? 'selected' : ''}>${label}</option>`).join('')}</select></div></label>
              <label class="setting-row"><span>RENDER QUALITY</span><div class="setting-control"><select data-setting="quality">${['low', 'medium', 'high'].map((q) => `<option value="${q}" ${s.quality === q ? 'selected' : ''}>${q.toUpperCase()}</option>`).join('')}</select></div></label>
              ${row('SCREEN SHAKE', 'shake', 0, 1, 0.05, s.shake, '×')}
              <p class="settings-note">High contrast strengthens the HUD; reduce motion stills camera bob and shake. Color vision uses LMS daltonization in the grade pass and a safer HUD palette.</p>
            </section>
            </div>
          </div>
          <button class="cta" data-action="settings-back"><span>BACK</span><i>←</i></button>
        </div>
      </section>`,
      'settings'
    );
    this._bindSettingsInputs();
  }

  _bindSettingsInputs() {
    this.root.querySelectorAll('[data-setting]').forEach((input) => {
      const key = input.dataset.setting;
      const apply = (persist = false) => {
        let value;
        if (input.type === 'checkbox') value = input.checked;
        else if (input.tagName === 'SELECT') value = input.value;
        else value = parseFloat(input.value);
        this.game.updateSetting(key, value, persist);
        const out = this.root.querySelector(`[data-value="${key}"]`);
        if (out) {
          const suffix = key === 'sensitivity' ? '×' : key === 'fov' ? '°' : key === 'shake' ? '×' : '';
          out.textContent = `${value}${suffix}`;
        }
      };
      if (input.type === 'range') {
        // Keep the filled portion of the track in step with the thumb.
        const paint = () => {
          const min = parseFloat(input.min);
          const max = parseFloat(input.max);
          const pct = ((parseFloat(input.value) - min) / (max - min)) * 100;
          input.style.setProperty('--fill', `${pct}%`);
        };
        input.addEventListener('input', paint);
        // Preview live, but do not write localStorage on every pixel of a drag.
        input.addEventListener('input', () => apply(false));
        input.addEventListener('change', () => { apply(false); this.game.save(); });
      } else {
        input.addEventListener('change', () => { apply(true); });
      }
    });
    const file = $('import-file');
    if (file) {
      file.addEventListener('change', async () => {
        const f = file.files?.[0];
        if (!f) return;
        const back = this.settingsBack;
        const ok = await this.game.importSave(f);
        file.value = '';
        if (ok) {
          this.game.ui.toast('SAVE RESTORED', 'RESEARCH AND RECORDS LOADED', 'good');
          // Refresh the current screen instead of teleporting the UI to the hub
          // while the game may still be in the paused state.
          this.showSettings(back);
        } else {
          this.game.ui.toast('IMPORT FAILED', 'NOT A VALID MICROCURE SAVE', 'bad');
        }
      });
    }
  }

  closeSettings() {
    this.settingsBack = null;
  }

  showManual(backFn) {
    this.manualBack = backFn || (() => this.showTitle());
    this.showScreen(
      `<section class="screen manual-screen">
        ${topline('CONTROLS', 'NEXUS UNIVERSITY HOSPITAL', 'POCKET CARD')}
        <div class="manual-layout">
          <div class="manual-head"><span class="kicker">SURGICAL THEATRE 03</span><h2>POCKET CARD.</h2></div>
          <div class="manual-columns">
            <section class="manual-block">
              <div class="section-head"><span>01</span><h3>KEYBOARD + MOUSE</h3></div>
              <dl class="control-list">
                <dt>W A S D</dt><dd>Move — hold forward to sprint</dd>
                <dt>SHIFT</dt><dd>Dash — i-frames, stagger, rupture on contact</dd>
                <dt>SPACE</dt><dd>Jump — clear a hazard, slam a landing</dd>
                <dt>MOUSE</dt><dd>Look and aim</dd>
                <dt>LEFT MOUSE</dt><dd>Fire</dd>
                <dt>RIGHT MOUSE</dt><dd>Brace aim — tighter cone</dd>
                <dt>R</dt><dd>Reload — press R again in the band</dd>
                <dt>Q</dt><dd>Stabilize the host</dd>
                <dt>F</dt><dd>Medkit</dd>
                <dt>G</dt><dd>Fracture grenade</dd>
                <dt>V</dt><dd>Vital Focus — slow the infection</dd>
                <dt>E</dt><dd>Cautery / interact (hold)</dd>
                <dt>TAB</dt><dd>Repeat the active objective</dd>
                <dt>ESC</dt><dd>Pause / dismiss a field tip</dd>
              </dl>
            </section>
            <section class="manual-block">
              <div class="section-head"><span>02</span><h3>GAMEPAD</h3></div>
              <dl class="control-list">
                <dt>PAD STICKS</dt><dd>Move / look</dd>
                <dt>RT · LT</dt><dd>Fire · brace aim</dd>
                <dt>A</dt><dd>Jump</dd>
                <dt>R3</dt><dd>Dash</dd>
                <dt>X</dt><dd>Reload</dd>
                <dt>B</dt><dd>Stabilize</dd>
                <dt>Y</dt><dd>Medkit</dd>
                <dt>LB</dt><dd>Fracture grenade</dd>
                <dt>RB</dt><dd>Cautery / interact</dd>
                <dt>D-PAD · A · B</dt><dd>Menus · confirm · back; START pauses</dd>
              </dl>
            </section>
            <section class="manual-block">
              <div class="section-head"><span>03</span><h3>HOST INTEGRITY</h3></div>
              <ul class="manual-list">
                <li>Misses damage the patient. Aim clean.</li>
                <li>Infection nodes drain him until destroyed.</li>
                <li>Hold E for a clean cautery. Shooting costs ${HOST.shotNodeCost} integrity.</li>
                <li>Q restores ${PLAYER.stabilizeHeal}. At zero, the case ends.</li>
                <li>Weak points and clean cauteries charge V. Vital Focus slows the infection; the patient still bleeds.</li>
              </ul>
              <div class="section-head manual-sub"><span>04</span><h3>THE CASE</h3></div>
              <ul class="manual-list">
                <li>Find the Cautery Charge, clear every node, extract.</li>
                <li>Every organ has one signature hazard. Leave the ring before it fires.</li>
                <li>The clock is real. At zero, the host crashes.</li>
                <li>Death costs ${PLAYER.respawnHostCost} integrity and ${PLAYER.respawnTimeLoss} seconds. One re-injection.</li>
              </ul>
            </section>
          </div>
          <div class="manual-footer"><span>KEYBOARD + MOUSE</span><button class="cta" data-action="manual-back"><span>BACK</span><i>←</i></button></div>
        </div>
      </section>`,
      'manual'
    );
  }

  // ---------------------------------------------------------------- injection
  playInjection(organ, onDone) {
    const token = ++this.injectionToken;
    // The body-entry shot is 3D when the machine can afford it; the dossier
    // and CSS dive remain the fallback for reduced motion and low quality.
    const cinematic = this.game.beginInjection3D?.(organ) === true;
    this.injectionEl.classList.toggle('inject3d', cinematic);
    this.injectionEl.classList.remove('hidden');
    // Re-trigger the dive on every injection, not only the first one. Removing
    // the class and forcing a reflow restarts the CSS animations from zero.
    this.injectionEl.classList.remove('running');
    void this.injectionEl.offsetWidth;
    this.injectionEl.classList.add('running');
    const scale = $('inject-scale');
    // The dive has to read as shrinking, not as a loading card. Step the scale
    // through the powers as the needle travels; a static label told the player
    // the destination but not the transition.
    const scaleSteps = ['⁰', '⁻¹', '⁻²', '⁻³', '⁻⁴'];
    const finalScale = organ.id === 'heart' ? 3 : 4;
    if (scale) scale.textContent = '10⁰ m';
    const p = this.patient();
    $('injection-case').textContent = `CASE ${p.caseNo}`;
    $('injection-subject').textContent = p.name;
    const transBronchial = organ.id === 'lung';
    $('injection-route').textContent = transBronchial ? 'TRANS-BRONCHIAL' : 'VASCULAR SHUNT';
    $('injection-kicker').textContent = transBronchial ? 'TRANS-BRONCHIAL ENTRY' : 'ENDOVASCULAR ENTRY';
    $('injection-organ').textContent = organ.name;
    $('injection-line').textContent = organ.intro;
    $('injection-status').textContent = 'STERILIZING FIELD';
    $('injection-host').textContent = `${Math.round(this.game.run?.host ?? 100)}%`;
    $('inject-fill').style.width = '0%';
    $('inject-percent').textContent = '00';
    const lines = [
      [0, 'STERILIZING FIELD'],
      [18, 'MAPPING VASCULAR ROUTE'],
      [42, 'SYNCHRONIZING PULSE'],
      [68, 'ENTERING HOST'],
      [88, 'BEGINNING INTERVENTION'],
    ];
    const start = performance.now();
    const duration = 2400;
    const tick = (now) => {
      if (token !== this.injectionToken) return;
      const t = clamp((now - start) / duration, 0, 1);
      const pct = Math.floor(t * 100);
      $('inject-fill').style.width = `${pct}%`;
      $('inject-percent').textContent = String(pct).padStart(2, '0');
      if (scale) {
        const step = Math.min(finalScale, Math.floor(t * (finalScale + 1)));
        scale.textContent = `10${scaleSteps[step]} m`;
      }
      const line = lines.filter(([at]) => pct >= at).pop();
      if (line) $('injection-status').textContent = line[1];
      if (t < 1) {
        requestAnimationFrame(tick);
      } else {
        setTimeout(() => {
          if (token !== this.injectionToken) return;
          // Generate the organ and prewarm its shaders while this overlay is
          // still the last painted frame. The player sees a completed
          // injection, never a frozen title screen.
          onDone?.();
          if (token !== this.injectionToken) return;
          this.injectionEl.classList.add('hidden');
          this.injectionEl.classList.remove('running');
        }, 320);
      }
    };
    requestAnimationFrame(tick);
  }

  hideInjection() {
    this.injectionToken++;
    this.game.endInjection3D?.();
    this.injectionEl.classList.add('hidden');
    this.injectionEl.classList.remove('running');
    this.injectionEl.classList.remove('inject3d');
  }

  // Camera-adjacent feedback for movement. Both are presentation-only and are
  // removed by the reduced-motion preset in CSS.
  dashPulse() {
    const el = $('dash-fx');
    if (!el) return;
    el.classList.remove('fire');
    void el.offsetWidth;
    el.classList.add('fire');
  }

  landPulse(strength = 0.5) {
    const el = $('land-fx');
    if (!el) return;
    el.style.opacity = String(0.35 + clamp(strength, 0, 1) * 0.5);
    el.classList.remove('fire');
    void el.offsetWidth;
    el.classList.add('fire');
  }

  pulseHeart(strength = 0.5) {
    const el = $('heart-pulse');
    if (!el) return;
    el.classList.toggle('critical', strength > 0.66);
    el.classList.remove('beat');
    void el.offsetWidth;
    el.classList.add('beat');
  }

  // ---------------------------------------------------------------- HUD
  setHud(run, player, level, camera, dt) {
    if (!run || !player || !level || !camera) return;
    const set = (id, text) => {
      const el = $(id);
      if (el && this.lastHud[id] !== text) {
        el.textContent = text;
        this.lastHud[id] = text;
      }
    };
    const style = (id, prop, value) => {
      const el = $(id);
      if (el) el.style[prop] = value;
    };

    this._setText('hud-case', `CASE ${run.patient?.caseNo || '001'}`);
    this._setText('hud-patient', `${run.patient?.name || 'PATIENT'} // ${run.patient?.age || '—'}`);
    this._setText('hud-organ', ORGANS[level.organId]?.name || 'THEATRE');
    const host = clamp(run.host, 0, run.hostMax);
    set('host-value', String(Math.ceil(host)));
    set('host-max', `/${Math.round(run.hostMax)}`);
    style('host-bar', 'width', `${(host / run.hostMax) * 100}%`);
    style('host-ghost', 'width', `${(host / run.hostMax) * 100}%`);
    const hostState = host <= 20 ? 'CRITICAL' : host <= 40 ? 'UNSTABLE' : host <= 70 ? 'COMPROMISED' : 'STABLE';
    set('host-state', hostState);
    set('ekg-state', host <= 20 ? 'LEAD II // ARRHYTHMIA' : host <= 40 ? 'LEAD II // ECTOPY' : 'LEAD II // SINUS');
    $('host-state')?.setAttribute('data-state', hostState.toLowerCase());
    this.hud.classList.toggle('host-critical', host <= HOST.criticalWarning);
    this.hud.classList.toggle('aiming', !!player.aiming);

    set('hp-value', String(Math.ceil(player.hp)));
    style('hp-bar', 'width', `${(player.hp / player.maxHp) * 100}%`);
    // The surgeon now has the same escalating warning the patient always had.
    // Without it, a low bar looked exactly like a full one until the frame the
    // player died on.
    const hpFrac = clamp(player.hp / Math.max(1, player.maxHp), 0, 1);
    const surgeonCritical = hpFrac <= (PLAYER.criticalFrac ?? 0.34);
    this.hud.classList.toggle('surgeon-critical', surgeonCritical);
    $('surgeon-vignette')?.classList.toggle('on', surgeonCritical);
    if (!this.surgeonWarn) this.surgeonWarn = $('surgeon-warning');
    if (!this.surgeonRow) this.surgeonRow = document.querySelector('.surgeon-row');
    this.surgeonWarn?.classList.toggle('hidden', !surgeonCritical);
    if (surgeonCritical && this.surgeonWarn) {
      this.surgeonWarn.textContent = player.medkits > 0 ? 'VITALS FAILING // MEDKIT [F]' : 'VITALS FAILING // FIND A MEDKIT';
    }
    this.surgeonRow?.classList.toggle('critical', surgeonCritical);
    const nodesLeft = level.activeNodeCount ?? level.activeNodes().length;
    const totalNodes = level.nodes.length;
    set('infection-value', `${nodesLeft} NODE${nodesLeft === 1 ? '' : 'S'}`);
    // The bar shows infection still inside the organ, not work already done.
    // A full red bar at entry that drains as nodes are cleared matches the
    // "5 NODES" readout beside it.
    style('infection-bar', 'width', `${(nodesLeft / Math.max(1, totalNodes)) * 100}%`);
    set('timer', formatClock(run.timer));
    $('timer')?.classList.toggle('critical', run.timer <= 60);
    set('objective', level.getObjectiveText(player.pos));
    const crisis = level.crisis?.active ? level.crisis : null;
    this.setCrisisActive(!!crisis);
    if (crisis) {
      set('crisis-time', `${Math.max(0, crisis.timeLeft).toFixed(1)}S`);
      style('crisis-fill', 'width', `${clamp(crisis.timeLeft / Math.max(0.01, crisis.window || 1), 0, 1) * 100}%`);
    }
    set('minimap-room', level.currentRoom ? level.rooms.find((r) => r.id === level.currentRoom)?.name || '' : '');
    set('ammo-mag', String(player.ammoMag).padStart(2, '0'));
    set('ammo-reserve', String(player.ammoReserve));
    set('stabilizers', String(player.stabilizers));
    set('medkits', String(player.medkits));
    set('grenades', String(player.grenades));
    // Ability tiles now say why nothing happened: spent, cycling, or urgent.
    const abilityState = (id, count, cooldown, urgent) => {
      const el = $(id);
      if (!el) return;
      el.classList.toggle('empty', count <= 0);
      el.classList.toggle('cooling', cooldown > 0);
      el.classList.toggle('urgent', !!urgent && count > 0);
      el.style.setProperty('--cd', `${clamp(cooldown, 0, 1) * 100}%`);
    };
    abilityState('ability-stabilize', player.stabilizers, player.stabilizeCooldown);
    abilityState('ability-medkit', player.medkits, player.medkitCooldown, surgeonCritical);
    abilityState('ability-grenade', player.grenades, player.grenadeCooldown);
    set('cautery-state', player.hasCautery ? 'READY' : 'LOCKED');
    $('ability-cautery')?.classList.toggle('locked', !player.hasCautery);
    const weaponLabel = player.weaponLabel || player.weaponShort || 'BIO-VOLT';
    if (this.lastHud.weapon !== weaponLabel) {
      set('weapon-name', weaponLabel);
      this.lastHud.weapon = weaponLabel;
    }
    const dashPct = 100 - clamp(player.dashCooldown / PLAYER.dashCooldown, 0, 1) * 100;
    style('dash-bar', 'width', `${dashPct}%`);

    const focusCharge = clamp(run.focus || 0, 0, FOCUS.max);
    const focusActive = (this.game.focusTimer || 0) > 0;
    const focusReady = !focusActive && focusCharge >= FOCUS.max;
    const chain = run.chain || 0;
    const chainMultiplier = 1 + Math.min(SCORING.chainCap, chain) * SCORING.chainStep;
    const chainReadout = $('chain-readout');
    chainReadout?.classList.toggle('hot', chain >= 5);
    chainReadout?.classList.toggle('blazing', chain >= 10);
    // At rest the score strip is a black tab in the most valuable HUD real
    // estate. Keep it out of the way until there is a chain worth reading.
    chainReadout?.classList.toggle('dormant', chain <= 0 && (run.score || 0) < 1);
    set('chain-value', `×${chainMultiplier.toFixed(1)}`);
    style('chain-bar', 'width', `${chain ? clamp((run.chainTimer || 0) / SCORING.chainWindow, 0, 1) * 100 : 0}%`);
    set('run-score', String(Math.max(0, Math.round(run.score || 0))).padStart(6, '0'));

    const focusReadout = $('focus-readout');
    focusReadout?.classList.toggle('active', focusActive);
    focusReadout?.classList.toggle('ready', focusReady);
    style(
      'focus-bar',
      'width',
      `${focusActive ? clamp(this.game.focusTimer / FOCUS.duration, 0, 1) * 100 : (focusCharge / FOCUS.max) * 100}%`
    );
    set(
      'focus-state',
      focusActive ? `${this.game.focusTimer.toFixed(1)}S` : focusReady ? 'READY' : `${Math.round(focusCharge)}%`
    );
    $('focus-fx')?.classList.toggle('active', focusActive);

    const reloadTime = player.reloadTotal || WEAPON.reload * (player.reloadMult || 1);
    const reloadLine = $('reload-line');
    const reloadTiming = WEAPON.activeReload;
    style('reload-window', 'left', `${reloadTiming.start * 100}%`);
    style('reload-window', 'width', `${(reloadTiming.end - reloadTiming.start) * 100}%`);
    if (player.reloading) {
      const pct = clamp(1 - player.reloadTimer / reloadTime, 0, 1);
      const inWindow =
        !player.reloadMatched && !player.reloadMissed &&
        pct >= reloadTiming.start && pct <= reloadTiming.end;
      style('reload-bar', 'width', `${pct * 100}%`);
      set(
        'reload-label',
        player.reloadMatched
          ? 'LOAD MATCHED'
          : player.reloadMissed
            ? 'SEIZED — WAIT'
            : inWindow
              ? 'PRESS R // MATCH'
              : `RELOADING ${(reloadTime - player.reloadTimer).toFixed(1)}`
      );
      reloadLine?.classList.add('active');
      reloadLine?.classList.toggle('window', inWindow);
      reloadLine?.classList.toggle('matched', player.reloadMatched);
      reloadLine?.classList.toggle('jammed', player.reloadMissed);
    } else {
      style('reload-bar', 'width', player.ammoMag === 0 ? '0%' : '100%');
      set('reload-label', player.ammoMag === 0 ? 'EMPTY — R TO RELOAD' : 'TISSUE-SAFE');
      reloadLine?.classList.toggle('active', player.ammoMag === 0);
      reloadLine?.classList.remove('window', 'matched', 'jammed');
    }

    const spread = 5 + Math.min(18, player.moveSpeed * 1.8) + (player.reloading ? 8 : 0);
    this.hud.style.setProperty('--spread', `${spread}px`);

    // Interaction prompt.
    const prompt = $('interact-prompt');
    if (player.interaction) {
      prompt.classList.remove('hidden');
      set('interact-text', player.interaction.prompt);
      set('interact-key', player.channelProgress > 0 ? '…' : 'E');
      const isHold = player.interaction.type === 'gate' || player.interaction.type === 'node' || player.interaction.type === 'crisis';
      set('interact-sub', player.interaction.enabled ? (isHold ? 'HOLD' : 'PRESS') : 'LOCKED');
      $('interact-prompt')?.classList.toggle('locked', !player.interaction.enabled);
      $('interact-prompt')?.classList.toggle('channeling', player.channelProgress > 0);
      style('channel-bar', 'width', `${clamp(player.channelProgress / (player.channelTime || PLAYER.channelTime), 0, 1) * 100}%`);
    } else if (player.channelProgress > 0) {
      prompt.classList.remove('hidden');
      set('interact-text', 'CAUTERIZING');
      style('channel-bar', 'width', `${clamp(player.channelProgress / (player.channelTime || PLAYER.channelTime), 0, 1) * 100}%`);
    } else {
      prompt.classList.add('hidden');
    }

    // Objective cues: an edge-aware world marker plus a persistent bearing in
    // the objective block. The old marker vanished whenever the target left the
    // screen, which is exactly when the player needed it.
    const target = level.getObjectiveTarget(player.pos);
    this.updateObjectiveCue(camera, player, target);

    this.minimapAcc += dt;
    if (this.minimapAcc > 0.1) {
      this.minimapAcc = 0;
      this.drawMinimap(level, player);
    }
    if (run.boss) {
      set('boss-fill', '');
      style('boss-fill', 'width', `${(run.boss.hp / run.boss.maxHp) * 100}%`);
      set('boss-phase', `PHASE ${run.boss.phase + 1} // ${run.boss.def?.phaseNames?.[run.boss.phase] || BOSS.phases[run.boss.phase].name}`);
    }
  }

  updateObjectiveCue(camera, player, target) {
    const wp = $('waypoint');
    const bearingEl = $('objective-arrow');
    const distanceEl = $('objective-distance');
    if (!wp) return;
    if (!target) {
      wp.classList.add('hidden');
      if (bearingEl) bearingEl.textContent = '—';
      if (distanceEl) distanceEl.textContent = 'NO SIGNAL';
      return;
    }
    const labels = { tool: 'CAUTERY', node: 'INFECTION', boss: 'BIO-SIGNATURE', exit: 'EXTRACTION', crisis: 'RUPTURE' };
    const heights = { tool: 1.45, node: 1.2, boss: 2.1, exit: 1.3, crisis: 0.5 };
    const dist = Math.hypot(target.x - player.pos.x, target.z - player.pos.z);
    const world = new THREE.Vector3(target.x, heights[target.kind] ?? 1.2, target.z);
    const projected = world.clone().project(camera);
    const camSpace = world.clone().applyMatrix4(camera.matrixWorldInverse);
    const behind = camSpace.z > -0.06;
    let nx = projected.x;
    let ny = projected.y;
    const onScreen = !behind && projected.z < 1 && Math.abs(nx) < 0.84 && Math.abs(ny) < 0.78;
    if (behind) {
      nx = -camSpace.x;
      ny = -camSpace.y;
      const len = Math.hypot(nx, ny) || 1;
      nx /= len;
      ny /= len;
    }
    if (!onScreen) {
      const fit = Math.max(Math.abs(nx) / 0.84, Math.abs(ny) / 0.78, 1);
      nx /= fit;
      ny /= fit;
    }
    wp.classList.remove('hidden');
    wp.dataset.kind = target.kind;
    wp.dataset.edge = onScreen ? 'false' : 'true';
    // When the objective sits on the reticle, its label is noise over the shot.
    // Keep the diamond, drop the chip until the player looks away.
    wp.dataset.near = onScreen && Math.hypot(nx, ny) < 0.24 ? 'true' : 'false';
    wp.style.left = `${(nx * 0.5 + 0.5) * 100}%`;
    wp.style.top = `${(0.5 - ny * 0.5) * 100}%`;
    wp.style.setProperty('--wp-angle', `${Math.atan2(nx, ny)}rad`);
    this._setText('waypoint-label', labels[target.kind] || 'OBJECTIVE');
    this._setText('waypoint-distance', `${Math.max(1, Math.round(dist))}M`);

    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    forward.y = 0;
    if (forward.lengthSq() < 1e-6) forward.set(0, 0, -1);
    forward.normalize();
    const right = new THREE.Vector3(-forward.z, 0, forward.x);
    const dx = target.x - camera.position.x;
    const dz = target.z - camera.position.z;
    const bearing = Math.atan2(dx * right.x + dz * right.z, dx * forward.x + dz * forward.z);
    const glyphs = ['↑', '↗', '→', '↘', '↓', '↙', '←', '↖'];
    const idx = ((Math.round(bearing / (Math.PI / 4)) % 8) + 8) % 8;
    if (bearingEl) bearingEl.textContent = glyphs[idx];
    if (distanceEl) distanceEl.textContent = `${Math.max(1, Math.round(dist))} M`;
  }

  _setText(id, text) {
    const el = $(id);
    if (el && el.textContent !== text) el.textContent = text;
  }

  drawMinimap(level, player) {
    const canvas = $('minimap');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const map = level.getMap();
    const w = canvas.width;
    const h = canvas.height;
    // The map is drawn in canvas, so CSS high-contrast variables cannot reach
    // it. Boost luminance and contour strength here as well; no geometry or
    // objective data changes.
    const hc = !!this.game.settings?.highContrast;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = hc ? 'rgba(2, 3, 2, .98)' : 'rgba(18, 19, 15, .84)';
    ctx.fillRect(0, 0, w, h);
    const pad = 26;
    const bounds = map.bounds;
    const bw = Math.max(1, bounds.maxX - bounds.minX);
    const bh = Math.max(1, bounds.maxZ - bounds.minZ);
    const scale = Math.min((w - pad * 2) / bw, (h - pad * 2) / bh);
    const midX = (bounds.minX + bounds.maxX) / 2;
    const midZ = (bounds.minZ + bounds.maxZ) / 2;
    const tx = (x) => w / 2 + (x - midX) * scale;
    const tz = (z) => h / 2 + (z - midZ) * scale;
    const palette = ORGANS[level.organId].palette;

    ctx.strokeStyle = hc ? 'rgba(255,248,232,.72)' : 'rgba(226,211,178,.22)';
    ctx.lineWidth = hc ? 2 : 1;
    ctx.strokeRect(12, 12, w - 24, h - 24);
    ctx.font = '9px "IBM Plex Mono", monospace';
    ctx.fillStyle = hc ? 'rgba(255,248,232,.95)' : 'rgba(226,211,178,.58)';
    ctx.fillText('THEATRE MAP', 18, 26);
    ctx.fillText(shortSeed(level.seed), w - 70, h - 18);

    for (const c of map.corridors) {
      ctx.strokeStyle = hc ? 'rgba(255,248,232,.48)' : 'rgba(226,211,178,.2)';
      ctx.lineWidth = Math.max(3, c.width * scale * 0.8);
      ctx.beginPath();
      ctx.moveTo(tx(c.ax), tz(c.az));
      ctx.lineTo(tx(c.bx), tz(c.bz));
      ctx.stroke();
    }
    for (const r of map.rooms) {
      ctx.beginPath();
      ctx.arc(tx(r.x), tz(r.z), Math.max(5, r.r * scale), 0, Math.PI * 2);
      ctx.fillStyle = level.currentRoom === r.id
        ? (hc ? 'rgba(255,248,232,.34)' : 'rgba(226,211,178,.18)')
        : (hc ? 'rgba(255,248,232,.13)' : 'rgba(226,211,178,.06)');
      ctx.fill();
      ctx.strokeStyle = level.currentRoom === r.id
        ? 'rgba(255,248,232,.98)'
        : (hc ? 'rgba(255,248,232,.72)' : 'rgba(226,211,178,.38)');
      ctx.lineWidth = hc ? 2 : 1;
      ctx.stroke();
    }
    for (const g of map.gates) {
      if (g.open) continue;
      ctx.strokeStyle = g.requires === 'tool' ? 'rgba(232,163,74,.9)' : 'rgba(255,122,85,.9)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(tx(g.x) - 4, tz(g.z) - 4);
      ctx.lineTo(tx(g.x) + 4, tz(g.z) + 4);
      ctx.moveTo(tx(g.x) + 4, tz(g.z) - 4);
      ctx.lineTo(tx(g.x) - 4, tz(g.z) + 4);
      ctx.stroke();
    }
    const t = performance.now() / 1000;
    for (const n of map.nodes) {
      if (!n.active) continue;
      const active = level.nodes.find((x) => x.id === n.id)?.active;
      if (!active) continue;
      const pulse = 2.6 + Math.sin(t * 4 + n.x) * 1.2;
      ctx.fillStyle = hc ? '#ff9b86' : 'rgba(255,90,74,.95)';
      ctx.beginPath();
      ctx.arc(tx(n.x), tz(n.z), pulse + 1.4, 0, Math.PI * 2);
      ctx.fill();
      if (hc) {
        // A white contour keeps the infection visible by shape and luminance,
        // not by red-green separation alone.
        ctx.strokeStyle = '#fffaf0';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    }
    if (level.crisis?.active) {
      const cx = tx(level.crisis.x);
      const cz = tz(level.crisis.z);
      const pulse = 5 + Math.sin(t * 7.5) * 2.4;
      ctx.strokeStyle = 'rgba(255,74,58,.95)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx, cz, pulse + 3, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = '#ff5a46';
      ctx.beginPath();
      ctx.arc(cx, cz, 3.2, 0, Math.PI * 2);
      ctx.fill();
    }
    if (map.tool && !level.toolPickup?.collected) {
      ctx.fillStyle = 'rgba(214,195,157,.95)';
      const x = tx(map.tool.x), z = tz(map.tool.z);
      ctx.beginPath();
      ctx.moveTo(x, z - 4); ctx.lineTo(x + 4, z); ctx.lineTo(x, z + 4); ctx.lineTo(x - 4, z); ctx.closePath(); ctx.fill();
    }
    if (map.exit) {
      ctx.strokeStyle = level.allNodesCleared() ? 'rgba(238,225,197,.95)' : 'rgba(226,211,178,.3)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(tx(map.exit.x), tz(map.exit.z), 5, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (map.boss) {
      ctx.strokeStyle = 'rgba(255,90,60,.85)';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(tx(map.boss.x), tz(map.boss.z), 7, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(tx(map.boss.x) - 4, tz(map.boss.z) - 4);
      ctx.lineTo(tx(map.boss.x) + 4, tz(map.boss.z) + 4);
      ctx.moveTo(tx(map.boss.x) + 4, tz(map.boss.z) - 4);
      ctx.lineTo(tx(map.boss.x) - 4, tz(map.boss.z) + 4);
      ctx.stroke();
    }
    const px = tx(player.pos.x);
    const pz = tz(player.pos.z);
    const fx = -Math.sin(player.yaw);
    const fz = -Math.cos(player.yaw);
    ctx.fillStyle = '#f5ecdd';
    ctx.beginPath();
    ctx.moveTo(px + fx * 6, pz + fz * 6);
    ctx.lineTo(px + Math.cos(player.yaw) * 3.6, pz + Math.sin(player.yaw) * 3.6);
    ctx.lineTo(px - Math.cos(player.yaw) * 3.6, pz - Math.sin(player.yaw) * 3.6);
    ctx.closePath();
    ctx.fill();

    // Objective pulse.
    const target = level.getObjectiveTarget(player.pos);
    if (target) {
      ctx.strokeStyle = level.organId === 'heart' ? 'rgba(211,162,92,.62)' : 'rgba(226,211,178,.55)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(tx(target.x), tz(target.z), 8 + Math.sin(t * 3) * 2, 0, Math.PI * 2);
      ctx.stroke();
    }
    const pal = hexCss(palette.accent);
    ctx.fillStyle = pal;
    ctx.font = '8px "IBM Plex Mono", monospace';
    ctx.fillText(level.currentRoom ? level.rooms.find((r) => r.id === level.currentRoom)?.name.slice(0, 20) || '' : '', 18, h - 18);
  }

  hitmarker(weak = false) {
    const el = $('hitmarker');
    if (!el) return;
    el.classList.remove('show', 'weak');
    void el.offsetWidth;
    if (weak) el.classList.add('weak');
    el.classList.add('show');
    setTimeout(() => el.classList.remove('show', 'weak'), weak ? 150 : 90);
  }

  // A kill reads differently from a hit: same geometry, amber, one beat longer.
  hitmarkerKill() {
    const el = $('hitmarker');
    if (!el) return;
    el.classList.remove('show', 'weak', 'kill');
    void el.offsetWidth;
    el.classList.add('kill', 'show');
    clearTimeout(this._killMarkTimer);
    this._killMarkTimer = setTimeout(() => el.classList.remove('show', 'kill'), 220);
  }

  // Bearing in degrees, 0 = straight ahead, +90 = to the player's right.
  damageDirection(degrees) {
    const el = $('damage-dir');
    if (!el) return;
    el.style.setProperty('--dir', `${Math.round(degrees)}deg`);
    el.classList.remove('show');
    void el.offsetWidth;
    el.classList.add('show');
    // The animation is 0.72 s; clear the class after it so a second hit from
    // the same bearing can retrigger it.
    clearTimeout(this._damageDirTimer);
    this._damageDirTimer = setTimeout(() => el.classList.remove('show'), 760);
  }

  damageFlash(amount) {
    const el = $('damage-flash');
    if (!el) return;
    el.style.setProperty('--dmg', String(clamp(amount / 30, 0.35, 1)));
    el.classList.remove('hit');
    void el.offsetWidth;
    el.classList.add('hit');
  }

  // Close-range kills throw arterial matter across the visor. It is deliberately
  // edge-weighted so it never hides the reticle or an enemy silhouette.
  goreFlash(strength = 0.5) {
    const el = $('gore-flash');
    if (!el) return;
    el.style.setProperty('--gore', String(clamp(strength, 0.2, 0.8)));
    el.classList.remove('hit');
    void el.offsetWidth;
    el.classList.add('hit');
  }

  healFlash() {
    const el = $('heal-flash');
    if (!el) return;
    el.classList.remove('hit');
    void el.offsetWidth;
    el.classList.add('hit');
  }

  toast(title, text = '', kind = 'info', duration = 4200) {
    if (!this.toastLayer) return;
    const el = document.createElement('div');
    el.className = `toast ${kind}`;
    el.innerHTML = `<b>${esc(title)}</b>${text ? `<span>${esc(text)}</span>` : ''}`;
    this.toastLayer.appendChild(el);
    while (this.toastLayer.children.length > 4) this.toastLayer.firstElementChild.remove();
    requestAnimationFrame(() => el.classList.add('show'));
    setTimeout(() => {
      el.classList.remove('show');
      setTimeout(() => el.remove(), 400);
    }, duration);
    el.addEventListener('click', () => el.remove());
  }

  showSubtitle(speaker, text, duration = 9000) {
    const el = $('subtitle');
    if (!el) return;
    $('subtitle-speaker').textContent = speaker;
    $('subtitle-text').textContent = text;
    el.classList.remove('hidden');
    clearTimeout(this.subtitleTimer);
    this.subtitleTimer = setTimeout(() => el.classList.add('hidden'), duration);
  }

  hideSubtitle() {
    $('subtitle')?.classList.add('hidden');
  }

  showChapter(organ, name) {
    const el = $('chapter-card');
    if (!el) return;
    $('chapter-organ').textContent = organ;
    $('chapter-name').textContent = name;
    el.classList.remove('hidden', 'show');
    void el.offsetWidth;
    el.classList.add('show');
    clearTimeout(this.chapterTimer);
    this.chapterTimer = setTimeout(() => el.classList.add('hidden'), 4200);
  }

  showTutorial(text, duration = 9000) {
    const el = $('tutorial');
    if (!el) return;
    $('tutorial-text').textContent = text;
    el.classList.remove('hidden');
    clearTimeout(this.tutorialTimer);
    this.tutorialTimer = setTimeout(() => this.hideTutorial(), duration);
  }

  hideTutorial() {
    $('tutorial')?.classList.add('hidden');
    clearTimeout(this.tutorialTimer);
  }

  showBoss(boss) {
    const el = $('boss-bar');
    if (!el) return;
    this.bossDef = boss.def || BOSS;
    el.classList.remove('hidden');
    $('boss-name').textContent = this.bossDef.name;
    this.setBossPhase(0);
    this.setBossHealth(boss.hp, boss.maxHp);
  }

  hideBoss() {
    $('boss-bar')?.classList.add('hidden');
  }

  setBossHealth(hp, maxHp) {
    const el = $('boss-fill');
    if (el) el.style.width = `${clamp(hp / maxHp, 0, 1) * 100}%`;
  }

  setBossPhase(phase) {
    const el = $('boss-phase');
    const name = this.bossDef?.phaseNames?.[phase] || BOSS.phases[phase].name;
    if (el) el.textContent = `PHASE ${phase + 1} // ${name}`;
  }

  setPrompt() {
    // Reserved for contextual prompts that are not tied to an interactable.
  }

  fadeOut(cb, ms = 420) {
    this.fadeEl.style.transition = `opacity ${ms}ms ease`;
    this.fadeEl.style.opacity = '1';
    setTimeout(cb, ms);
  }

  fadeIn(ms = 520) {
    this.fadeEl.style.transition = `opacity ${ms}ms ease`;
    this.fadeEl.style.opacity = '0';
  }

  setFade(opacity) {
    this.fadeEl.style.transition = 'none';
    this.fadeEl.style.opacity = String(opacity);
  }
}
