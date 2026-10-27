# Daily Dama — Physics Visualizer Handoff

Written so a fresh context can add tricks to the physics visualizer without re-deriving what made the existing ones land. Project context (state boundaries, product shape, collaboration style) lives in [AGENTS.md](AGENTS.md).

This is the visualizer going forward. The older keyframed system in `src/features/trick-viz/` ([TRICK_VIZ_HANDOFF.md](TRICK_VIZ_HANDOFF.md)) is not being developed further; read it only for its environment traps or its record of verified geometry.

## 1. What this is

`src/features/kendama-model/` is an anatomically measured kendama (handle, separate hourglass sarado, tama), in millimetres, measured from a 3D scan of a Sweets "Boost". Tricks are physics, not keyframes: **a trick is a hand controller with human limits that moves one body; the string and the other body respond only under physics.** Nothing is scripted to land. A trick lands because the hand does what a player does.

It lives only in the dev sandbox at `/app/stats/kendama-model-sandbox` (Strung and Anatomy modes). It is not wired into the app's Tricks or Sesh UI, and what it is for is still an open product question (§9).

Landing: Big Cup, Spike, Big Cup to Spike, Airplane and Base Cup. Base Cup to Spike lands 2 of 16 (§4).

## 2. Where things live

All paths under `src/features/kendama-model/`.

| File | Owns |
|---|---|
| `model/anatomy.ts` | Measured dimensions and lathe profiles for every part. |
| `model/hand.ts` | The hand: position and wrist orientation, clamped to 3 g, 4 m/s, 400 rad/s², 30 rad/s. `trackAxis` / `trackOrientation` are the critically damped trackers every controller uses. |
| `model/string-sim.ts` | The ken-held simulation: kinematic ken, 20-point string, rigid tama tied at its string hole, contacts with bounce and friction. Fixed `SUBSTEP` of 1/480 s, so results do not depend on frame rate. |
| `model/tama-held-sim.ts` | The tama-held simulation (Airplane): kinematic tama, free rigid-body ken. |
| `model/string-chain.ts` | `solveChain`, the string solve both simulations share; a `ChainEnd` describes whichever body is free. |
| `model/collision.ts` | Sphere-versus-lathe collision from the parts' own profiles; `collideSpikeWithTama` meets the tama's real bore. |
| `model/mass.ts` | Ken and tama mass properties integrated from the profiles (ken 79 g, centre of mass 31 mm below the string hole). |
| `model/stringing.ts` | Grips (`big-cup`, `spike-up`, `spike-down`), handedness, string length (340 mm hole to hole), `gripPose`. |
| `model/catch-trick.ts` | The shared ball-catch kernel: phases, intercept planners, the rise turn, `TrickRun` for chaining tricks, seat pops and turnovers, `createSeatedRun` for starting with the ball placed in a seat. |
| `model/tricks.ts` | Each ball trick as data, and `ROUTINES`, the runs the sandbox offers. |
| `model/airplane.ts` | Airplane's own controller (the bodies are swapped, so the ball kernel does not apply). |
| `model/strung-render.ts` | Framings per kind of trick, string render curves. The drawn string is pushed out of the ken and tama (`keepOutside`); this is cosmetic only and never feeds back into the simulation. |
| `components/StrungKendamaScene.tsx` | The frame loop: steps the run, places bodies, owns the camera framing. |
| `src/app/app/stats/kendama-model-sandbox.tsx` | The sandbox route: chips, phase readout. |

## 3. The model

**Two simulations, one string.** In ball tricks the hand holds the ken and the tama flies (`string-sim.ts`). In Airplane the hand holds the tama and the ken flies (`tama-held-sim.ts`). Both use one string solve. The extraction left the ken-held results bit-identical, and that must stay true: tuned physics can pass every test and still change behaviour, so compare exact numbers before and after any change to shared code (§7).

**A ball trick is data plus one kernel.** `CatchTrick` fields describe the catch target: `grip`, `catchAxis`, `seatHeight`, `kenTop`, `apexClearance`, `alignRoom`, `followsHole`, optional `riseTurn`, and `intercept`. The kernel runs the phases settle → pull → rise → catch → absorb → landed or missed. `stepCatch` is the only authority for phase changes. A `TrickRun` leads from one trick's seat into the next by popping the ball and turning the wrist in the air.

