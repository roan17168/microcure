# MICROCURE — VITAL SIGN

**The body is the level.**

A first-person procedural metroidvania set inside a dying patient. You are an
elite nano-surgeon injected into a living body to cut out an engineered
infection before the host — and you — are lost.

Everything renders at runtime: there are no downloaded textures, models,
samples or fonts beyond the two bundled typefaces. The build is a self-contained
static site.

## Play

```bash
npm install
npm run dev          # http://127.0.0.1:5173
```

Production build:

```bash
npm run build        # emits dist/ + .nojekyll + 404.html
npm run preview      # serve the built game
```

Requires a desktop browser with WebGL2 and a keyboard and mouse. Touch devices
show a desktop notice with a dismiss option rather than an unplayable screen.

## Controls

| Input | Action |
| --- | --- |
| `W A S D` | Move |
| Mouse | Look |
| Left mouse | Fire |
| Right mouse | Braced aim |
| `Shift` | Dash (invulnerable burst, ruptures in reach) |
| `Space` | Jump / stomp on landing |
| `R` | Reload — press again inside the marked window for a matched load |
| `F` | Medkit |
| `Q` | Stabilizer (heals Host Integrity, not you) |
| `G` | Fracture grenade |
| `E` | Interact / cautery; **hold** to complete a procedure |
| `V` | Vital Focus (slows the infection, not the clock) |
| `Esc` | Pause |
| `F3` | Performance overlay |

Gamepad is supported with a standard mapping; the interface is keyboard-first.

## What is in this build

- **8 organ theatres** with authored graphs and seeded organic dressing.
- **Endless procedural cases** with 3 surgeon disciplines, route choices,
  protocols, mutations, research and ward directives.
- **Three distinct weapon builds** — Breacher, Field Kit and Biopsy — with
  different hardware, silhouettes, accents, muzzle lengths and reports.
- **Signature Host Integrity**: every round, grenade and mistake can hurt the
  patient you are trying to save.
- **Boss encounters**, multi-phase telegraphs, a vascular crisis system and
  adaptive directional damage feedback.
- **Meta progression** at the hospital case board, plus local save,
  export/import and five ward medals.
- Deterministic runs from a seed, fixed 60 Hz simulation, adaptive render scale
  and a 520-draw-call budget.

## Deploy to GitHub Pages

The repository ships the workflow; you only need to enable it once.

1. Create a repository and push this project to its `main` branch.
2. In **Settings → Pages → Build and deployment**, set **Source** to
   **GitHub Actions**.
3. Push to `main` (or run **Actions → Deploy to GitHub Pages → Run workflow**).

The site publishes at `https://<user>.github.io/<repo>/`.

Notes:

- `vite.config.js` uses `base: './'`, so the same artifact works at a project
  subpath, a user site, or any static host. Do not change it to `'/'`.
- `scripts/postbuild.mjs` writes `.nojekyll` and a `404.html` fallback and fails
  the build if absolute `/assets/` paths, `/src/` references or source maps are
  present.
- The `Audit` workflow runs on pull requests and feature branches; the deploy
  workflow runs the same gates before uploading.
- Saves live in `localStorage` for that origin. Use **Settings → Export save** to
  move progress between browsers; there are no cloud saves.

## Project layout

```
src/main.js        boot, fixed 60 Hz step, state machine, pointer lock
src/content.js     case, organs, weapons, enemies, adaptations and tuning
src/level.js       authored organ graph + seeded organic dressing
src/entities.js    player, enemies, projectiles, pickups, bosses
src/ui.js          screens, HUD, minimap, hub, settings, debrief
src/audio.js       procedural WebAudio only
src/fx.js          particles, tracers, decals, shake, hit feedback
scripts/audit.mjs  static content, design and build gates
scripts/postbuild.mjs  GitHub Pages packaging guards
design/            design lock, production pipeline, smoke tests
```

`js/` and `css/` are the old prototype: reference only, never loaded.

## Verification

```bash
npm run audit        # 56 static gates + production build
npm run build
```

The audit covers content wiring, seeded runs, Host Integrity contracts, save and
settings boundaries, accessibility presets, audio and menu contracts, combat
commitment, the fixed step and the deploy artifact. It is the gate the Pages
workflow runs before publishing.

## Credits

See [THIRD_PARTY.md](THIRD_PARTY.md). MicroCure's code, design, writing and
procedural art are original to this project. No external art, audio or fonts are
fetched at runtime.
