# MICROCURE — Full-Game Plan

**Status:** design proposal, grounded in the current prototype  
**Companion:** [design quiz](design-quiz.html) — 82 questions that produce a locked design brief  
**Date:** 30 October 2026

---

## 1. Verdict

The prototype is **not a game you can extend yet**. It is a content-rich first draft of a game: the premise, patient cases, organ biomes, weapons, enemies, upgrades and presentation ideas are all there, but the assembled build does not boot and the code is built on assumptions that will not survive a real release.

That is good news, not bad news. The expensive part of a game is usually the idea and the content skeleton. You already have both. What is missing is a clean technical spine and a decision about what the finished game actually is.

My recommendation:

> **Do not port this code line-for-line to Unity or Unreal.** Rebuild a focused vertical slice in **Godot 4** unless the quiz points to a genuinely 3D, cinematic, console-first game. Keep the fiction and the content catalogue. Throw away the DOM UI, the frame-based timing, and the current assembly.

The concept I would build is below: **MICROCURE: VITAL SIGN**, a top-down action roguelite where the patient is the battlefield. The signature mechanic is that you can lose the mission by hurting the person you are trying to save.

---

## 2. What is actually in the build

### The good bones

- **Strong premise.** A nano-surgeon injected into dying patients is immediately understandable and visually distinctive.
- **A full content skeleton.** 6 patients, 4 organs, 8 weapons, 4 enemy types, 3 bosses, 6 meta upgrades, 9 mid-run adaptations, a hub with three rooms, mission briefings, par times and a reward formula.
- **A real renderer.** `renderer.js` is 549 lines and draws organ-specific obstacles, hazards, particles, bosses, enemies, the player, projectiles, pickups and HUD-adjacent effects. There is a visual language here worth keeping.
- **A playable fantasy.** Twin-stick movement, dash, shield, grenades, charge shots, weapon switching and organ-to-organ escalation. The ingredients of a good action game are present.
- **Good naming and tone.** "Nexus Medical Institute", "Bio-Volt Rifle", "The Architect", "PRIME ARCHITECT" — the fiction has a voice.

### Why it does not run

I served the folder and opened `js/index.html` in a browser. Every stylesheet and script returns 404. The page renders as one long unstyled document with all screens visible at once.

The causes are structural:

1. **`index.html` is inside `js/`.** Its `css/style.css` and `js/*.js` paths resolve to `js/css/...` and `js/js/...`, which do not exist.
2. **The asset manifest does not match the files.** `index.html` requests `js/config.js`, but the file is `Config.js` (works on a case-insensitive Mac, fails on GitHub Pages/Linux). It requests `js/hud.js`, which does not exist; the HUD code lives in `hub.js`.
3. **The CSS belongs to a different revision of the HTML.** The markup uses `.screen-header`, `.hub-rooms`, `.card-icon`, `.hud-top-left`, `.bar-row`, `.message-overlay` and `.overlay-content`. The stylesheet defines `#gameContainer`, `.hub-icon`, `.hud-row`, `#healthPanel`, `.briefing-box`, `#messageLog` and `.bar-container`. Almost none of the UI is actually styled.
4. **The overlays have no positioning rules.** `#missionBriefing`, `#upgradeChoice`, `#missionComplete` and `#gameOver` use `class="overlay"`, but the CSS only styles `.screen.overlay`. In practice they are normal-flow blocks at the bottom of a clipped page, not modal overlays.
5. **`showMessage()` targets `#messageLog`, but the HTML has `#messageOverlay`.** All in-game messages are silently dropped.
6. **The canvas is 1280×720; the game world is 1200×750.** The renderer draws 1200×750 into a differently sized backing store, and mouse aim scales against `Game.W` instead of the canvas's internal width. The result is clipped edges and permanently offset aiming.

### Systems debt worth knowing about

