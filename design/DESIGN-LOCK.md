# MICROCURE — CANONICAL DESIGN LOCK

**Version:** 1.0 · **Locked:** 30 October 2026  
**Source:** 82/82 answers in `microcure-design-lock.md`  
**Status:** approved direction; vertical slice in production  
**Working title:** *MICROCURE: VITAL SIGN*

> **The body is the level.**
>
> You are an elite nano-surgeon inside a dying patient. Kill the infection.
> Keep the host alive. Decide how much of a person you are willing to cut away.

---

## 1. Fingerprint

| Axis | Locked answer |
|---|---|
| Genre | Procedural metroidvania · first-person action |
| Camera | First-person 3D, free mouse aim |
| Look | Stylized low-poly, warm organic, visceral but readable |
| Platform | Web first, keyboard + mouse first-class |
| Session | 20–40 minutes per case |
| Difficulty | One brutal curated difficulty; accessibility assists are separate |
| Signature | **Host Integrity** |
| Structure | Linear case, metroidvania organ topology, seeded variation, rogue-lite meta |
| Ending | Endless case generation and mastery |
| Team | Solo + AI agent pipeline |
| Milestone | 1.0 vertical slice, then content scale |

### What "full-fledged" means

A complete case that can be played start to finish: title → case file → loadout →
two organs → boss → debrief → hospital meta → replay with new variables. No dead
screens, no placeholder interactions, no console errors, 60 fps on a laptop.

### What MicroCure must never become

- A mobile idle game, gacha, or timer wall.
- A power fantasy where the patient is scenery.
- A photoreal gore simulator. Visceral, clinical, stylized.
- A live-service game with battle passes or always-online requirements.

---

## 2. The design in one page

### Player fantasy

You are the best microsurgeon in the Nexus program. Calm hands. Impossible
technology. A war at cellular scale. The feeling is **precision under panic**:
delicate work while the organ screams around you.

### The signature rule: Host Integrity

The patient has a second health bar. It is not background decoration.

- Your shots that strike tissue cost **Host Integrity**. The Bio-Volt Rifle is
  tissue-safe: a wall hit costs only 0.12 integrity. Explosives and unsafe mods
  cost far more.
- Infection drains integrity continuously. Active infection nodes accelerate it.
- If Host Integrity reaches zero, the patient dies, even if you are alive.
- `Q` vents a **Stabilizer** charge: +12 integrity, limited charges per organ.
- Nodes can be shot (fast, costs integrity) or **cauterized** with the Cautery
  Tool (slower, clean, requires the ability and proximity).
- The debrief grades Host Integrity, time, collateral and clean cauterizations.

The rule changes aim, weapon choice, build, level layout and score at once.
It is the reason this is MicroCure and not a generic corridor shooter.

### The structure: procedural metroidvania

The macro topology is authored so ability gates are guaranteed. The micro layer
is generated per run: room proportions, props, enemy roster, loot, infection
placement and one case mutation are seeded.

- A case is a linear chain of 2–5 organs, 20–40 minutes.
- Each organ is a small metroidvania: a hub, optional branches, an ability gate,
  an infection objective, an extraction.
- Backtracking is short and purposeful (get tool → open gate → optional cache).
- Death costs the organ's clean status, not the whole run: you re-inject at the
  organ entrance with a Host Integrity penalty and one fewer injection.
- The final organ ends in a multi-phase boss.

### The core loop

```
NEXUS HUB
  case board → patient file → loadout (discipline, modules) → inject
      ↓
ORGAN 1..N
  explore → clear infection → find tool → open gate → survive timer → extract
  between organs: choose route modifier + one bio-adaptation
      ↓
BOSS ORGAN
  multi-phase spectacle → stabilize the patient
      ↓
DEBRIEF
  grade · collateral · clean cauteries · patient outcome · research
      ↓
HUB
  spend research on options (not raw power) → next case, new seed
```

### Pressure, not padding

- Each organ has an extraction countdown. At zero, the patient crashes.
- Infection nodes drain Host Integrity and spawn enemies until destroyed.
- Ammo is scarce; the scalpel is infinite but dangerous at close range.
- Medkits are limited. Stabilizers are the only way to heal the patient.
- Failure advances the story through scars and complications, not a game-over
  screen that erases the case.

---

## 3. Vertical slice — the only thing in production now

**One patient. Two organs. One boss. 20–30 minutes.**

