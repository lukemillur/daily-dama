# Daily Dama — Trick Visualization Handoff

Written so a fresh context can add tricks without re-deriving the geometry or re-discovering the traps. Rewritten 2026-08-07 when the one hand-derived trick (Big Cup) was rebuilt on a reusable vocabulary; five tricks now render in the dev sandbox and nothing is wired into the real app UI yet.

Full project context (state boundaries, product shape, collaboration style) lives in [AGENTS.md](AGENTS.md) — read that first if anything here is ambiguous.

## 1. What this is

Procedural 3D kendama trick visualizations — built from primitives, no licensed or imported assets, keyframed rather than physics-simulated. Rendered with `react-three-fiber` + `expo-gl`. Currently a standalone dev sandbox at `src/app/stats/trick-viz-sandbox.tsx`.

Web is the only surface exercised. The `expo-gl` path is **untested on native**.

## 2. Where things live

```
src/features/trick-viz/
  model/
    body.ts               BodyPose (authoring, Euler) / RigidPose (runtime, quaternion)
    kendama-geometry.ts   KENDAMA_LAYOUT — ken-local dimensions, seatOffset
    tama-geometry.ts      TAMA_LAYOUT — radius, spike hole, bore depth
    sockets.ts            KEN_SOCKETS / TAMA_SOCKETS — named contact points
    mate.ts               the catch solver (cup / spike / stand)
    ballistics.ts         tossArc, tossPositionAt, swingDirection, TRICK_GRAVITY
    beats.ts              hang / toss / ride — the reusable blocks
    timeline.ts           TrickState, buildTrick, concatTricks, sampling, stall check
    easing.ts             easings, for hand gestures only
    framing.ts            viewDirectionFor, viewForState, frameSubjects
    rope.ts               verlet string sim + toCurvePoints
    kendama-colliders.ts  capsule colliders derived from KENDAMA_LAYOUT
    tricks/
      cupCatches.ts       Big cup, Small cup
      pullUpSpike.ts      Pull up spike, spin and no-spin
      airplane.ts         Airplane
      index.ts            TRICK_VISUALIZATIONS, keyed by Kentei trick IDs
  components/
    Ken.tsx               static primitive ken, pose-free
    Tama.tsx              static primitive tama, pose-free — hole + spin mark
    String.tsx            rope-driven string
    TrickScene.tsx        Canvas composition, playback, camera rig
src/app/stats/trick-viz-sandbox.tsx   dev-only viewer with picker + scrubber
```

Tests: `mate.test.ts`, `ballistics.test.ts`, `timeline.test.ts`, `tricks/tricks.test.ts` — 67 tests. These are pure functions and they are where the geometry bugs that cost days on Big Cup actually live. Run them before trusting a screenshot.

## 3. The central abstraction: two bodies, one held

**At any moment one body is *held* — its motion is authored, it is the player's hand — and the other is *free*, flying ballistically or riding a contact.**

That inversion is the load-bearing idea. The first implementation modelled the ken as a fixed grip with optional position offsets and the tama as a position-only track with no orientation, which made every tama-held trick (airplane, trapeze, lighthouse, frying pan) literally inexpressible. Both bodies now carry the same `BodyPose` and the same local-frame convention.

`TrickState` is `{ held, ken, tama, contact }`. A `Beat` consumes one and produces another, so a trick's end state is a valid start state for whatever follows — which is what makes compound Kentei tricks one continuous run rather than clips cut together.

Grips are **authored** as Euler triples in order `'YZX'` (`POSE_ROTATION_ORDER`), because that is how a player describes one. Everything downstream of `toRigid` uses **quaternions**, and interpolation **slerps**. Component-wise Euler lerp was harmless while nothing rotated and is wrong the moment a ken flips.

Naming: **"ken"** is the whole assembly (shaft + serato + cups + spike); **"shaft"** is only the grip below the serato. That is why the topmost point is `spikeTip`, not `shaftTop`.

## 4. Big Cup geometry — verified, do not re-derive

Pose is `rotation: [0, -Math.PI/2, Math.PI/2]` in `'YZX'`: roll the big cup from +X up to +Y, then swing the base cup round to +Z (facing the player).

| Part | Local axis | World axis |
|---|---|---|
| Big cup | +X | **+Y** (up) |
| Base cup | −Y | **+Z** (toward player) |
| Spike | +Y | **−Z** (away) |
| Small cup | −X | **−Y** (down) |
| String hole | local `[0, 0.08, 0.08]` | **`[-0.08, 0, -0.08]`** |