**The hand is the honesty constraint.** A controller decides accelerations; the hand clamps and integrates them. Do not raise the hand limits to make a trick land. Every lesson in §5 comes from respecting them.

**Collision.** The string runs against the parts' lathe profiles. The ball's shell meets the ken through `collideWithKen`, which resolves the **single deepest contact**, with one exception: inside the base cup's mouth it blends in the far side of the rim ring (`RING_SHARE`), so a ball resting on the ring is held from both sides. The spike meets the bore through `collideSpikeWithTama`. A spike that strikes the ball's outer shell, clear of the bore's lip (`LIP_ROOM`), bounces with friction like any other contact rather than pinning the ball on its tip (`spikeOnShell` in `string-sim.ts`). Contacts below 250 mm/s approach speed do not bounce. Read the comments on `PARTICLE_MASS` and `solveString` before changing either: lighter particles or an iterative solve make the string stretch and bounce.

## 4. The tricks, and what each taught

### Big Cup and Spike

The kernel in its plain form. The pull is sized open-loop from ballistics (`launchSpeedFor`). The hand steps aside so the ball passes the ken (`besideBall`), slides under it from the apex, and meets it with the `cubic` intercept. Spike adds `followsHole`: the wrist tilts the spike to follow the ball's hole, and the hand aims along the hole's axis rather than at the ball's centre.

### Big Cup to Spike

A pop off the big cup, turning to the spike-up grip in the air. The grip turn waits until the ball is clear of everything the turning sarado can sweep (`CLEAR_OF_TURN`), and the pop goes only as high as that needs: every extra millimetre draws slack string over the ken, which tugs the string hole and turns the ball. Big Cup seats the ball 22–26° off hole-down, so it is the least reliable chained trick: 12 of 16 in the fingerprint set (§5.11).

**Seat pops, shared by every chained trick.** `continueCatch` sizes the pop so the ball stays up for the wrist's quickest turn to the next grip (`turnTime`, from the hand's wrist limits) plus `POP_TURN_SLACK`, and never lower than clearing the ken (`launchSpeedFor` from `'seat'`). After a seat pop the hand brakes hard instead of homing gently, so the ken does not ride up under the ball and carry it.

### Airplane

The hand holds the tama hole up and flips the free ken onto it.

- **The flip comes from a sweep, not the pull.** A hanging ken lines up with its string within a few hundredths of a second, so it leaves the pull turning at the rate the string turns: the hand's sideways speed over the string's length. A straight pull gives no turn. `SWEEP_ANGLE` leans the pull toward where the spike already leans.
- **The ken drifts the way it turns**, roughly in proportion to the angle; a half turn carries it about 450 mm out, so `AIRPLANE_REACH` is wider than the ball tricks'.
- **The string is the main hazard.** It trails the flying ken in a taut loop, and any fast vertical move of the ball drags that loop and brakes or reverses the spin. The hand stops its lift with heavy damping and drifts home slowly.
- **String draped over a free body must not be marked touching.** The solve weighs a touching particle as the wood behind it; on the free ken that let the ken pull itself along by a point on itself, gaining 200 times its energy. `airplane.test.ts` guards this.
- **The catch predicts the spike-down moment** (`firstSpikeDown`: ballistic centre, constant spin), waits beside the ken until it is near (`PLAN_LEAD`), then meets it at 0.6 of its speed. Seated, the wrist levels the ball gently (`LEVEL_OMEGA`).
- **Fragile.** `SWEEP_ANGLE` (0.6) and `LAUNCH_SPEED` (3030 mm/s) are hand-tuned; from rest it lands between about 3000 and 3060 mm/s, and 4 of 7 from swinging starts. The ken starts 400 mm below the hand, so the throw is fast and the hand overshoots above the ken (§5.5). Frictionless contacts let a seated ken rock slightly in the bore.

### Base Cup

Onto the shallow dish at the bottom of the handle, in the `spike-down` grip. Two kernel features exist for it, both opt-in per trick, so the other tricks stayed bit-identical:

- **`riseTurn`**: the pull starts spike up, and `climbingGrip` turns the wrist half a turn about the player's left-right axis in step with how far the ball is through its planned climb (`Climb`), eased at both ends. That axis runs through the sarado's waist, so the string barely moves, and the handle sweeps a plane the rising ball never enters. The wrist trails the target a little, because the ball climbs fastest early: lying across at half the climb, fully over at the apex.
- **`intercept: 'dive'`**: wait, then dive at a steady 2 g, arriving at 0.9 of the ball's speed. The `cubic` failed here (§5.2). Spike regresses under the dive, so Big Cup and Spike keep `cubic`.

