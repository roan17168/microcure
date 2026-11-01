# MICROCURE — RUNTIME SMOKE TEST

This is the browser gate the static audit cannot replace. Run it after any change to
input, screen flow, saves, procedural generation, combat or rendering. The dev
build exposes `window.__mcDebug` so the probes below can inspect the live engine
without adding test-only code to production.

Start the game with `npm run dev`, open the printed loopback URL, and keep the
browser console and network panel visible for the whole pass. A pass is only
green when the console is clean, there are no failed requests, and every screen
has a visible exit.

## 1. Boot and menu access

1. Hard reload on the title screen. Confirm the 3D scene and title render.
2. Press Tab. The first case button must receive a visible focus ring.
3. Press Enter. The patient chart must open. Press Escape on Settings and the
   pocket card and confirm each returns to the screen that opened it.
4. Open Controls and confirm it lists Shift, Tab and Escape, and every number
   quoted for Host, stabilizers, cautery and respawn matches `src/content.js`.
5. Press F3 in the theatre and confirm the diagnostic overlay reports draw
   calls, lights, render scale and quality.
6. Throttle the network to Slow 4G and hard reload. The boot card must paint
   before the bundle finishes, then fade only once the title has rendered. A
   cold load must never sit on a blank black page.
7. Press Escape, then click RESUME immediately. Chrome can refuse the re-lock
   for about a second. The CLICK TO AIM card must appear, one click on the view
   must restore the camera, and that click must not fire the rifle.
8. Switch away from the tab for 30 seconds. The run must pause and the world
   audio must stop; returning must not fast-forward the simulation. Reload
   while playing and confirm Continue restores the last room checkpoint
   (the pagehide save path, not only beforeunload).

## 2. Eight organ generators

Start a case first: `setupNewScene` needs the active run seed. Then load all
eight organ biomes in one session with the debug handle:

```js
const g = window.__mcDebug.game;
const ids = ['lung', 'liver', 'kidney', 'brain', 'marrow', 'intestine', 'lymph', 'heart'];
for (const id of ids) {
  g.setupNewScene(id);
  const level = g.level;
  console.log(id, {
    rooms: level.rooms.length,
    nodes: level.nodes.length,
    gates: level.gates?.length,
    extract: !!level.layout.exit,
    boss: !!level.layout.boss,
    finite: level.rooms.every((r) => Number.isFinite(r.x) && Number.isFinite(r.z)),
  });
}
```

Every organ must report finite room coordinates, a non-empty node set, no
generation exception, and an extract in every non-final organ. The heart must
contain a boss. This probe intentionally swaps scenes without rebuilding the
player; reload the page after it rather than continuing to play. Repeat with a
second seed and confirm the layout changes.

## 3. Core loop and crisis

1. Start a case and complete the loadout. The injection must finish and the HUD
   must appear with a running timer.
2. Fire one round into a wall: Host Integrity must fall and the collateral
   readout must change.
3. Destroy an infection node with the Cautery. Confirm the timer, nodes, score
   and Host all update.
4. Pick up the Cautery, then force a crisis in the current room:

```js
const g = window.__mcDebug.game;
g.level.scheduleCrisis();
g.level.crisisTimer = 0;
```

5. Enter the marked room, hold E on the wound and confirm the seal grants Host,
   Focus and score. Repeat on a fresh run and shoot the wound: the seal time
   must drop by `CRISES.shotPenalty` and ignoring it must cost Host and spawn
   enemies.
6. Let the organ timer reach zero. The failure screen must appear with a working
   retry or return-to-hub action. Confirm no screen is a dead end.

## 4. Checkpoint and save boundary

1. Complete an organ and stop on the route/adaptation screen. Choose one
   adaptation and one route.
2. Reload the page. Continue must be offered with a ROUTE CHOICE subtitle. It
   must rebuild the same route screen — same organ, Host, node count, clean
   count and organ time — with both choices still selected and ENTER enabled.
   No injection replay and no organ load may occur. Descend afterwards and
   confirm the next organ starts and the checkpoint no longer offers the route
   screen.
3. In Settings, drag the sensitivity slider without releasing. Local storage
   writes must only happen on release. Reload and confirm the value survives.