- **No fixed timestep.** Enemies, projectiles, particles and pickups update once per rendered frame with no `dt`. The game runs at different speeds on 60 Hz, 120 Hz and 144 Hz displays.
- **No save system.** `playerData` lives only in memory. Refreshing loses all credits, unlocks and upgrades, despite the meta-progression premise.
- **The mid-run choice does not pause the game.** `advanceOrgan()` shows the upgrade overlay, then loads the next organ after 100 ms while the simulation keeps running. Enemies can spawn and kill the player while they are reading the cards.
- **The double-boss path is unreachable.** The second boss is scheduled with `setTimeout` and only spawns if `bossesDefeated === 0`, but the first boss's death increments that counter. The final-organ advance also ends the mission before the timer fires.
- **"Quick Reflexes" corrupts permanent progression.** `applyMidChoice('reflex')` increments `playerData.upgrades.dash` — the meta upgrade — instead of a run-scoped value. Stack it a few times and dash cooldown goes negative.
- **Electric hazards never damage the player.** `Hazards.create('rect', ...)` is created, then its `type` is overwritten to `'electric'`. The collision branch checks `h.type === 'rect'`, so the rectangle test is skipped and the radius fallback is 0.
- **Input can get stuck.** Charging and automatic fire depend on `mouseup` on the canvas. Releasing outside the canvas leaves `Game.mouse.down` or `isCharging` set.
- **Only weapon slot 3 is configurable.** Buying a weapon replaces slot 3; slots 1 and 2 are fixed. There is no loadout screen.
- **The HUD and player refer to opposing conventions.** The HTML says `SPACE = Dash / Q = Shield / E = Grenade`; the code binds `Shift`, `F` and `G`. The README says `Shift`, `F`, `G`. The title screen is wrong.

This is why I would not repair this build and then scale it. It would take longer to untangle the DOM/CSS revision mismatch than to rebuild the presentation layer cleanly.

---

## 3. What to keep

Keep these as **design input**, not as code to port:

- The fiction and the word "MicroCure".
- The patient-case framing and the case-board hub.
- The organ biomes and their hazard identities (heart = rhythm/electricity, lungs = wind/alveoli, brain = hallucination/synapses, stomach = acid/folds).
- The weapon fantasy list (rifle, shotgun, SMG, sniper, launcher, beam, auto-rifle, plasma).
- The idea of mid-run "bio-adaptations".
- Par-time scoring and the tension between speed and reward.
- The boss escalation and the Vasquez / PRIME ARCHITECT thread.
- The neon clinical palette and the pulsing-organ presentation.

Rewrite everything else: scene/state management, timing, input, UI, save data, content schema, collision, audio.

---

## 4. Concept proposal — MICROCURE: VITAL SIGN

### Logline

> You are a nano-surgeon dropped inside dying patients. Kill the infection, keep the host alive, and decide how much of a person you are willing to cut away to save them.

### Player fantasy

You are the best microsurgeon in the Nexus program: calm hands, impossible technology, a whole immune war happening at the scale of a cell. The fantasy is **precision under panic** — not power fantasy, not horror, but the thrill of doing delicate work while everything screams.

### Three pillars

1. **Cure, do not just kill.** Every weapon and every explosion damages tissue. The patient has a condition, not just a health bar.
2. **Every organ is a rule.** The heart changes tempo, the lungs change movement, the brain changes what you can trust, the stomach changes what you can touch. Biomes are mechanics, not skins.
3. **The hospital is the long game.** Cases, research, staff, patient outcomes and the conspiracy are all part of the loop between injections.

### Signature mechanic: Host Integrity

The player has HP and shields. The **patient** has Host Integrity, a second, shared resource.

- Bullets, explosions, grenade splash and environmental hazards chip Host Integrity when they hit tissue.
- The infection also drains it over time. Ignored infection nodes spread and accelerate the drain.
- If Host Integrity reaches zero, the patient dies — mission over, even if the surgeon is still alive.
- A limited **Stabilize** ability restores integrity in a small area, but has a long cooldown and competes with your defensive cooldown.
- Precision weapons and "tissue-safe" mods are slower or weaker but protect the score. Explosive builds are fast but expensive to the host.
- The debrief scores **Cure Grade** (integrity remaining), **Time**, **Collateral** and **Infection Cleared**, and the patient's outcome changes the story and rewards.

This one mechanic changes aiming, weapon choice, buildcraft, level design, scoring and narrative at once. It is the thing that makes MicroCure not a generic twin-stick game.

### Secondary system: Case Conditions

Each patient's disease applies a rule to the whole run, not just a stat multiplier:

- **Arrhythmia:** the heart periodically inverts your movement vectors for a beat. Learn the rhythm or stop moving.
- **Hypoxia:** safe tissue shrinks and expands; the arena is a breathing lung.
- **Encephalitis:** some enemies render as friendly silhouettes until they attack.
- **Sepsis:** infection nodes respawn unless you seal the source.
- **Necrosis:** destroyed tissue becomes permanent terrain that blocks movement and shots.

These are authored per case and can combine in the endgame. They give each patient a identity and make the case board feel like a set of problems rather than a difficulty slider.

### Core loop

```
NEXUS HUB
  ├─ Case board: choose a patient, read the file, see the condition
  ├─ Loadout: weapon chassis + 3 modules + suit + stabilize tool
  └─ Inject
       ↓
  ORGAN WARD (3–5 per case)
  ├─ Objective: clear infection nodes / stabilize tissue / extract a sample
  ├─ Combat: twin-stick, dash, shield, grenade, weapon swap
  ├─ Host Integrity pressure: collateral damage vs. speed
  ├─ Clear → choose 1 of 3 bio-adaptations
  └─ Next ward
       ↓
  CRISIS / BOSS (organ-scale pathogen or patient emergency)
       ↓
  DEBRIEF
  ├─ Cure Grade, time, collateral, infection cleared
  ├─ Credits, research data, patient outcome
  ├─ Unlock modules, cases, hospital upgrades, story beat
  └─ Return to hub
```

A case should take **20–45 minutes**; a full campaign **8–12 hours**; the endless **Outbreak** mode reuses the content with modifiers.

### Combat

- **Camera:** top-down 2D/2.5D, twin-stick. Readable silhouettes, layered parallax, organ-scale architecture.
- **Movement:** WASD/left stick, dash with i-frames, a short cooldown. No jump. The arena is the puzzle.
- **Weapons:** 8 chassis at launch, each with 2 mod slots. Mods change behavior, not just numbers: ricochet, tissue-safe rounds, antibody payload, chain lightning, cryo, piercing, remote detonation, leech.
- **Abilities:** dash, shield, grenade, stabilize. Four buttons, no ability bar bloat.
- **Enemies:** swarmers, bruisers, ranged spitters, cloakers, support enemies that buff the infection, and organ bosses with 3 phases. Enemy composition teaches the case condition.
- **Difficulty:** a curated curve with accessibility modifiers (host integrity multiplier, enemy damage, game speed, aim assist, screen-shake intensity, colorblind palettes). No difficulty shaming.

### Progression

**Per run**

- 3–5 bio-adaptations, drafted from a pool. Strong, visible, build-defining.
- Temporary module pickups and case-specific tools.
- Infection samples that can be spent at a mid-run "field lab" or saved for meta research.

**Meta**

- Research tree: weapon chassis, modules, suit frames, stabilize tools.
- Hospital wing: unlock the case board, the lab, the archive, staff who give passive bonuses.
- Patient outcomes and a case archive that fills in the conspiracy.
- No permanent raw-stat inflation that trivializes the game; meta unlocks **options**, not just +10% damage.

### Narrative

- You are **Dr. Mara Voss**, a Nexus microsurgeon. The program's founder, **Dr. Elena Vasquez**, infected herself with the master strain. The campaign moves from routine cases to the realization that the outbreak is engineered.
- Each case is a small character story told through the patient file, in-organ clues, and a debrief. The patient is not a level select; they are a person with a life outside the operating table.
- The final choice: cure Vasquez and lose the research that could end the program, or extract the cure and let her die. Neither is clean.

### Art direction

**"Clinical neon baroque."** Deep black and venous red, antibiotic teal, bone white, warning amber. Organs look like alien cathedrals built from wet anatomy. UI looks like medical instrumentation, not a sci-fi game menu. High contrast, strong silhouettes, restrained bloom. Gore is clinical and stylized, not splatter.

Audio: a heartbeat that tracks Host Integrity and tempo; wet foley for movement and impacts; analog synth drones; a solo cello for the patient themes; boss themes with choral textures.

### Target content for 1.0

