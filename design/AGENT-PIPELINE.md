# MICROCURE — AGENT PRODUCTION PIPELINE

This is the working model for building MicroCure with a conductor agent plus
specialist passes. It is deliberately file-based: every handoff is a document or
a test result, not a chat memory.

## Operating principles

1. **One conductor owns integration.** Specialists propose patches or reports;
   the conductor merges, runs the build and keeps the vertical slice shippable.
2. **One system per pass.** A pass has a single acceptance test and a file
   boundary. No pass may rewrite another pass's owned files without a handoff.
3. **Design is an input, not a suggestion.** `design/DESIGN-LOCK.md` is canonical.
   A change that contradicts it needs an explicit amendment in that file.
4. **Verify in the product.** Typechecks are not gameplay. Every visual or feel
   change needs a browser run, a console check and a screenshot or capture.
5. **Data over branches.** Content lives in `src/content.js`; tuning is data.
6. **No invisible assets.** Generated textures, meshes and audio are described in
   the README, deterministic where possible, and replaceable.
7. **Never ship a dead end.** If a screen or state has no working next action, it
   is a P0 bug, not a polish item.

## Roles

| Role | Owns | Acceptance artifact |
|---|---|---|
| **Conductor** | Integration, scope, final build, this pipeline | `npm run build` + playable loop |
| **Creative Director** | Pillars, tone, bar, anti-scope | Design review against the lock |
| **Systems Designer** | Host Integrity, economy, progression, tuning | Numbers table + failure-state matrix |
| **Engineer** | Loop, renderer, collision, input, save, performance | Build + zero-error run + 60 fps probe |
| **Combat Designer** | Weapons, enemies, boss, telegraphs, feel | 2-minute encounter capture |
| **Level Designer** | Organ graph, gates, pacing, procedural rules | Seeded layout map + soft-lock test |
| **UI/UX** | Screens, HUD, onboarding, accessibility | Full keyboard pass of every screen |
| **Audio Designer** | Music, foley, mix states | Mute/volume/solo checks |
| **Narrative** | Patient file, lore, debrief, voice | Copy bible + in-context pass |
| **QA** | Failure states, saves, edges, regressions | Bug list with repro steps |
| **Performance** | Frame budget, draw calls, memory | Before/after trace |

## The loop

```
BRIEF
  └─ contract: scope, files owned, acceptance test
       ↓
IMPLEMENT
  └─ smallest coherent change; no orphan TODOs
       ↓
STATIC GATE
  └─ npm run build · npm run audit
       ↓
RUNTIME GATE
  └─ serve · console clean · input works · state transition works
       ↓
EXPERIENCE GATE
  └─ screenshot/capture · readability · feel · no dead end
       ↓
ADVERSARIAL REVIEW
  └─ "how does this break?" · failure matrix · regression sweep
       ↓
FIX → repeat until the gate is green
       ↓
LOCK (commit/notes) → next pass
```

A pass may not skip a gate because "the change is small". The smallest UI change
can hide the game behind an overlay; the smallest tuning change can make the boss
unkillable.

## Specialist prompt contracts

Each prompt handed to a specialist must contain exactly these sections:

```
ROLE:        which hat, which phase
OBJECTIVE:   one sentence, player-visible outcome
INPUTS:      design lock section, files, current build state
BOUNDARY:    files you may touch; files you must not touch
CONSTRAINTS: performance, accessibility, no new dependencies
ACCEPTANCE:  a command, a browser check, and a human-visible result
REPORT:      files changed, checks run, failures, open questions
```

### Ready-to-use passes

**Combat feel pass**
> ROLE: Combat Designer. OBJECTIVE: make the Bio-Volt Rifle readable and
> satisfying in under two seconds of use. INPUTS: DESIGN-LOCK §3–4, player and fx
> modules. BOUNDARY: weapon timing, viewmodel, fx only. ACCEPTANCE: empty mag →
> reload → kill a spore; hitmarker, muzzle flash, tracer, recoil and sound all
> fire; 60 fps maintained. REPORT: timings changed, capture path.