4. Set sensitivity to its 0.2 minimum, reload, and confirm it is still 0.2.
5. Export a save, import it from Settings twice. Both imports must succeed and
   leave the Settings screen visible with the imported values.

## 5. Display, audio and performance

1. Switch quality through LOW, MEDIUM and HIGH. All three must render; HIGH is
   the only tier with bloom. Confirm the scene does not go black or resize oddly.
2. Resize the window and confirm the HUD, minimap and crosshair stay aligned.
3. Check that master volume, FOV, invert-look, shake and chromatic/grain all
   change immediately.
4. Toggle HIGH CONTRAST. The HUD panels must become solid dark, labels and
   numbers must gain luminance, film grain and lens specks must disappear, and
   infection nodes on the minimap must gain a white contour. Reload and confirm
   the toggle persisted.
5. Toggle REDUCE MOTION. Head bob, strafe roll, landing dip, sprint FOV widening,
   screen shake, bobbing HUD pulses and screen-entry motion must stop. Timers,
   damage, currency and score must be unchanged. Reload and confirm it persisted.
6. Switch COLOR VISION through DEUTERANOPIA, PROTANOPIA and TRITANOPIA. The 3D
   grade must visibly change and the HUD danger/status palette must switch to the
   matching safe hues. The shader must compile with no WebGL errors. Return to
   STANDARD and confirm the original grade returns. Reload and confirm the mode
   persisted.
7. Play a combat room for at least 60 seconds at HIGH and watch the F3 overlay.
   Draw calls should stay under the 520 budget and lights at or below 10.
8. Trigger a GPU context loss if the platform allows it; the game must save and
   reload rather than leaving a black screen.
9. Audio placement: face a crawler that is on your LEFT, then turn 180°. The
   skitter must move to the opposite ear, and a hit from that side must draw the
   damage arc on that side. Menus are silent of world sound; the click has a
   contact tick, not a flat beep.
10. Audio bed: stand still in a cleared room for a minute. The ambience should
    drift and breathe, with occasional off-centre tissue movement — not a frozen
    drone. The bed must not tick up the frame time (see F3).
11. Movement audio: walking must be audible under fire, and the jump must have a
    lift and a landing thump. Fire a burst — no two reports should sound
    identical.

## 6. Gamepad

Connect a standard-mapping controller before loading the page, or inject one for
an automated probe:

```js
const fake = {
  connected: true,
  axes: [0, 0, 0, 0],
  buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })),
};
Object.defineProperty(navigator, 'getGamepads', { value: () => [fake], configurable: true });
```

When driving the pad by hand, set `pressed` back to `false` after each frame;
otherwise no new rising edge is produced and every later press is ignored.

1. On the title screen press **A** once. A visible focus ring must appear on the
   forward action (BEGIN CASE) and the screen must **not** change. Press **A**
   again to open it. On the patient chart, focus must land on PRE-OP CHECK, not
   the back button; on the loadout it must land on INJECT; on pause, RESUME.
   **D-pad down** must move focus; **B** must back out.
2. In Settings, use D-pad up/down to focus a range or select and left/right to
   change it. The value must update and persist exactly like mouse input.
3. Start a case. The toast `CONTROLLER LINKED` must appear once.
4. Left stick must move with analog magnitude, right stick must look, RT must
   fire and LT must brace. Keyboard and mouse must continue to work in the same
   session.
5. A dashes, X reloads, B stabilizes, Y uses a medkit, LB throws a grenade, RB
   holds cautery and D-pad up spends Vital Focus.
6. START pauses; START or B resumes from the pause screen. VIEW repeats the
   objective.
7. Disconnect the controller while playing. The game must keep running, clear
   all held pad inputs and leave mouse/keyboard untouched.

## 7. Movement, injection cinema and body landmarks

1. Stand still in the entry chamber for 25 s. No hostile damage may land, and
   the first blocked hit must show the STERILE FIELD cue. Step into the first
   corridor and confirm `level.entryProtected` flips to false and hits land.
2. The support glove must visibly wrap the handguard: knuckles on the near side,
   fingertips over the far edge, cuff and sleeve leaving frame. No white wrist
   stub or floating claw.
