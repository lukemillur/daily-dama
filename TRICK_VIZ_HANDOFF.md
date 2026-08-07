# Daily Dama — Trick Visualization Handoff (Big Cup)

Written 2026-08-07 so a fresh context can continue the procedural 3D trick visualization without re-deriving the geometry or re-discovering the traps. Big Cup (ozara) renders and animates correctly in the dev sandbox; nothing is wired into the real app UI yet.

Full project context (state boundaries, product shape, collaboration style) lives in [AGENTS.md](AGENTS.md) — read that first if anything here is ambiguous.

## 1. What this is

Procedural 3D kendama trick visualizations — built from primitives, no licensed or imported assets, keyframed rather than physics-simulated. Rendered with `react-three-fiber` + `expo-gl`. Currently a standalone dev sandbox at `src/app/stats/trick-viz-sandbox.tsx`.

Web is the only surface exercised so far. The `expo-gl` path is **untested on native**.

## 2. Where things live

```
src/features/trick-viz/
  model/
    kendama-geometry.ts    KENDAMA_LAYOUT — all ken-local dimensions
    ken-pose.ts            KenPose, localToWorld, localDirectionToWorld, kenEuler
    keyframes.ts           interpolator, easings, bakeKeyframes
    framing.ts             viewDirectionFor, frameSubjects
    rope.ts                verlet string sim + toCurvePoints
    kendama-colliders.ts   capsule colliders derived from KENDAMA_LAYOUT
    tricks/bigCup.ts       Big Cup pose, ken keyframes, tama path
  components/
    Ken.tsx                static primitive ken (was KendamaModel.tsx)
    Tama.tsx               animated ball
    String.tsx             rope-driven string
    TrickScene.tsx         Canvas composition, playback state, camera rig
src/app/stats/trick-viz-sandbox.tsx   dev-only viewer
```

## 3. The central abstraction: ken pose

The load-bearing idea. Previously the model was hardcoded at identity and trick keyframes were authored in world space, so no trick that holds the ken differently could be expressed — which is nearly all of them.

`KENDAMA_LAYOUT` is entirely **ken-local**, describing the ken in its neutral pose (spike up, base cup down). A trick declares a `KenPose` and maps landmarks into world space via `localToWorld`. Rotation order is pinned to **`'YZX'`** so a pose reads as named rotations rather than depending on the default `'XYZ'`.

Both the landmark math and the rendered group build their rotation from `kenEuler`, so they cannot drift apart. Keep that property.

Naming: **"ken"** means the whole assembly (shaft + serato + cups + spike); **"shaft"** means only the grip below the serato. That is why the topmost point is `spikeTip`, not `shaftTop`. `handle*` was renamed `shaft*`.

## 4. Big Cup geometry — verified, do not re-derive

Pose is `rotation: [0, -Math.PI/2, Math.PI/2]` in `'YZX'`: roll the big cup from +X up to +Y, then swing the base cup round to +Z (facing the player). Net local→world map is **`(x, y, z) → (-z, y, x)`**.

| Part | Local axis | World axis |
|---|---|---|
| Big cup | +X | **+Y** (up) |
| Base cup | −Y | **+Z** (toward player) |
| Spike | +Y | **−Z** (away) |
| Small cup | −X | **−Y** (down) |
| String hole | local `[0, 0.08, 0.08]` | **`[-0.08, 0, -0.08]`** |

Two consequences drive everything else. Both were learned by getting them wrong first:

1. **The tama cannot enter the big cup from below.** Directly beneath it sit the serato bar and the small cup facing straight down. It must pass the ken's level *beside* it and drop in from above — which is also what real ozara looks like.
2. **It must swing on the same side the string exits** (world −X here). Rising on the far side drags the string around the outside of the ken. `SWING_SIDE` is derived as `Math.sign(stringHoleWorld[0])`, never hardcoded.

The seat is derived, not placed: the tama (r 0.25) is wider than the cup mouth (r 0.225), so it rests **on the rim** at `sqrt(r_tama² − r_mouth²)` ≈ 0.109 above the mouth plane (`seatOffset` in `kendama-geometry.ts`). It never enters the cup, so it cannot clip through the wall.

## 5. Motion — the most important lesson

**Easing functions that end at zero velocity put a stall at that keyframe.** Chaining two `easeOutQuad` segments made the tama come to a complete stop twice mid-flight; that was the "two-step floaty" feel. Zero velocity is only correct at the apex.

The flight is now **one continuous function** baked into ~40 samples with `linear` easing via `bakeKeyframes`:

- **Vertical**: a single parabola from launch to catch.
- **Lateral**: an independent sine swing, peaking mid-flight so the tama is at its widest exactly as it passes the ken.

Driving the two axes separately is what makes it read as one gesture — neither has to pause for the other. The apex split is derived (under gravity, time ∝ √height, so the peak sits late at u ≈ 0.77), and the parabola's endpoint provably equals the seat exactly (the √ terms cancel), so there is no seam where flight hands off to the cushion.

