# AGENTS.md — MicroCure working rules

Read `design/DESIGN-LOCK.md` and `design/AGENT-PIPELINE.md` before changing
gameplay. The legacy `js/` and `css/` folders are the old prototype: reference
only, never load or extend them.

## Commands

```bash
npm install        # once
npm run dev        # local dev server
npm run build      # production static build
npm run preview    # serve the built game
npm run audit      # content/design/build gates
```

## Architecture

- `src/main.js` — boot, fixed 60 Hz accumulator, state machine, pointer lock.
- `src/content.js` — case, organs, weapons, enemies, adaptations, tuning. All
  player-visible numbers live here.
- `src/level.js` — authored organ graph + seeded organic dressing; walkable
  collision is a union of circles and capsules.
- `src/entities.js` — player, enemies, pickups, projectiles, boss.
- `src/ui.js` — screens, HUD, minimap, hub, settings, debrief, save UI.
- `src/audio.js` — procedural WebAudio only.
- `src/fx.js` — particles, tracers, shakes, hit feedback.
- `scripts/audit.mjs` — static gates. Extend it when you add a content reference.

## Rules

1. **Do not add external art, audio or fonts.** Everything is generated at
   runtime so the build is self-contained and license-clean.
2. **No external network calls at runtime.** No CDNs, analytics or remote saves.
3. **All tuning is data.** If you find a magic number in an entity's logic that
   changes balance, move it to `content.js`.
4. **Keep the fixed step.** Gameplay updates use `STEP = 1/60`; never multiply
   movement by raw frame time.
5. **The patient is never scenery.** Any new weapon or enemy must state its Host
   Integrity interaction (cost, mitigation or none with a reason).
6. **No dead screens.** Every state transition needs a visible exit.
7. **Seed everything.** Layout, loot, enemy roster and mutation use the run seed;
   math randomness in FX is exempt.
8. **Accessibility is not difficulty.** Assists may change presentation or input
   comfort; they may not change enemy damage, Host Integrity or score.
9. **Verify in a browser.** Build success is not a playable game. Check console,
   input, transitions, and capture the result.
10. **Do not edit the design lock to win an argument.** Amend it explicitly with
    a rationale, or obey it.

## Definition of done for a pass

- `npm run build` and `npm run audit` pass.
- The full loop still boots and is playable.
- Console clean; no 404s; no new warnings that matter.
- Any new content is referenced from data and covered by the audit.
- Report: files changed, checks run, known limitations.