**Gate integrity pass**
> ROLE: Level Designer. OBJECTIVE: prove the Cautery gate cannot be bypassed and
> is never a soft-lock. INPUTS: level graph, collision, save state. BOUNDARY:
> level topology and interaction checks. ACCEPTANCE: seed sweep of 50 layouts;
> gate always precedes the exit; tool always reachable; no player position can
> cross the membrane without the tool. REPORT: seed list, failures.

**Failure-state pass**
> ROLE: QA. OBJECTIVE: enumerate every way the run can end or stall and verify a
> recovery path. INPUTS: state machine, save, pause, debrief. BOUNDARY: tests and
> fixes only. ACCEPTANCE: player death, host death, timer expiry, reload mid-run,
> tab backgrounding, pointer-lock loss. REPORT: matrix of state → recovery.

**Readability pass**
> ROLE: UI/UX. OBJECTIVE: a new player understands Host Integrity and the next
> objective within 30 seconds, without a manual. INPUTS: HUD, onboarding, case
> file. BOUNDARY: UI copy/layout. ACCEPTANCE: first-run observation; all text
> ≥ 12 px at 1080p; no unlabeled icon-only actions. REPORT: findings, changes.

**Performance pass**
> ROLE: Performance. OBJECTIVE: hold 60 fps at 1080p with bloom on. INPUTS:
> renderer settings, level generator, particle pools. BOUNDARY: render/quality
> settings. ACCEPTANCE: 60-second run trace; p95 frame < 16.7 ms; no allocation
> spike on room transitions. REPORT: draw calls, triangles, frame histogram.

## File ownership

| Area | Files |
|---|---|
| Shell / styling | `index.html`, `styles.css` |
| Boot / state / loop | `src/main.js`, `src/ui.js` |
| World | `src/level.js` |
| Entities / combat | `src/entities.js` |
| Effects | `src/fx.js` |
| Audio | `src/audio.js` |
| Content / tuning | `src/content.js` |
| Utilities / save | `src/utils.js` |
| Gates | `scripts/audit.mjs`, `package.json` |
| Design | `design/DESIGN-LOCK.md` |

## Severity and stop conditions

- **P0:** cannot boot, soft-lock, save loss, crash, unreadable HUD, gate bypass.
  Stop all feature work and fix.
- **P1:** core mechanic unclear, boss unbeatable/trivial, 60 fps missed, broken
  input on a supported device. Fix before the pass is considered done.
- **P2:** polish, copy, non-blocking visual issue. Schedule, do not hide.

A pass is complete only when its acceptance test is green, the full loop still
works, and no P0/P1 regression exists. "Looks fine in code" is not a result.

## What agents are allowed to decide alone

- Implementation details inside their boundary.
- Tuning within the locked design's stated ranges.
- Copy that matches the voice guide.
- Refactors that reduce risk and keep the build green.

## What requires the conductor (or the human)

- Changing a locked pillar, camera, genre, platform or signature mechanic.
- Adding a dependency, network service, account system or paid asset.
- Cutting a promised beat from the slice.
- Any change to save format that cannot migrate.
- Publishing or deploying.

## Current slice audit checklist

Run `npm run audit`, then verify manually:

- [ ] Title → case file → loadout → injection → lung → heart → boss → debrief → hub.
- [ ] Host Integrity drains from infection and careless fire; Stabilizer heals it.
- [ ] Cautery gate blocks before the tool, opens after; node cautery is clean.
- [ ] Boss has three phases with distinct telegraphs.
- [ ] Player death re-injects; host death fails the case; timer expiry fails.
- [ ] Pause releases pointer lock; resume re-locks; settings persist.
- [ ] Save survives reload; export/import round-trips.
- [ ] No console errors; no 404s; no external network requests.
- [ ] 1080p readable; every screen has a visible next action.