| Beat | Content |
|---|---|
| Patient | **Elias Voss, 34.** Dockworker. Engineered infection. Case 001. |
| Organ 1 | **Left Lung — The Alveolar Fields.** Warm rose/cream, spores, wind, vertical alveoli. |
| Organ 2 | **Heart — The Ventricular Spire.** Crimson/gold, pulse, clot turrets, the Warden. |
| Boss | **The Thrombus Warden.** Three phases: calcified shield, rupture, fibrillation. |
| Tool gate | **Cautery Charge**, found in the lung's east branch. Opens membranes and seals nodes. |
| Run choice | **Aortic Direct** (faster timer, elite) vs **Vagal Bypass** (+medkit, +60s). |
| Adaptation | One of three between organs: Vasodilation, Suture, Overclock. |
| Meta | Hospital hub, 3 research options, local save + export/import. |
| Modes | Case 001 and Endless Outbreak (locked in slice, visible as roadmap). |

### Controls

| Input | Action |
|---|---|
| WASD | Move (momentum-based) |
| Mouse | Look / free aim |
| LMB | Fire |
| R | Reload |
| Space | Dash (i-frames, cooldown) |
| Shift | Sprint |
| Q | Stabilizer (heal host) |
| E | Cautery / context interaction |
| F | Medkit (heal self) |
| G | Grenade |
| Tab | Objective / patient file |
| Esc | Pause / settings |

### Slice acceptance tests

1. A new player can go from title to debrief without a dead end.
2. Host Integrity can be lost by careless fire and recovered with Stabilizer.
3. The Cautery gate is impossible before the tool and trivial after it.
4. The boss has three readable phases and can kill a careless player.
5. Death is recoverable once; patient death ends the case.
6. Save survives reload; settings persist; no console errors.
7. 60 fps at 1080p on integrated graphics at medium quality.
8. Every screen is keyboard- and mouse-complete; no unlabeled controls.

---

## 4. Resolving the contradictions in the 82 answers

The brief contains productive tensions. These are the rulings; they are part of
the lock, not open questions.

| Tension | Ruling |
|---|---|
| Metroidvania vs roguelite | **Procedural metroidvania.** Authored topology guarantees gates; seeded dressing, enemies and loot provide replay. Not a room-shuffle. |
| Linear case vs procedural | Case route is linear; organ interiors are seeded. One mutation per case changes a rule, not just numbers. |
| First-person vs "mouse twin-stick" | First-person free aim with mouse. Twin-stick language refers to the agility fantasy; no top-down camera. Gamepad right-stick maps to look in 1.0. |
| Flat power curve vs skill tree | **Horizontal adaptations.** Choices change behavior and risk, not a damage ladder. Meta research unlocks options. |
| Free respec vs run stakes | Loadout is changeable in the hub and at organ boundaries. Mid-organ commitment stands. |
| Endless cases vs 1 patient slice | Slice is one authored case. 1.0's generator assembles cases from 8 biome families and a content grammar. Endless is the mastery mode. |
| Brutal fixed difficulty vs accessibility | One curated combat tuning. Accessibility options (shake, FOV, sensitivity, colorblind, assist) never change enemy math or scores. |
| Cloud saves vs free static web | Slice: local save + portable export/import. 1.0: optional account-backed cloud save via a small backend. No always-online. |
| 8+ biomes vs solo + agents | Content is data-driven. 8 biome families at 1.0, each with one signature mechanic and a shared prop grammar. No unique bespoke cinematics per room. |
| Realism vs low-poly | Material truth, scale and silhouette clarity. Not photoreal texture density. Wet specular, subsurface warmth, readable enemy tells. |
| Web vs AAA | AAA is the polish bar, not the headcount. Browser-first, 60 fps, complete UX, no visible placeholders. Console/desktop wrapper is a later port, not the design center. |
| "Let the concept decide" engine | **Three.js + Vite.** Text-native, instant browser verification, agent-editable, no binary scenes. Exit path: portable game logic and data, not the renderer. |
| Antihero protagonist vs person to save | Dr. Mara Kade is complicit in the program that made the infection. She saves Elias because she needs him alive, then chooses whether to admit why. |

### The narrative spine

Nexus Medical's "Chorus" program engineered a regenerative symbiont. It escaped
into the transplant supply. Elias Voss is not random: his brother-in-law sold
Nexus the trial data. The patient files, in-organ graffiti and the Warden's
half-medical, half-military construction reveal the program. The final choice is
whether to publish the cure or bury it to keep the program alive. Endless mode is
the aftermath: one surgeon, an outbreak with no clean cases.

---

## 5. Art, audio and UI direction