**Do not "improve" this by reintroducing eased waypoints.**

The tama also hangs from the string hole *as the hole moves*, so the player's initial load shows up automatically rather than being faked with a separate downward nudge.

## 6. String: verlet rope with collision

The string is a 28-particle inextensible verlet rope (`rope.ts`) that collides with six tapered-capsule proxies for the ken (`kendama-colliders.ts`, derived from `KENDAMA_LAYOUT` so retuning a cup moves its collider).

Distance-constraint and collision passes are **interleaved**, not sequential: solving all distances then all collisions lets the final collision push leave the rope stretched.

Colliders are transformed to world once per frame — cheaper than converting every particle to ken-local and back, and valid only because the ken is never scaled.

Cup colliders are **solid, not hollow**. Fine here (the string never needs to sit inside a cup) but wrong for any trick where it should.

`stringRestLength: 2.7` is **true scale** and a deliberate choice — do not "fix" it back to a shorter stylized value.

## 7. Camera

`viewDirectionFor` composes the view direction from the pose itself: base-cup axis (near side, toward the player) + string-hole offset (the "inside" face) + elevation. For Big Cup that resolves to `[-1, ~0.35, +1]`. Viewing from the opposite side puts the ken between camera and action, so the catch happens behind the model.

`CameraRig` in `TrickScene.tsx` reframes tama + ken every frame and eases toward it with a framerate-independent exponential (`1 - Math.exp(-dt/τ)`, τ = 0.32s). It deliberately **trails** the action — a camera welded exactly to the tama reads as the tama standing still while the world moves. It **snaps on the first frame**, both so the opening shot is framed and because the real viewport aspect is not known until there is a frame.

`followAction` hands the camera to `canvasExtras` (OrbitControls) when false; the rig and the controls would otherwise both write the camera every frame. The sandbox exposes this as a "Free look" toggle.

## 8. Traps — do not rediscover these

1. **React Compiler is enabled** (`transform.reactCompiler=true`). A module-scope helper function defined inside a *component* file threw `ReferenceError: not defined` at runtime despite `tsc` passing. Moving it to a non-component module fixed it. If you hit an impossible ReferenceError, this is why.
2. **The browser console buffer persists across navigations.** Several rounds were wasted "fixing" errors that were stale entries. Verify a symbol still exists (`grep`) before believing an error that names it. Better: install `window.addEventListener('error', …)` after load and count live errors.
3. **Same-URL navigation does not remount the route.** OrbitControls retained a camera nudged by an earlier stray click, which read as the pose drifting. Use `window.location.href` with a changed query string for a real reload.
4. **`fov` is vertical.** The preview pane is tall (630×1329); at aspect 0.47 the horizontal FOV is under half the vertical, so width binds before height. Framing must use the real `camera.aspect`. This bug is invisible on a wide viewport.
5. **Lint rules `react-hooks/refs` and `react-hooks/immutability` are strict.** No reading or writing refs during render, no mutating `useMemo` values. Do play-token reset logic inside `useFrame`; use `useRef` (not `useMemo`) for mutable scratch, or allocate inside the frame callback.
6. **Slack rope collapses points** → zero tangent → `CatmullRomCurve3` NaNs its arc-length table → `points[NaN].x` crash every frame. `toCurvePoints` drops coincident neighbours and guards non-finite particles. Keep it.
7. **Sandbox access is gated.** Non-Home tab routes require completed onboarding. Set `localStorage` key `daily-dama:user-profile` to `{"version":1,"profile":{"hasCompletedOnboarding":true,"kenteiRank":1,"selectedTrickIds":[]}}` — the versioned wrapper is required and `kenteiRank` is a **number** 1–12. The route is nested under `/stats/` because the web tab router silently redirects unregistered top-level routes to Home.
8. **`AccessGateProvider` skips the password gate whenever `__DEV__`** — an interim change, production unaffected.
9. **`eslint.config.js` has a scoped `react/no-unknown-property` override** for `src/features/trick-viz/**/*.tsx`, needed because eslint-plugin-react does not know r3f's JSX intrinsics.

## 9. Verification workflow that worked

Temporarily set `durationSeconds={20}` in the sandbox to inspect individual phases — screenshots take 1–2s against a 2.2s animation — then revert. A temporary `globalThis.__kenDebug` written from `useFrame` settled an ambiguous "is the camera drifting?" question in one call; numbers beat eyeballing screenshots.

Always `grep` for `durationSeconds={20}` and `__kenDebug` before finishing.

Dev server: `preview_start({name: "daily-dama-web"})` on port 8091 — **not** the `web` entry in this repo's own `.claude/launch.json`.

Standard checks for this feature are `yarn tsc --noEmit` and `yarn lint`. There are no unit tests for trick-viz yet.

## 10. Not started

- Integration into the real Tricks/Sesh UI — this is still sandbox-only.
- Additional tricks beyond Big Cup.
- Tama spin / hole orientation; the tama is a plain sphere with no spike hole.
- Native (iOS/Android) verification of the `expo-gl` path.