3. Start a case and watch the pre-op. The needle dive and vessel rings must play
   before the case card, the scale readout must step from 10⁰ to 10⁻⁴ (10⁻³ for
   the heart), and the card must name the correct route. With REDUCE MOTION
   enabled the card must appear immediately with no dive.
4. Enter the organ. Jump with Space and confirm the arc reaches roughly 1.5 m
   (hold the key for full height), then jump onto a tissue shelf and stand on
   it. Walk off the lip and confirm the fall starts from the shelf height, not
   from the floor.
5. Jump over a floor-level melee bite and an organ hazard; both must miss while
   the boots are above `PLAYER.airDodgeHeight`. A spore burst must still hurt:
   it is an area explosion, not a floor sweep.
6. Dash with Shift. Speed lines and a short invulnerability window must fire,
   and a projectile crossed during the burst must be destroyed. Confirm the HUD
   dash bar refills after `PLAYER.dashCooldown`.
6b. Dash into a crawler. It must take exactly one contact rupture per burst,
   stagger, spray blood and lose Host-free health. Kill one with the dash: part
   of the cooldown must return, PHASE STRIKE must appear once, and Host
   Integrity must not move. Dashing at a wall or a ceiling crawler must not hit
   through geometry.
7. In the heart organ, approach a wall heart. The mass must visibly contract on
   a beat, and the beat rate must rise as you get closer. The HUD pulse must
   only throb in the heart organ, near a landmark, or under real host distress.
8. Load every organ and confirm the room heart is present only in cardiac
   rooms, the lung has no cardiac landmark, and the cache/secret rooms still
   have a shelf that is not on a node, the tool or a spawn point.
9. Force one drop of each kind in front of the player and inspect all three at
   hip height: a latched bio-cell case, a trauma kit with a red cross, and a
   fracture canister with a pin. No plain floating cubes or colour blocks.
10. While the entry shield is active, let a crawler chase the player to the
    doorway. It must stop at the chamber lip instead of filling the camera; the
    frame must stay clear enough to read both gloves and the weapon.
11. Jump into a spore cluster and land hard. Nearby infection must take slam
    damage with falloff at the ring edge, throw gore and stagger; Host Integrity
    must not change from the slam itself. A normal jump must still clear a bite.

## 7b. Kit identity, vitals and ability feedback

1. Start a case as each discipline and look at the rifle. **BREACHER** must show
   an underslung launcher and hazard bands, **FIELD KIT** a side reservoir with a
   sight glass and a stock cross, **BIOPSY** a longer barrel with a fixed blade
   and a taller optic. The HUD label must match the discipline, and a burst from
   each kit must not sound identical.
2. Let the surgeon's own bar fall below 34%. A persistent red edge wash appears,
   the HUD reads VITALS FAILING, and the medkit tile pulses. Press F: the rifle
   drops out of the sight line, health rises and the green wash fires. Press F at
   full health or with no kits and a toast must say why nothing happened.
3. Hold E on a node, then walk out of range or release early. A toast must report
   the aborted/released procedure and the channel bar must reset.
4. Kill a skitter and a heavy from different angles. The body must be thrown
   along the shot, settle differently by silhouette, twitch once after collapse
   and leave a pool that keeps growing for the first second.
5. Die. The fail card must name the proximate cause of the killing blow, and the
   re-injection toast must repeat it.
6. Stand in a room with at least six melee creatures. No more than two may be in
   a wind-up at the same time on tier 1 (three from tier 3). The others must
   **circle at a ring around the surgeon** and swap direction between attempts —
   not freeze or queue silently. The room should stay threatening without
   becoming a single-frame damage wall.
7. Stand still in a room with several creatures and no contact. Each silhouette
   must occasionally vocalise (dry ticks, a wet breath, a wall scrape) from its
   own position, quieter than the ambience and never in chorus. Silence at 20 m
   is correct.
7. Kill a skitter, a wall crawler and a heavy. Each death must land as a shell
   crack, a wet collapse and a lower settle — not another hit sound.

## 8. Final gate

- Console: no uncaught errors, no repeated warnings, no failed network requests.
- All eight organs loaded at least once in the session.
- No screen lacked a visible exit.
- `npm run build` and `npm run audit` both pass.