**"Clinical baroque."** Warm organic cathedrals built from wet anatomy, lit like
an operating theatre. Antibiotic teal against venous crimson, bone cream, warning
amber. Strong silhouettes; restrained bloom; fog for depth; no neon cyberpunk.

- **Lung:** rose, cream, amber; glowing alveoli clusters; drifting spores; soft
  directional light; wide chambers; vertical membrane ribs.
- **Heart:** oxblood, muscle-fiber ridges, gold calcification, pulse lighting;
  tighter corridors; hanging chordae; ember particles.
- **Boss:** a clot grown around a surgical drone. Calcified plates, exposed core,
  tendrils. Readable weak points; telegraphs use amber, damage uses crimson.
- **UI:** diegetic medical instrumentation. Monospaced vitals, surgical crosshair,
  thin rules, scanline grain, no rounded mobile cards. All text legible at 1080p.
- **Audio:** procedural. Ambient sub-bass and breath; heartbeat that tracks host
  integrity; wet foley; rifle snaps with tail; warning tones; boss choir drone.
  No copyrighted samples. Every sound generated at runtime.
- **Camera:** 78° FOV, momentum, head bob, dash kick, hit shake. Chromatic
  aberration, vignette, grain and exposure pulse; all scalable/disableable.

---

## 6. Technical contract

- **Renderer:** Three.js (WebGL2) with ACES tone mapping, fog, bloom and a final
  grade/aberration/vignette pass.
- **Build:** Vite, ES modules, no framework. Static output deployable anywhere.
- **Simulation:** fixed 60 Hz step with accumulator; render interpolation where
  it matters. Seeded RNG (`mulberry32`) per case; the seed is shown in the debrief.
- **World:** walkable union of circles and capsules on a flat plane, generated
  from an authored room graph. Organic meshes are visual; collision is analytic.
  This guarantees reliable movement in procedural geometry.
- **Entities:** data-driven definitions in `src/content.js`; no gameplay numbers
  buried in mesh code.
- **Save:** versioned localStorage; export/import JSON. Never store secrets.
- **Performance:** pixel ratio cap 1.5; bloom optional; pooled particles; no
  dynamic shadow maps; target 60 fps at 1080p medium.
- **Accessibility:** sensitivity, invert Y, FOV, shake, volume, quality, reduced
  aberration. All persisted.
- **No external art/audio assets.** Everything is generated so the build is
  reproducible and license-clean. High-quality authored assets can replace
  generators later without touching gameplay code.

### Repository layout

```
/index.html            shell + UI mounts
/styles.css            diegetic UI, screens, HUD
/src/main.js           boot + fixed loop
/src/content.js        case, organs, weapons, enemies, adaptations
/src/utils.js          RNG, math, save, formatting
/src/audio.js          procedural sound + music
/src/level.js          organ graph, meshes, collision, props
/src/entities.js       player, enemies, pickups, projectiles, boss
/src/fx.js             particles, tracers, shake, damage feedback
/src/ui.js             screens, HUD, hub, settings, debrief
/scripts/audit.mjs     automated design/content/build audit
/design/…              lock, pipeline, legacy plan
```

---

## 7. 1.0 scope

| Content | 1.0 target |
|---|---|
| Cases | Endless generator + 10 authored case seeds |
| Organ families | 8 (lung, heart, brain, stomach, liver, kidney, marrow, eye) |
| Biome variants | 2 per family |
| Bosses | 8, one per family, multi-phase |
| Weapons | 8 chassis, 24 modules |
| Disciplines | 3 class kits |
| Adaptations | 40 horizontal choices |
| Mutations | 16 case rules |
| Modes | Case, Outbreak endless, Daily seed |
| Platform | Web (desktop), keyboard/mouse, gamepad |
| Saves | Local + optional cloud |
| Localization | English at launch; externalized strings |

**Anti-scope for 1.0:** co-op, PvP, open world, photoreal cinematics, voice
acting, mod support, mobile, console certification, live service.

### Production phases

1. **Slice (now):** one case, two organs, boss, hub, save. Prove feel.
2. **Systems:** content grammar, generator, 3 class kits, 8 weapons, boss framework.
3. **Content:** 8 biome families, 8 bosses, 10 case seeds, narrative pass.
4. **Polish:** accessibility, performance, audio mix, onboarding, playtests.
5. **Release:** static web build, cloud-save backend, demo, press kit.

Realistic timeline with a solo developer + agents: **12+ months to 1.0**, with
the slice at 4–6 weeks and a public demo at 5–6 months.

---

## 8. Definition of done

A build is done when:

