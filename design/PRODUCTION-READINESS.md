# Production readiness — 1.0 web build

_Last verified: 1 November 2026_

## Launch status

The web build is ready to publish as a static GitHub Pages site. There are no
build-time secrets, no runtime network calls and no server requirement.

| Gate | Result |
| --- | --- |
| `npm run audit` | 59 passed, 0 warnings, 0 failed |
| `npm run build` | pass, ~150 ms, 1.6 MB artifact |
| Subpath boot (`/microcure/`) | title, case file, loadout and injection all render |
| Network | every asset 200 from the project subpath; console clean |
| Source maps | none shipped |
| Debug handle | `window.__microcure` absent in production (`DEV` only) |
| Deep links | `404.html` redirects to the project root, not a broken asset tree |
| Touch devices | dismissible desktop-only notice, no unplayable dead screen |
| Saves | `localStorage`, sanitised on import, JSON export/import, `pagehide` + bfcache hooks |
| Mouse capture | a refused re-lock shows CLICK TO AIM instead of a dead camera |
| Hidden tab | run pauses and the WebAudio graph is suspended, then resumed on return |
| Cold load | an HTML boot card paints before the 1.4 MB bundle and is removed after the title frame |
| Performance | p50 0.1 ms / p95 0.2 ms fixed step; 383 draws against a 520 budget |

## What "production" required

- `base: './'` so the same artifact works on a project page, a user page or any
  static host.
- `scripts/postbuild.mjs` writes `.nojekyll`, generates a redirecting `404.html`
  and fails the build on absolute `/assets/`, leaked `/src/` or source maps.
- `.github/workflows/deploy.yml` runs the audit before uploading `dist`, so a red
  gate cannot publish.
- `.github/workflows/ci.yml` runs the same audit on pull requests and branches.
- Touch-device notice instead of a keyboard-only game presented as broken.
- Link-preview metadata, a release version, README and third-party notices.

## Honest gap list against the original asks

These are **not** done, or are deliberately narrower than the request. They are
listed so the launch is not mistaken for the end of production.

1. **Cloud saves** — the design lock lists them; the build ships local saves plus
   JSON export/import. A real cloud save needs an account system and a backend,
   which conflicts with the no-runtime-network rule. Decide which rule wins
   before calling this done.
2. **Unity / Unreal rewrite** — the early request mentioned those engines. The
   signed design lock selects **Web** and "let the concept decide", and the
   current game is a self-contained browser build. Porting is a separate project,
   not an outstanding bug.
3. **"Tens of hours" of authored content** — the loop is procedural and endless,
   with 8 organs, route choices and research. It does not yet have a hand-authored
   campaign, set-piece progression or the content volume of a 12-month production.
4. **AAA asset fidelity** — geometry, texture, audio and UI are generated at
   runtime. That is a deliberate constraint (self-contained, license-clean), not
   a placeholder pipeline waiting for downloads.
5. **Mobile play** — unsupported by design. The gate explains it; it is not a
   touch control scheme.
6. **Localization** — English only; all copy lives in `content.js` and UI strings,
   so a locale layer is possible but not present.
7. **Telemetry / analytics** — intentionally absent. No network calls, no
   tracking, no remote error reporting.
8. **Repository license** — the project owner must choose one. `THIRD_PARTY.md`
   covers dependencies; no `LICENSE` file is asserted by this repository.
9. **Browser matrix** — verified in Chromium. Firefox and Safari are expected to
   work (WebGL2, WebAudio, pointer lock) but have not been signed off.

## Publish checklist

1. Create the repository and push to `main`.
2. Settings → Pages → Source: **GitHub Actions**.
3. Wait for **Deploy to GitHub Pages** to finish; open
   `https://<user>.github.io/<repo>/`.
4. Smoke-test on the deployed origin: title, begin case, loadout, injection,
   pause, settings persistence, reload with a checkpoint.
5. Tag the release (`v1.0.0`) once the deployed origin passes step 4.

## Next work, in order of player value

1. A death beat that frames the killing blow before the fail card.
2. A support creature that buffs the pack and must be prioritised.
3. Authored set-piece cases layered over the procedural route.
4. Cloud saves if accounts are approved; otherwise a clearer "local records"
   promise on the title screen.