| Content | Target |
|---|---|
| Cases | 10 (8 campaign + 2 optional) |
| Organ biomes | 4 families, 3 variants each |
| Bosses | 8 (one per case, two multi-boss finales) |
| Weapons | 8 chassis, 30 modules |
| Suits | 6 frames |
| Bio-adaptations | 40 |
| Case conditions | 8 |
| Modes | Campaign, Outbreak (endless), NG+ |
| Platform | PC/Steam first; gamepad + MKB; Steam Deck verified; web demo optional |

**Anti-scope for 1.0:** no 4-player co-op, no live service, no open world, no photoreal 3D, no voice-acted cinematic campaign. Those are expansions or different games.

---

## 5. Engine decision

This matters more for the agent workflow than for the player. Freebuff works by reading and writing **files**. Your engine choice determines how much of the game an agent can actually touch.

| | Godot 4 | Unity 6 | Unreal 5 | Current web stack |
|---|---|---|---|---|
| Agent editability | **Excellent.** Text scenes (`.tscn`), GDScript/C#, resources, project.godot. | **Good for code**, fragile for scenes/prefabs (YAML + GUIDs). Editor required. | **Poor for Blueprints** (binary `.uasset`); C++ is editable, but most content is binary. | **Excellent.** Plain JS/TS/HTML. |
| 2D fit | **Excellent.** Purpose-built 2D renderer. | Good. | Weak/overkill. | Good, but you own the engine. |
| 3D fit | Good (stylized). | **Excellent.** | **Best-in-class.** | Possible with Three.js/WebGPU; heavy. |
| Install / build weight | Small, fast. | Large, license/account. | Very large, slow builds. | None. |
| Desktop export | One-click Windows/Linux/macOS. | Yes, plus consoles. | Yes, plus consoles. | Requires Tauri/Electron wrapper. |
| Headless/CI automation | **Excellent.** `godot --headless`. | Good via batchmode. | Possible, slow. | Excellent (Node/Playwright). |
| Best reason to choose | 2D/2.5D action game, solo + agents, fast iteration. | 3D, console path, asset ecosystem, C#. | High-fidelity 3D, cinematics, big team. | Browser-first, instant sharing, no install. |

### Recommendation

**Godot 4 is the best fit for the game described above and for agent-driven development.** It keeps scenes and resources as text, runs headless for tests, exports to desktop and web, and does not put a binary editor between the agent and the content.

Choose **Unity 6** instead if the quiz lands on a 3D game, a console launch, or a heavy Asset Store pipeline. Unity's C# is very agent-friendly; the risk is scene/prefab authoring, which should be done through code or a narrow set of hand-authored scenes.

Choose **Unreal 5** only if the answer to "what is this game?" is "a high-fidelity 3D cinematic experience." For this 2D top-down concept, Unreal adds weight without solving a problem. It is also the least agent-native of the four, because so much of an Unreal project lives in binary Blueprints and assets. An editor bridge/MCP plugin can help, but it is not a substitute for text-based content.

Keep the **web stack** if the goal is a browser game and instant sharing. It is the fastest path to a playable demo and the easiest for agents to verify. It is not the fastest path to a premium Steam release with controller support, achievements, cloud saves and storefront integration — though all of that is possible with a wrapper and enough work.

### What "connecting Freebuff to Unity/Unreal" really means

Freebuff can edit the project and run the editor/CLI, but it cannot see or manipulate binary assets the way it manipulates text. A practical setup:

- **Unity:** install Unity Hub + the exact editor version. Keep all gameplay in C# assemblies with edit-mode/play-mode tests. Author scenes from code or a small set of stable prefabs. Run `Unity -batchmode -runTests` in CI. Use an editor MCP/bridge only for scene and asset operations that cannot be scripted.
- **Unreal:** use C++ and data tables for gameplay, not Blueprints, if agents are the primary authors. Accept that level art, materials and cinematics will be hand-authored or generated through a separate asset pipeline. An Unreal MCP plugin can drive the editor, but builds are slow and the surface is large.
- **Godot:** point Freebuff at the project folder, keep content in `.tres`/JSON, run `godot --headless` for tests and export, and use screenshots/video for visual verification. This is the cleanest loop.
- **Web:** current setup, plus Playwright for automated interaction tests and a Tauri wrapper for desktop distribution.