- It boots with zero console errors and no network requests other than its own
  bundle.
- The full loop is playable twice with different seeds and no soft-locks.
- Host Integrity, the gate, the boss phases and failure states work as specified.
- 60 fps at 1080p medium on integrated graphics; no frame spikes over 33 ms.
- Every screen has a clear next action; no placeholder copy.
- Saves survive reload and export/import restores progress.
- `npm run audit` passes: content references, design parity, no debug leftovers,
  bundle budget, build success.
- A human has played it for 20 minutes and can explain Host Integrity afterward.

"Perfect" in this document means **complete and polished for its scope**, not
feature-complete against a AAA budget. Feature volume is scheduled, not promised.

---

## AMENDMENT 01 — Clinical realism in the front end

**Date:** 2026-10-30. **Rationale:** the first playable read as a science-fiction
console, not a hospital under pressure. The fiction is grounded: a surgical team,
a patient chart, a clock, an operating theatre. The interface must look like
equipment and paperwork a real hospital would own.

- Front-end screens (title, case board, chart, pre-op, transition, debrief,
  settings) are **paper and hospital systems**, not holograms: manila stock,
  typed forms, red clinical stamps, ballpoint annotations, clinical green.
- Drop neon glows, clipped sci-fi corners, sci-fi codenames and decorative
  telemetry from those screens. Keep the in-organ HUD dark and instrument-like,
  but warmer and flatter: white readouts, amber cautions, arterial red alarms.
- **Reading budget:** a screen gets a headline, one line of context and its
  controls. No paragraph over two lines. Lore stays optional in the world.
- All gameplay numbers, the fixed step, Host Integrity and the locked pillars
  are unchanged by this amendment.

---

## AMENDMENT 02 — Procedural cases and eight-organ routes

**Date:** 2026-10-30. **Rationale:** the vertical slice hardcoded one patient and
one lung→heart route, which makes repeat play a rehearsal of the same two rooms.
The design lock already calls for procedural cases and 8+ organ biomes; this
amendment records how those two requirements are met in the web build.

- Every case generates a patient, a condition, a mutation and a 2–4 organ route
  from the run seed. The first case still opens in the lung so the cautery and
  node loop can be taught before the route opens up.
- All eight organ biomes are playable. Each has a distinct procedural topology
  (alveolar branch, hepatic branch, renal ring, neural spiral, marrow ladder,
  intestinal coil, lymphatic branch, cardiac spire) and its own prop language and
  palette. Room jitter, node spread, props and enemy roster all come from the
  seed.
- The heart always closes the case, but its occupant changes between the Warden,
  the Calcified Choir and the Suture Saint: one rig, three pathologies, three
  palettes and three phase vocabularies.
- Later organs inherit the cautery charge; optional tool-gated rooms remain
  optional. The main route is never locked behind a tool the player can no
  longer obtain.
- Research now includes weapon, reserve, medkit and host upgrades. Case tiers
  scale enemy health, damage and speed without changing the fixed input or the
  Host Integrity rules.
- The first-person viewmodel has articulated gloved hands on the grip and
  foregrip, with a support-hand reload dip. This is presentation only.
- Each organ owns one signature environmental hazard (alveolar collapse, bile
  surge, pressure jet, dream lurch, trabecular snap, acid reflux, follicle
  burst, ventricular pulse). They telegraph on the floor, damage the surgeon
  suit, and only acid reflux and the ventricular pulse also touch Host
  Integrity, at the amounts declared in `ORGAN_HAZARDS`.

---

## AMENDMENT 03 — Replay depth: builds, strains and the long shift

**Date:** 2026-10-30. **Rationale:** a run needs more than a different palette to
survive repeated cases. This amendment records the replay layer added on top of
the procedural case: real build choices, enemy pathology, boss mechanics and a
long-term ward record.

- **Adaptation offers.** The pool is twelve installable adaptations. Each organ
  transition offers three seeded options; installed adaptations are excluded
  from later offers until the pool is exhausted. Effects are data-driven and
  include suit, Host, weapon handling, movement, cautery, collateral and enemy
  pacing. No adaptation changes the fixed step or the locked accessibility
  rules.
- **Disciplines.** Three playable surgeons: Trauma, Field Medic and Clinical
  Pathologist. Their differences are stat and objective-damage passives, shown
  on the pre-op card; they do not change input or controls.
- **Routes.** Four routes between organs: direct, vagal, lymphatic and venous.
  Each declares its timer, medkit, Host and ammo effect in `ROUTES`; the elite
  addition is consumed by the next organ rather than repeated forever.