`apexClearance` is 135 mm, in the middle of a broad window (80–230 mm all land from rest), and the cushion is about 100 mm. The sandbox frames it wider (`BASE_CUP_FRAMING`) so the turn stays in view.

### Base Cup to Spike

Base Cup, then a pop onto the spike. Lands 2 of 16 in the fingerprint set. It does not land reliably yet; the diagnosis below is measured, and the open direction is in §9.

**Fixed: the wrist waited for the sarado, not the cup.** A seat pop holds the old grip until the ball is clear of everything the turn can sweep. `CLEAR_OF_TURN` measures only the sarado, and a ball on the base cup already sits beyond it at the end of the handle. So the half turn began the moment the ball stopped pressing, and the cup's rim rubbed up to 7 rad/s of spin onto a ball still resting on it. The turn now also waits until the ball is `RELEASE_GAP` off the seat it left (`seat`, `gapFromSeat`). Every other trick is bit-identical: a ball beyond the sarado's sweep is always well off the big cup. The count fell from 4 to 2 because two starts had landed only when that rub happened to turn the hole the right way. With the gate, a ball placed hole down on the base cup lands the spike for both stringings (`catch-trick.test.ts`), and the gap window is broad (3–20 mm all land).

**Measured, not yet fixed:**

- **Where the hole goes.** The pull leaves the hole within 6° of down. About 1 rad/s of residual spin adds 10–25° by the apex. Base Cup's catch adds about 30° more: the `dive` waits about 46 mm above home, so a hand still coming down from the pull's overshoot reverses upward at the apex and tugs the string. Seats end 21–149° off down; `MAX_FOLLOW_TILT` is 34°.
- **The pop disturbs the hole as well.** In the first 0.25 s, string pulls of 4–20 g reach the free ball. Three sources were found, and a scratch fix for each cleaned some starts but not others:
  - The early lurch onto the hole line scrubs the rim across a ball that has not yet lifted. Riding under the ball until it is clear fixes that.
  - The wrist retraces Base Cup's rise turn, which can swing the handle into string draped along it. Choosing the direction from where the string lies up the handle helps; the string's exit at the sarado is the wrong guide in the spike-down grip.
  - Hole-down seats amplify every tug (§5.7).
- **Why the scratch fixes were not kept.** Stacked, they landed 0 of 16, and outcomes flipped from start to start (§5.11). The cleanest pops still let the hole drift 7–76°.

When the spike misses the hole and strikes the shell, the ball now bounces and rolls off. Two changes made that honest: the spike-on-shell contact (§3), and the catch stops steering under a ball that touches the ken further than `BOUNCED_OUT_DISTANCE` from the seat. Before them, the hand kept chasing the ball and balanced it on the tip as no hand could.

### Hole-up to Spike (paused, does not land)

The sandbox's "Hole-up to Spike" chip starts the ball seated hole up on the base cup (`createSeatedRun` with `TAMA_HOLE_UP_QUATERNION`), the hole-control setup a player would use for Base Cup to Spike. The hole must turn half over in the air, which the wrist cannot follow (`MAX_FOLLOW_TILT`), so `continueCatch` plans a **turnover**:

- **The pop swings the ken about the ball's centre**, hand velocity ω × (hand − ball), with the wrist turning at the swing speed over the radius. The cup carries the ball round by friction instead of sliding under it.
- **The spin axis unwinds the string** (`turnoverFor`): it rolls the ball's string hole toward the ken's string hole, d × up. Turning the other way wraps the string half round the ball, and at the apex it runs out and pulls the ball down, which looks like a different trick (pulling the ball onto the spike with the string).
- **Release only once the ball is clear of the seat** (`RELEASE_GAP`). Releasing at the first gap let the wrist turn on ahead and the seat's trailing rim rub the spin back off. If the spin never comes up to `SPUN_SHARE`, the pop releases when the lift ends rather than hanging.
- **The catch plans from the observed spin** (`meetWhenHoleDown`): it predicts when the hole will face down and meets the ball at the height it will have fallen to by then, within `MEET_BELOW_HOME` / `MEET_ABOVE_HOME`.