The net local→world map is **`(x, y, z) → (-z, x, -y)`**. *(A previous version of this document said `(-z, y, x)`; that was wrong, though the named-axis table above was always right. `mate.test.ts` now asserts the table directly, so the two cannot disagree again.)* The big cup mouth therefore lands at world `[0, 0.4, -0.1]`, and the seat at `[0, 0.509, -0.1]`.

Two consequences drive everything, both learned by getting them wrong first:

1. **The tama cannot enter the big cup from below.** Directly beneath it sit the serato bar and the small cup facing straight down. It must pass the ken's level *beside* it and drop in from above — which is what real ozara looks like.
2. **It must swing on the same side the string exits**, and *across* the ken rather than along it. `swingDirection` derives both from the string hole's own offset with the component along the ken's axis projected out. Never hardcode it.

The seat is derived, not placed: the tama (r 0.25) is wider than the big cup mouth (r 0.225), so it rests **on the rim** at `sqrt(r_tama² − r_mouth²)` ≈ 0.109 above the mouth plane. It never enters the cup, so it cannot clip through a wall.

## 4b. Tama anatomy — verified, do not simplify

The tama's local frame is oriented by its **big hole (ana), which faces −Y**. A tama landed on an upright spike therefore sits at neutral rotation with its painted top upward, which is how it looks in life and makes airplane's grip the identity pose.

| Feature | Local | Notes |
|---|---|---|
| Big hole mouth | `[0, -0.25, 0]`, axis −Y | radius 0.088 — true to a ~2.1cm hole in a ~6cm ball, and a shade wider than the ken's 0.08 shaft |
| Cavity depth | 0.24 | must exceed `SPIKE_LENGTH` (0.225) |
| String hole | `[0, 0.25, 0]`, axis +Y | radius 0.022, the opposite pole |
| Knot | inside, at the top of the cavity | what stops the string pulling back through |
| Painted circle | spherical cap, radius 0.11 | centred on the string hole, on top |

Three things follow, and all three were wrong in the first version:

1. **The interior is hollow and the spike disappears into it.** `insertionDepth` takes the smaller of the spike's length and the bore's depth, so the tama goes on until the spike bottoms out — the hole's mouth comes to rest exactly at `shaftTop`, where the spike leaves the shaft, and no spike is left showing. This is a consequence of the two bodies' dimensions, not a tuned constant.
2. **The string attaches at the string hole, not the ball's centre.** Both `stringEnds` in `beats.ts` and the rope's far end in `String.tsx` use `TAMA_LAYOUT.stringHoleLocal`. Hang length is measured hole-to-hole.
3. **The ball is rendered with the bottom cap genuinely omitted** (`sphereGeometry` with `thetaLength = π − holeAngle`), lined with a double-sided tube and capped at the blind end. A dark spot painted on a solid sphere would not let you see into the cavity, and back faces are culled, so without the lining the opening would read as a window through the ball.

**Consequence to know about:** the tama is now fully axisymmetric — sphere, both holes, knot, and paint all sit on one axis. Spin about that axis is therefore invisible except through the string. `Pull up spike (Spin)` and `(No spin)` are geometrically different and asserted as such in tests, but they look alike. A maker's logo printed on the side (which real tamas carry) would fix it; not added, because it wasn't asked for.

## 5. The mate solver

`mate.ts` replaces the page of inline trigonometry Big Cup used to carry. It states the constraint — *this landmark goes here, facing this way* — instead of answering it for one cup under one grip.

- `seatTamaInCup` — rim math via `seatOffset`. Rotation is carried, since a sphere on a rim has no meaningful orientation.
- `spearTamaOnSpike` — hole anti-aligned with the spike, inserted by `insertionDepth` so the spike vanishes inside (see §4b). Rotation fully determined up to spin, which is a parameter (the graded difference in "Pull up spike (Spin or No spin)").
- `spearKenIntoTama` — the same rendezvous solved for the *other* body. Airplane.
- `standKenOnTama` — lighthouse. Not yet used by a trick; the rim-on-sphere chord is the *same* `seatOffset` read the other way round.

## 6. Motion — the most important lesson

**Easing functions that end at zero velocity put a stall at that keyframe.** Chaining two `easeOutQuad` segments made the tama come to a complete stop twice mid-flight; that was the "two-step floaty" feel. Zero velocity is only correct at an apex or at the very end of a trick.