- **Elite strains.** A seeded share of roster enemies receives one of three
  elite pathologies (Calcified, Frenzied, Septic) gated by case tier. They use
  the same silhouette with a tint, scale, ring, health, damage and speed
  multiplier, so every biome gains a rare threat without a second asset set.
- **Boss mechanics.** Variants are no longer palette swaps: relay count,
  barrage density, summon roster, ring pattern and hazard cadence are declared
  in each variant's `mech` data and read by the boss controller.
- **Ward directives.** Eight persistent goals (kills, clean cauteries, elites,
  cases, organs, high-Host closes, adaptations, bosses) pay research once and
  are shown on the case board. They are long-term goals, not difficulty
  settings; they never alter damage, Host Integrity or score.
- The single Bio-Volt Rifle remains the signature weapon. Variety comes from
  targets, ranges, hazards, adaptations and boss patterns rather than a second
  gun that would dilute the selected fantasy.

---

## AMENDMENT 04 — The infection fights back

**Date:** 2026-10-30. **Rationale:** the first combat pass looked correct on
paper but played as a corridor walk. Enemy contact damage was gated by a
spawn-invulnerability timer that never decayed, and ceiling enemies were pinned
to a fixed height while organ cavities are 5–7 m tall. The result: harmless
enemies that floated. This amendment records the correction and the pressure
layer built on top of it.

- **Real vulnerability window.** The surgeon's invulnerability is a short
  post-hit and post-respawn window, declared in `PLAYER.spawnIFrames`,
  `PLAYER.hitIFrames` and `PLAYER.respawnIFrames`. It decays every fixed step.
  Contact is now a real threat; accessibility assists still do not alter it.
- **Surface anatomy.** Wall crawlers are anchored to the actual ellipsoid shell
  (`Level.ceilingAt`), suspended by silk, and scuttle across the ceiling toward
  the player before dropping. Floor crawlers use uneven skitter gaits and body
  wobble instead of smooth hovering translation. All creatures cast a floor
  contact shadow except while suspended.
- **Weak-point shooting.** Every enemy declares its exposed anatomy in `ENEMIES`
  (`weak`). Body shots do `COMBAT.bodyDamage`; a deliberate hit on a glowing
  sac, eye, underbelly or core does `COMBAT.weakpointDamage`, staggers the
  creature and gives a distinct critical marker and wet impact. This is the
  precision layer the game was missing.
- **Brood pressure.** Every non-entry chamber owns visible brood sacs. First
  entry wakes a seeded wave from the walls, and every active node keeps breeding
  on a timer until it is destroyed. Both the room event and the node timer are
  in `COMBAT` and capped by `COMBAT.broodCap`.
- **Ammunition is a decision.** Reserve, magazine, drop chance and pickup size
  were reduced alongside the tougher body shots, so spray does not clear a room.
  Body shots still work, but they cost time and ammunition.
- **Corpses stay.** A killed creature collapses, remains on the tissue for a
  short staging beat and is then cleaned up; it is never an invisible blocker.
- The Host Integrity contract, fixed step, deterministic seeds and the single
  Bio-Volt Rifle remain unchanged.

---

## AMENDMENT 05 — Vital Focus

**Date:** 2026-10-30. **Rationale:** weak points and clean cauteries needed a
payoff beyond a single kill, and the horde fights needed a player-authored way
out of a collapse that was not simply lowering enemy damage. Vital Focus turns
precision into a finite combat resource without touching the fixed difficulty
or the accessibility settings.

- **Gain.** Weak-point hits charge the meter; weak-point kills, clean node
  cauteries, elite kills and destroyed boss shield anchors pay larger amounts.
  All values live in `FOCUS` in `content.js`.
- **Spend.** At 100 charge, `V` spends the whole meter for 4.2 seconds of
  Vital Focus. Enemy movement, attacks, projectiles, hazards and boss cadence
  run at 34% speed. The surgeon, the extraction clock and Host Integrity drain
  continue at normal speed, so focus buys reaction time at the patient's
  expense in real time.
- **Fixed step.** The game still advances in 1/60 s steps. Focus changes the
  `dt` passed to the infection, never the accumulator, input mapping or player
  movement. No raw frame time is introduced.
- **Readability.** The HUD shows charge, READY and the active seconds. A
  low-contrast scanline/vignette treatment communicates the state without
  hiding weak points or Host readings. The controls card records `V`.
- Vital Focus is gameplay, not an accessibility assist. It does not change
  enemy damage, Host Integrity, score or the locked difficulty.