It lands 0 times. The cause is structural, not tuning: on a hole-up seat the string leaves from under the ball, over the base cup's rim and along the handle, with up to 17 of 20 particles resting on the wood. The pop's sideways swing (up to 1.7 m/s) drags that draped string and tugs the ball at about 20 g, killing the spin within milliseconds. After release, the wrist turning to the catch grip at its 30 rad/s limit whips the same string and has spun one ball to 78 rad/s the wrong way. A softer post-release turn and the spin-based catch each fixed some starts and broke others, with no landings.

**String-cut result.** The isolation run (string solve switched off at the pop) does not land either. From a placed hole-up seat the ball releases at the same 5.9 rad/s with or without the string, so the pop's swing is not what kills the spin. With the string cut it arrives 35° off down, just past `MAX_FOLLOW_TILT`; with the string, 83°. The string's harm comes after release, and the turnover's spin and catch timing are also slightly short on their own. From Base Cup's real, tilted seats the turnover hardly spins the ball (about 1.8 rad/s). Its axis is chosen to unwind the string, not to bring a tilted hole round; only a seat that is exactly hole up leaves the axis free.

## 5. Catch principles

What made these tricks land, generalised for the next ones. Each names where it was learned.

### 5.1 Match speeds at contact; the cushion follows

A contact bounces once the approach speed passes 250 mm/s. The hand must be moving with the falling body when they meet: the ball tricks aim for 0.9 of its speed (`CATCH_SPEED_MATCH`), Airplane 0.6. The cushion's depth then follows from the fall: roughly arrival speed over the absorb rate. A higher throw means a faster arrival and a deeper knee bend. *Base Cup: its longer fall needs about 100 mm of cushion, where Big Cup stays within 40.*

**For a new trick:** set a speed-match target, and size the cushion from the throw height.

### 5.2 Plan within the hand's limits

A plan that demands more than the hand can give does not fail visibly. The hand clamps, arrives late, and the ball bounces. The `cubic` intercept asks for little at first and most at the end; on a long fall that end demand passed 3 g, and Base Cup arrived 1100 mm/s faster than the hand. The `dive` asks for a steady 2 g with headroom left over.

**For a new trick:** prefer plans whose demand is steady or front-loaded, with headroom under every cap. Check a plan's peak demand, not only its endpoints.

### 5.3 The 3 g limit is shared across directions

`moveHand` clamps the whole acceleration vector. A catch that starts out of line spends the budget lining up and cannot also match speed. *Base Cup: the catch began 67 mm out of line, and the speed match failed.*

**For a new trick:** line up first, then commit vertically. Airplane waits beside the ken; the ball tricks plan to meet lower while out of line (`alignRoom`). Better still, design the flight so the hand is under the body before it starts to fall.

### 5.4 Airtime is the currency

A higher throw buys time to line up and turn, and costs a faster arrival and a deeper cushion. How much is needed depends on how far the ball must climb past the ken: Base Cup's ken top is 105 mm above the hand against Big Cup's 37, so it pulls higher (`apexClearance` 135 against 110).

**For a new trick:** list what the hand must do while the body is in the air, and how long each step takes, before choosing the throw height.

### 5.5 Every pull overshoots

Reaching launch speed v at 3 g and braking at 3 g leaves the hand about v²/3g above where it started: around 300 mm for these throws. The raised ken then blocks a ball that has not yet climbed past it (Base Cup), or sits above the ken it must catch (Airplane).

**For a new trick:** budget for the overshoot. The general fix is a wind-up, a knee dip or a pendulum swing before the pull, so the pull ends near home. It is not built yet and is the first candidate for any high-throw trick.

### 5.6 Throw open-loop, then react to what you see

The pull is sized from ballistics. Everything after it watches the body: steadying the swing until it is calm, the rise turn keyed to the ball's climb, Airplane predicting the spike-down moment. That is why the tricks survive swinging starts.

**For a new trick:** key timing to the body's observed state, not the clock, and replan every substep so the plan becomes feedback.

### 5.7 The string is a hazard, and a tool

**Hazard:** a moving hand drags the string, and the string drags the flying body. That is why Airplane brakes its lift gently and why a chained pop goes no higher than it must. **Tool:** rotation can come from the string. Airplane's flip is the string turning during a sideways sweep, at sideways speed over string length.