Free-body motion therefore comes from `ballistics.ts` as **one continuous function**, baked at 60Hz with linear interpolation:

- **Vertical**: a single parabola. Its endpoints are *provably exactly* the launch and the landing — the √ terms in the apex split cancel — so there is no seam where flight hands off to the catch.
- **Lateral**: an independent smooth swing peaking mid-flight, so the free body is at its widest exactly as it passes.
- The apex split is derived (`√h` timing, u ≈ 0.77 for Big Cup), not authored.

**Do not "improve" this by reintroducing eased waypoints.** Easings belong to the *hand* — `hang`'s load, `toss`'s rise, `ride`'s cushion — layered over the flight, never chopping it up.

`ride` re-solves the mate every frame rather than freezing the catch position, which is what keeps the tama glued into the cup through the cushion instead of drifting out of it.

### The stall detector

`buildTrick` warns in `__DEV__` when a beat boundary brings the action to a halt and then restarts it, and `Trick.joins` exposes the boundary indices so tests can assert the same thing. Two details matter:

- It is a **stall** detector, not a continuity check. A pull that launches a toss is a legitimate impulse; flagging it would train everyone to ignore the warning.
- Each side of a join is judged against **its own** window. A hang followed by a hard pull is slow-then-fast but nothing decelerated; a stall is a side that *was* moving and then wasn't.
- Only check at joins. The inside of a beat is continuous by construction, and a wide window placed mid-beat will see a legitimate launch several samples away and cry wolf.

It has already earned its keep: it caught a dead stop in the `ride` cushion (two eased halves) that no one would have spotted by eye.

## 7. Time is in seconds, and gravity sets it

`TRICK_GRAVITY = 4.4` in `ballistics.ts`, far below real gravity (~75 units/s² at this scale) and below the rope solver's own tuned 26. Deliberately slow-motion: a real Big Cup takes well under a second and the point is legibility.

What matters is that it is *a* gravity rather than a set of typed durations — toss length then scales as √height automatically, so a big toss and a small one in the same sequence keep their relative timing. The absolute value is a style knob, calibrated so Big Cup's flight lands on the ~1.7s that was originally tuned by eye (total trick ≈ 2.23s, against the old 2.2s).

`TrickScene`'s `speed` prop is a playback *rate*, not the authority on length.

## 8. Camera

`viewDirectionFor` composes the direction from the ken's pose: base-cup axis (near side) + string-hole offset (the "inside" face) + elevation. For Big Cup that resolves to `[-1, 0.32, +1]`.

**With the ken upright** (airplane, pull up spike) the base cup opens straight down and contributes no horizontal hint, so the shot collapses onto the string side alone — which is the *same* axis the free body swings clear on. The throw then happens directly toward the camera and reads as nothing moving. `viewDirectionFor` turns a quarter round off that axis in this case; airplane is unwatchable without it.

The view direction is sampled per beat and eased with a longer τ (0.6s) than the position follow (0.32s), so a grip change pans instead of whipping. The rig **snaps on the first frame of a run**, both so the opening shot is framed and because the real viewport aspect is not known until there is a frame.

`followAction` hands the camera to `canvasExtras` (OrbitControls) when false; the rig and the controls would otherwise both write the camera every frame.

## 9. String

A 28-particle inextensible verlet rope colliding with six tapered-capsule proxies for the ken, derived from `KENDAMA_LAYOUT` so retuning a cup moves its collider. Distance-constraint and collision passes are **interleaved**, not sequential. Colliders are transformed to world once per frame, valid only because the ken is never scaled. Cup colliders are **solid, not hollow** — fine here, wrong for any trick where the string should sit inside a cup.

`stringRestLength: 2.7` is **true scale** and deliberate. It hangs the tama far outside any static frame, which is exactly why `frameSubjects` fits tama + ken *per frame*. Do not shorten it to make a static camera work.

The string always runs ken-hole ↔ tama-hole, so `String.tsx` needs no per-trick routing and none for tama-held tricks either. Its rope continuity across a run is a feature; it re-lays only on `runToken` change. Endpoints are pinned and excluded from the collision passes, which is why pinning the far end exactly on the tama's surface is safe.

## 10. Traps — do not rediscover these