---

## AMENDMENT 06 — Performance is part of the fiction

**Date:** 2026-10-30. **Rationale:** the content pass made the organ look full
but the scene was submitting **1,649 draw calls, 23 real-time lights and 423
unique materials** at 1440×900. The corridor read as a slideshow on anything
less than a discrete GPU. Visual density is not free, and a medical thriller
that stutters loses tension every time it hitches. This amendment makes the
frame budget a first-class content rule.

- **One draw per material, not per prop.** All rigid organ dressing is merged
  into vertex-coloured material batches at level build time. Animated props
  (gates, nodes, brood sacs, the cautery tool, extract portal and archives) are
  explicitly excluded and remain live objects. The level dropped from hundreds
  of mini-meshes to roughly two dozen static batches.
- **Creature anatomy is batched, legs are instanced.** Rigid body parts are
  baked into one vertex-coloured mesh per creature; eyes, eggs, silk and weak
  sacs stay separate so their material animation remains readable. Eight
  two-segment legs become two `InstancedMesh` draws driven by the existing leg
  animation. Creatures now cost roughly six to nine draws instead of thirty.
- **Lighting budget.** The room-per-light model was replaced by three roaming
  room lights that follow the nearest chambers, one boss light and a single
  muzzle flash. Gate, node and tool lights became emissive surfaces. The shader
  no longer iterates twenty-odd point lights for every tissue fragment.
- **Adaptive resolution, fixed simulation.** `PERFORMANCE` declares the frame
  target, render-scale floor, HUD rate and light/draw budgets. The governor
  lowers internal resolution before it ever lowers gameplay quality; the 1/60
  accumulator, enemy behaviour and Host Integrity are untouched. Auto quality
  is presentation only, in line with the accessibility rule.
- **Quiet things go quiet.** Particle fields sleep when empty, dust updates at
  30 Hz, HUD DOM updates at 20 Hz, tracers share one pooled line mesh, and dead
  entities are removed by swap rather than per-frame array allocation.
- **Failure is a state, not a crash.** A lost WebGL context pauses the run and
  restores the feed; render exceptions are contained and surfaced as a paused
  fault instead of an unhandled loop. `F3` opens the diegetic surgical feed
  telemetry: FPS, frame time, draws, render scale, live threat and light count.
- **Content rule.** New static props must join a material batch. New creatures
  must batch rigid anatomy and instance repeated limbs. New lights need a
  declared reason and must fit `PERFORMANCE.maxLights`. The audit checks the
  batching entry points, the adaptive governor, context recovery and the
  overlay so this cannot silently regress.

---

## AMENDMENT 07 — Second performance pass and the chain economy

**Date:** 2026-10-31. **Rationale:** after the first batching pass the frame was
faster but still carried avoidable work. Profiling the live build separated the
remaining cost instead of guessing: the 59-piece first-person viewmodel alone
was 59 draws, four infection nodes were 48 draws, and eleven brood nests were
66. At the same time, runs had no moment-to-moment chase beyond the clock. This
amendment closes both gaps without changing the Host Integrity contract.

### Frame budget

- **The viewmodel is a weapon, not a model show.** The rigid rifle is merged by
  material and each articulated hand becomes one vertex-coloured mesh. Reload,
  sway, recoil and support-hand motion still drive the original groups. The
  camera-owned model dropped from **59 draws to 9**.
- **Infection nodes** bake their nine spike cones into one ring mesh; each node
  keeps a live core and halo. **Brood nests** merge the socket/throat and the
  four-egg clutch, keeping the swell/flare tell. Together these props dropped
  from **114 draws to 29**.
- **Shared projectile assets.** Enemy and boss projectiles reuse cached
  geometries and tinted materials. A shot no longer allocates, compiles and
  disposes a shader per round.
- **Bloom is a veil, not a texture.** The bloom mip chain renders at 50% of the
  drawing buffer. The base render, grade, UI and tone mapping stay native.
- **High-DPI is capped at 1.25.** A 2× display was paying four times the
  fragment cost for detail that motion hides; adaptive render scale still
  governs below that cap.
- **No frames for invisible things.** Menus render at 30 Hz, hidden tabs submit
  no GPU work, far enemies stop simulating and drawing, and far organ props
  (nodes, nests, gates, archives, portal) are visibility-culled by distance.
  Distant static batches remain because they are already only two dozen draws.
- **Prewarm under the injection screen.** Level generation and
  `renderer.compile()` now run while the completed injection overlay is still
  the last painted frame, so the first visible combat frame does not pay a
  ~120 ms shader compile.