**For a new trick:** turn the wrist about an axis through the string hole (Base Cup), and list every hand move that tugs slack string. **String draped on the ken moves with the ken**: friction holds it, so any sideways move or fast turn drags it and tugs the ball (Hole-up to Spike). Check where the string lies at the start of each move, not only whether it is slack.

**Which way the hole faces sets how much a tug spins the ball.** The string pulls at the string hole, opposite the hole. With the hole down, the string hole is on top, the string leaves over the ball's side, and a tug acts with nearly the full radius as its lever. The angular acceleration is about 2.5·a/R, so a 3 g tug for 3 ms adds about 7 rad/s. With the hole up, the string leaves from the bottom toward the ken, nearly through the centre, and the same tug barely turns the ball. A hole that must stay put through a pop needs well under 2 rad/s of disturbance in total (Base Cup to Spike).

### 5.8 Turn only where the turn cannot hit anything

A turning ken sweeps its cups and handle through space. Big Cup to Spike waits until the ball is beyond everything the turn can reach; Base Cup turns in a plane the ball never enters.

**For a new trick:** for every turn, either wait for clearance or choose an axis whose swept plane avoids the body. "Clear" means clear of the part the ball is sitting on, not only of the sarado: a seat at the end of the handle is already beyond the sarado's sweep (`gapFromSeat`, Base Cup to Spike).

### 5.9 The catch target sets the tolerances

Each seat accepts different errors:

- **Cup rim:** forgiving sideways, sensitive to arrival speed.
- **Spike:** needs close alignment and the ball's hole facing it (`followsHole`, `alignRoom` 4).
- **Base cup:** shallow, and the ball sits on the rim ring. Because `collideWithKen` takes one deepest contact, a ball on a ring is pushed from one side at a time, with a normal about 54% sideways there, so a firm landing becomes a sideways kick a real ring would cancel. A gentle arrival is a requirement.

**For a new trick:** describe its target with the existing `CatchTrick` fields, and work out which error it tolerates least.

### 5.10 Balancing: hold steady, do not follow the lean

Seated after Airplane, a wrist that follows the ken's lean makes it lean further, like balancing a stick the wrong way. Levelling gently holds it.

**For a new trick:** this applies to every balance (Lighthouse, stilts, perches).

### 5.11 Process

- **Sweep before tuning.** Run a grid of parameters against several starts (rest, either stringing, three frame rates, a moved home, swinging starts). A broad window means the approach is sound. Outcomes flipping case to case mean something structural is wrong: stop tuning and find it.
- **Measure at the moment of contact.** The relative velocity one substep before first contact found Base Cup's cause in one run.
- **Fingerprint shared changes.** Before changing the kernel, a planner or the physics, record exact final positions for every landing trick from several starts; after the change, diff them. A new behaviour belongs behind an opt-in field until the existing tricks are proven unchanged.
- **Measure tautness by its effect.** `stringPathLength` sums the segments and reads near 340 mm whether or not the string is taut. A taut string shows as the flying ball's acceleration departing from gravity.
- **Keep scratch diagnostics out of the commit.** A throwaway `__diag.test.ts` beside the model is the quickest probe; delete it before committing.

### 5.12 Hole control

A player lands each trick with the hole where the next one needs it: for a spike after the base cup, hole up, so a lift and half turn drops it on. A chained trick into a hole catch is only as reliable as the hole the previous seat leaves. The ken may also track the hole in the air within a reasonable margin, moving with it, but it must not chase a ball it has thrown off line.

**For a new chained trick:** decide which way the previous seat must leave the hole, and plan that landing, before tuning the pop. Not built yet: the kernel lands each trick without regard to the next. Weigh hole down against hole up with §5.7's lever in mind. Hole down needs no turnover but makes the ball sensitive to every string tug through the pop. Hole up shrugs off tugs but needs a half turn in the air. Base Cup's flight naturally carries the hole down; throwing it higher so the string turns it over gives scattered 93–175°, not control.

## 6. Adding a trick

1. Decide which body the hand holds. A ball trick is a `CatchTrick` in `tricks.ts` plus a `ROUTINES` entry; a ken-flying trick needs its own controller, as Airplane has.
2. Describe the catch target (§5.9) and the grips the trick starts and finishes in. Add a grip to `stringing.ts` if needed, with a test of its orientation.
3. Work through §5.4, §5.5 and §5.8 on paper: what the hand must do in the air, how long it has, where the overshoot leaves it, what each turn sweeps.
4. Add it to the shared `describe.each` in `catch-trick.test.ts`, and write a trick test for what makes it that trick (`base-cup.test.ts` checks the turn).
5. Sweep (§5.11) and choose a value in the middle of the window, not the edge of a lucky one.
6. Add a sandbox chip, and a framing in `strung-render.ts` if the action leaves the default view.
7. Update this document in the same change.