1. **A keyed `<Canvas>` loses the WebGL context.** Remounting to reset playback blanks the scene (`THREE.WebGLRenderer: Context Lost`). Everything resettable watches a `runToken` string inside `useFrame` instead — clock, rope, and camera snap.
2. **React Compiler is enabled.** A module-scope helper defined inside a *component* file threw `ReferenceError: not defined` at runtime despite `tsc` passing. Keep helpers in non-component modules.
3. **The app's web tab nav floats a full-width hit area across the top of the route.** Controls placed near the top of the sandbox look clickable and silently are not — `elementFromPoint` shows the nav container on top. All sandbox controls live in one bottom stack for this reason.
4. **An absolutely positioned View has no width of its own.** A wrapping row inside one puts every chip on its own line and pushes the stack off-screen. The HUD uses `left: 0; right: 0`.
5. **The browser console buffer persists across navigations.** Verify a symbol still exists (`grep`) before believing an error that names it.
6. **Same-URL navigation does not remount the route.** Use a changed query string for a real reload.
7. **`fov` is vertical.** At a tall aspect the horizontal FOV is much smaller, so width binds before height. `frameSubjects` must use the real `camera.aspect`. Invisible on a wide viewport.
8. **Lint rules `react-hooks/refs` and `react-hooks/immutability` are strict.** No reading or writing refs during render. Do reset logic inside `useFrame`.
9. **Slack rope collapses points** → zero tangent → `CatmullRomCurve3` NaNs → crash every frame. `toCurvePoints` drops coincident neighbours and guards non-finite particles. Keep it.
10. **Sandbox access is gated.** Set `localStorage['daily-dama:user-profile']` to `{"version":1,"profile":{"hasCompletedOnboarding":true,"kenteiRank":1,"selectedTrickIds":[]}}` — the versioned wrapper is required and `kenteiRank` is a **number** 1–12. The route is nested under `/stats/` because the web tab router silently redirects unregistered top-level routes to Home.
11. **`AccessGateProvider` skips the password gate whenever `__DEV__`** — interim, production unaffected.
12. **`eslint.config.js` has a scoped `react/no-unknown-property` override** for `src/features/trick-viz/**/*.tsx`, needed because eslint-plugin-react does not know r3f's JSX intrinsics.

## 11. Adding a trick

A trick is now a dozen declarative lines. `cupCatches.ts` is the shortest example — Big Cup and Small Cup are one function called twice.

```ts
export const someTrick = buildTrick({
  id: 'kentei-trick-id',          // reuse the app's generated ID
  name: 'Some trick',
  start: startHanging('ken', GRIP),
  beats: [
    hang({ seconds: 0.22, load: 0.05 }),
    toss({ target: { kind: 'cup', socket: 'bigCup' }, apexRise: 0.35, clearance: 0.55,
           gesture: { rise: 0.23 } }),
    ride({ seconds: 0.3, gesture: { cushion: 0.15, settle: -0.11 } }),
  ],
  viewFor: viewForState,
});
```

Register it in `tricks/index.ts`. Gesture offsets are relative to where the hand already is, so a preceding load does not have to be added back in.

## 12. Verification workflow

Dev server: `preview_start({name: "daily-dama-web"})` on port 8091 — **not** the `web` entry, which is 8081.

Use the sandbox's **scrubber** (0/25/50/75/100%) to inspect phases. This replaces the old workflow of temporarily setting `durationSeconds={20}` and remembering to revert it. Still worth a final `grep` for `durationSeconds={20}` and `__kenDebug`.

Standard checks: `yarn test --runInBand`, `yarn lint`, `yarn tsc --noEmit`.

## 13. Not started

- **Stage 2 tricks**: Base cup, Moshikame (a `toss` loop between two sockets — nearly free from this architecture, so `x5`/`x10`/`x20` are a repeat count, not three tricks), Baseball, Trapeze, Frying pan, Lighthouse. Lighthouse is the riskiest: it is a balance with no catch, and the only user of `standKenOnTama` and the `stalled` contact.
- **The `swap` beat** — role reversal mid-trick, needed by compound tricks like "Airplane, Base cup, Downspike".
- **Kentei compound sequences.** `concatTricks` exists and is tested, but no sequence is defined yet; each element must be built from the previous element's `end` state, not a fresh hang, and `concatTricks` throws if it isn't.
- Integration into the real Tricks/Sesh UI. `TRICK_VISUALIZATIONS` is keyed by the app's own trick IDs so this is a lookup, not a mapping table.
- Native (iOS/Android) verification of the `expo-gl` path.
- Airplane's `apexRise` sends the spike slightly above the hole before it drops in; it clears the tama laterally and reads fine, but a smaller rise would be truer to the real throw.