- **Window resize is coalesced**, simulation faults pause into a readable error
  instead of repeating every frame, checkpoints are validated before Continue
  is offered, and a lost context saves the run before rebuilding.
- **Measured result on the verification machine:** the same 18-enemy lung scene
  fell from **412 draw calls / 5.3 ms** to **257 draw calls / 4.2 ms** at
  1440×900, with the viewmodel at 9 meshes and bloom at half resolution. The
  fixed 1/60 step, enemy behaviour and Host Integrity are unchanged.

### Chain scoring and medals

- **Chain.** A kill adds links; a weak-point kill adds two. Links expire after
  4.5 seconds without a kill or instantly when the surgeon takes damage. The
  multiplier is `1 + min(chain, 20) × 0.1`, applied before the new link is
  added, and all tuning lives in `SCORING`.
- **Sources.** Enemy score is the data value in `ENEMIES`, multiplied by the
  weak-point and elite multipliers. Clean cauteries, destroyed boss anchors and
  the boss kill also pay. Dirty node destruction pays only the small salvage
  value, so precision remains the better economy.
- **Milestones.** Chains of 5, 10, 15 and 20 fire a distinct audio/feedback beat.
  The HUD shows the live multiplier, its expiring link bar and the run score.
- **Grade and medals.** Best chain adds a capped bonus to the existing Cure
  Grade. Five case medals (`HOST INTACT`, `NO DEBRIS`, `CLEAN HANDS`,
  `CHAIN SURGEON`, `UNDER PAR`) are evaluated from the run record, persisted in
  the ward meta and displayed on the debrief. Best score and best chain persist.
- This is scoring, not difficulty: it never changes enemy damage, Host
  Integrity, the extraction clock or accessibility settings.

---

## AMENDMENT 08 — Case protocols

**Date:** 2026-10-31. **Rationale:** procedures had a patient, a mutation and a
route, but every clean case still carried the same institutional conditions.
The military-program frame and the heavy-roguelite pillar call for a stipulation
attached to the patient, not a difficulty menu. Protocols add that variation
without adding a new screen or a paragraph to read.

- **Seeded, not selected.** `makeCasePreview` rolls one protocol from
  `PROTOCOLS` with the run seed and the board shows its code, name, one-line
  risk and score multiplier. There is no re-roll and no difficulty slider; the
  baseline game remains fixed and brutal. The first case draws only from the
  onboarding-safe subset so a new surgeon is never handed ammunition famine
  before they have fired the rifle.
- **Host interaction is explicit.** Every protocol declares a `host` line.
  Sterile Field doubles collateral Host damage; Fragile Host lowers the Host
  Integrity ceiling by 15 and grants one stabilizer; Rush Order shortens each
  extraction window by 90 seconds. Blackout, Saturation and Ammunition Famine
  state that they have no Host Integrity interaction. Nothing quietly edits the
  patient.
- **Risk pays in score and research.** Protocol multipliers apply to every
  scoring source through `awardChain` and dirty-node salvage. Closing the case
  adds the protocol's RP to the existing grade and clean-cautery payout. Score
  multipliers never alter enemy damage, the fixed step, input or accessibility.
- **Carried, not re-rolled.** The protocol id and multiplier are written into the
  checkpoint and restored with the organ. Re-injection cannot launder a bad
  stipulation into a good one.
- **Presentation.** The case board prints the protocol as a stamped stipulation
  slip with a dashed clinical border and arterial-red rule. The chart, pre-op
  equipment strip and debrief repeat only the name, tag and multiplier. This is
  the reading budget: one line of risk, one number of reward.

---

## AMENDMENT 09 — Braced aim

**Date:** 2026-10-31. **Rationale:** the rifle had one input and one cone. Precision
was the signature feeling, but a player could only move the mouse faster; there
was no deliberate way to steady a shot without stopping the run. Braced aim adds
the missing trigger discipline and gives the two-handed viewmodel a reason to
come to centre.

- **Right mouse braces.** Holding RMB tightens the shot cone to 42% of its
  walking spread, drops movement to 55% and pulls the sight line 11 degrees
  narrower. Releasing restores both over a short blend. The fixed 60 Hz step and
  the shot ray are unchanged; only the cone fed to `fireShot` is tighter.
- **Not a free win.** The surgeon cannot sprint while braced, the viewmodel
  takes a moment to settle, and the magazine, damage, reserve and Host
  Integrity cost of a miss are identical. Braced aim is a skill expression, not
  a damage upgrade.