No engine choice removes the need for **asset production**. Agents can generate code, data, layouts, UI and tests. They cannot reliably produce a coherent art direction, animation set, sound design and game feel without a human review loop. Plan for that.

---

## 6. Agent-native production plan

### Phase 0 — Design lock (this week)

Answer the [design quiz](design-quiz.html). It produces a one-page brief. Use that brief as the project's `DESIGN.md`; every later agent task should point at it. Do not start the engine port before this is settled.

### Phase 1 — Vertical slice (the only thing to build next)

One patient. Two organs. One boss. A complete 10–15 minute loop that can be played start to finish.

**Must include**

- Title → hub → case file → loadout → injection → organ 1 → adaptation draft → organ 2 → boss → debrief → hub.
- One weapon with two modules; dash, shield, grenade, stabilize.
- Host Integrity, Cure Grade, collateral scoring.
- Pause, settings, remappable controls, gamepad support, save/resume.
- A fixed 60 Hz simulation with `dt`; deterministic enough to replay.
- Placeholder art allowed, but the final camera, scale and readability must be real.

**Explicitly not in the slice**

- 10 cases, 8 weapons, a research tree, voice acting, online features, Steam integration, a full art pipeline.

The slice is the proof that the core loop is fun. If it is not fun with placeholder art, no amount of content will save it.

### Phase 2 — Systems and content pipeline

- Data-driven definitions for weapons, modules, enemies, cases, conditions and adaptations.
- Content authoring tools or schemas an agent can fill without touching engine scenes.
- Four organ families and their mechanical identities.
- Boss framework with phases and telegraphs.
- Meta progression and save migration.
- Automated tests: damage math, economy, unlock gates, save/load, determinism.

### Phase 3 — Content and presentation

- 8–10 cases, 8 bosses, 8 weapon chassis, 30 modules, 40 adaptations.
- Art pass per organ; animation sets; VFX budget; UI skin; audio pass.
- Narrative: case files, in-organ clues, debrief scenes, the Vasquez arc.
- Accessibility: difficulty modifiers, colorblind palettes, screen-shake slider, subtitles, remapping, aim assist.

### Phase 4 — Demo, playtest, release

- Public demo: the first two cases, save transfer to the full game.
- Playtest rounds focused on the Host Integrity tension and build diversity.
- Steam page, trailer, press kit, Next Fest.
- Launch: PC first; console/web later if the data supports it.

### Working patterns for agents

- One `DESIGN.md`, one `CONTENT.md`, one `TASKS.md`; keep them current and small.
- Every task has an acceptance test a machine can run.
- Content lives in data files, not in code branches.
- Fixed timestep, seeded RNG, deterministic replays.
- Screenshot/video capture for every visual feature, reviewed by a human.
- Never let an agent "fix" game feel by tweaking numbers without a before/after capture.
- Small commits; one system per change; no giant refactors disguised as features.
- Keep generated art and audio in a separate review queue with provenance notes.

---

## 7. The decision the quiz resolves

The quiz is deliberately large because the expensive mistakes in a game project are made before the first line of code: the wrong genre, the wrong camera, the wrong scope, the wrong platform, the wrong engine, and the wrong definition of "done."

It covers:

1. North star and anti-goals
2. Genre, run structure, camera, dimension
3. Core loop and pressure
4. Combat feel and weapon philosophy
5. Buildcraft and progression
6. World, biomes and content volume
7. Story, characters and tone
8. Art, audio and UI
9. Platform, tech, multiplayer and production reality
10. Scope, success metrics and the first milestone

At the end it generates a **Design Lock** brief you can copy or download. Paste that brief back into the chat and the next step becomes concrete: either a Godot vertical-slice plan, a Unity 3D prototype plan, or a cleaned-up web build, depending on what you chose.

---

## 8. My recommendation in one paragraph

Build **MICROCURE: VITAL SIGN** as a **2D/2.5D top-down action roguelite in Godot 4**, with **Host Integrity** as the signature mechanic, a **10-case campaign plus an endless Outbreak mode**, **PC/Steam first**, and a **10–15 minute vertical slice** as the next deliverable. Keep the fiction and content catalogue from this prototype. Do not port the DOM UI or the frame-based code. Use the quiz to confirm or overrule the genre, camera, platform and scope before any engine work begins.