## 7. Verification

- **Tests:** `yarn jest src/features/kendama-model` while iterating, then `yarn tsc --noEmit` and `yarn eslint src/features/kendama-model src/app/app/stats/kendama-model-sandbox.tsx`. Suites are deterministic; a run is slow (around a minute) because each trick simulates seconds at 480 Hz.
- **Browser:** `preview_start({ name: "daily-dama-web" })` (port 8091; it moves to the next free port if taken, so use the port it reports). The sandbox is gated: set `localStorage['daily-dama:user-profile']` to `{"version":1,"profile":{"hasCompletedOnboarding":true,"kenteiRank":1,"selectedTrickIds":[]}}` (versioned wrapper required; `kenteiRank` is a number), then load `/app/stats/kendama-model-sandbox`. Turn on Slow-mo (quarter speed) to see the phases; the readout under the chips names the current one.

## 8. Traps

1. **Never key the `<Canvas>` to reset it**: that loses the WebGL context. Restarts watch a `runToken` inside `useFrame`.
2. **React Compiler is on.** A helper defined in a component file can throw `ReferenceError` at runtime though `tsc` passes. Keep helpers in `model/`.
3. **Refs are lint-checked strictly** (`react-hooks/refs`, `react-hooks/immutability`): no ref reads or writes during render. Reset logic lives in `useFrame`.
4. **The frame loop owns the camera.** `OrbitControls` takes no `target` prop; `applyFraming` sets it, and only when the kind of trick changes, so a viewer's orbit survives rerunning one trick.
5. **The web tab nav covers the top of the route** with a full-width hit area. Sandbox controls live in the bottom stack.
6. **Same-URL navigation does not remount the route.** Change a query string to reload.
7. **The console buffer survives navigation.** A stale error from a mid-edit reload reads as a live bug; open a fresh tab, and check that a named symbol still exists before believing it.
8. **Files written under `src/` while the sandbox runs trigger fast refresh**, restarting the run mid-flight. Reload before judging one.

## 9. Open questions and known limits

- **What the visualizer is for** is undecided: teaching a learner a trick, a sandbox, or illustrating Kentei entries. The answer decides between more tricks and app integration.
- **The wind-up** (§5.5) is the most likely fix for Airplane's fragility and the main tool for future high throws.
- **Single-contact collision** (§5.9) still applies everywhere but the base cup's ring (§3). The big cup and small cup rims would need the same blend if a trick rests the ball on them.
- **The string pushes the ball one way.** A string particle pushed out of the tama moves; the ball does not. Pushing the particles near the string hole out of the ball injects spin through the tie, so the last three particles skip tama collision, and the drawn string is only pushed out at render time. A two-way string–ball contact solve would remove this; it is the likely prerequisite for any trick where the string wraps the ball.
- **The string's 17 mm spans** pass through thin wood between particles. Colliding spans with the ken stretched the string to 402 mm and failed the stretch tests, so it was reverted.
- **Hole-up to Spike is paused** (§4), and hole control (§5.12) is not built.
- **Base Cup to Spike (2 of 16) needs a direction decision** (§4). The owner first chose hole up, then hole down on the evidence in §4. The later string-lever finding (§5.7) favours hole up again for the pop, at the price of a turnover. The candidates: (a) hole up, with a turnover planned now that the string-cut run shows its own errors (spin short, about 35° off); (b) hole down, with a pop that keeps every string tug off the ball (all three §4 sources at once) and a Base Cup catch that does not reverse at the apex; (c) first review whether the string's friction and one-way push (below) exaggerate tugs at the string hole. The scratch versions of (b)'s fixes were not committed; §4 describes each. Rebuild them behind an opt-in field.
- **Contacts on the free ken are frictionless**, so a seated ken can rock in the bore.
- **The spike-up grip orientation** has not been confirmed by the owner.
- **Not started:** Moshikame (§5.1, §5.4 on every catch), Lighthouse (§5.9, §5.10), Trapeze (§5.7), compound Kentei sequences.