- **Rebuild state.** Aim drops during reload, cautery channelling, death and
  pause. It is never restored from a checkpoint; a resumed run starts unbraced.
- **Presentation.** The reticle closes from a field cross to a fine clinical
  cross with an amber centre, and the rifle/hand rig moves to the centre line.
  No new meshes, materials, draw calls or lights are created.
- The control is documented on the pocket card and in the first-organ tip.
  Host Integrity interaction: none.

---

## AMENDMENT 10 — Matched reload

**Date:** 2026-10-31. **Rationale:** reloading was a fixed wait. The Bio-Volt is
the signature weapon and the case is about precision under panic; the reload is
the one moment where the player is defenseless and can demonstrate composure.
The matched load makes that moment active without adding a new resource.

- **One press.** Reloading shows a narrow timing band on the reload line. Press R
  again while the fill crosses the band to seat the magazine instantly. Press
  outside it once and the magazine binds: the reload extends by the declared
  penalty. Letting the bar finish is always safe, so inattention is not punished
  with a dead gun.
- **One attempt.** A reload can be matched or seized, never both. A seized load
  cannot be rescued by spamming R. Starting the next reload clears the state.
- **No damage or Host change.** A matched load does not add damage, ammo or
  accuracy, and a seized load does not damage the patient. It only changes time
  spent unable to fire. The Host Integrity interaction is none.
- **Tuning.** Window, snap and penalty live in `WEAPON.activeReload` in
  `content.js`: 56–74% of the reload, 0.16 s snap, 0.45 s penalty. The HUD,
  pocket card and the existing reload audio all derive from that block.
- **Presentation.** The window is a fine clinical band; it brightens while open,
  the label asks for the press, and matched/seized states use green/arterial red.
  The underlying merged viewmodel and reload dip are unchanged.

---

## AMENDMENT 11 — Physicality and gore

**Rationale.** The lock asks for a grounded medical thriller, visceral feedback
and art direction as a best-in-class pillar. A clean, flat viewmodel and
floating, evenly-glowing enemies broke that promise even when the systems were
correct. This pass is presentation-only: no damage, Host Integrity, score,
ammo or enemy timing values changed.

### Enemies

- Eight-leg gait now swings and lifts each leg on its own phase, with a jointed
  knee, tarsal claw, turn lean and a body that rears on a wind-up.
- Leaps tuck the legs in the air and land with a squash, dust burst and wet
  thud. Shots flinch the body. Deaths fall away from the impact direction, curl
  the legs, deflate the body and keep bleeding for the first seconds.
- Badly hurt creatures expose a real wound cavity with torn flaps and rib ends.
  Skin carries generated vertex mottling and a wet/dry roughness map.
- Blood is directional. Weak-point hits tear loose chunks, kills throw arterial
  pools along the shot and leave a longer corpse (4.2 s) on the floor.
- Missed shots now cut the host wall: bone dust, a wet spray and a blood decal
  oriented to the wall normal, so collateral damage is visible as well as
  costed.

### Weapon and hands

- Beveled receiver, handguard, stock, optic hood and muzzle brake; recessed
  vents, cable, sling mounts, foregrip, serial plate and cloth tape. Gloves are
  dull black nitrile instead of brown leather.
- Generated roughness maps break up specular highlights on polymer, steel and
  skin; a warm view light sculpts the bevels without touching world lighting.
- Reload choreography travels to the magazine well, pulls the spent magazine
  out of frame, brings a fresh one up, seats it and only then cycles the bolt,
  with separate magazine-out, magazine-in and bolt audio cues. The weapon rises
  on equip and lowers while channeling a surgical interaction.
- Star-shaped additive muzzle flare, longer muzzle smoke, sprint carry pose,
  landing dip and hand pump. Arms end in cuffs instead of long pipes.

### Interface and screen stock

- HUD corners are scratched instrument glass with rivets and clipped corners.
- Pause card uses the same paper stock, fibre grain, folded edge and second-sheet
  shadow as the case files; paper surfaces settle into place on entry.
- Lens specks and scuffs sit over the 3D view; close kills add a short,
  edge-weighted arterial wash that never covers the reticle.
- A film-grade pass adds modest midtone contrast, saturation and split toning;
  generated textures only, no external assets.

### Budget

Measured in the live lung room at 1440×900 after ten kills: 158 draw calls and
about 166k triangles. Splatter decals are one instanced draw (96 slots), wound
meshes appear only on wounded enemies, and the muzzle flare is one sprite. The
existing 520-draw and 10-light budgets are unchanged.
