# T315 evidence: Android onboarding trick-selection reachability

Result: the reported failure did NOT reproduce on a responsive, pinned build. No fix was made.

Environment (2026-11-11)
- AVD Pixel_10, Android 17 (ro.build.version.release 17, API 37), 1080x2424, 420 dpi, booted with `-gpu host -no-snapshot-load`.
- `dumpsys SurfaceFlinger | grep GLES:` -> `Google (Apple), Android Emulator OpenGL ES Translator (Apple M1 Max), OpenGL ES 3.0 (4.1 Metal - 91.7)` (hardware GL, not SwiftShader).
- Installed dev client com.dailydama.app, runtime exposdk:57.0.0, launches and loads the bundle.
- Branch HEAD 2803bc1 (task branch with `origin/development` merged in). Metro started from this worktree on port 8137 (listener cwd confirmed to be this worktree), `adb reverse tcp:8137`, log showed `Android Bundled ... expo-router/entry.js`.
- Fresh environments: secondary Android users `t315` (id 11) and `t315b` (id 12), created for this ticket and left in place. Owner user 0 data untouched. Font scale set to 1.5 for users 11 and 12 (per-user setting).

Observations
- Rank 1, font scale 1.0 and 1.5 (user 11): the SectionList scrolls; all five tricks including "Pull up spike (Spin or No spin)" are reachable; rows select/deselect (a12, a16); "Start practicing" is reachable and enabled, fully above the system navigation bar (a11, a15, a16). Duration -> theme -> Finish onboarding -> Sesh (a17, a18, a19).
- Cold relaunch (`am force-stop --user 11`, relaunch through the pinned Metro): Home shows the completed onboarding, Tricks tab shows Big cup and Base cup selected under "Focused tricks, 2 in rotation" (a20, a21).
- Rank 6 with long names ("1 turn lighthouse, Tradespike", "Big cup, Kenflip big cup, Spike", ...), font scale 1.5, fresh user 12: all rows reachable, one selection toggled and untoggled, Start practicing enabled and visible (b04, b05).
- Only layout oddity: dev-only (`__DEV__`) absolute-position sandbox links in `src/app/app/home.tsx` render over the bottom edge near the footer. They do not cover Start practicing at either font scale tested and do not exist in release builds.
- Prior-run screenshots copied from the earlier worktree are in `prior/` (same result at default and 1.5 font).

Not run
- iOS Simulator selection/finish check, web onboarding check, regression test, tsc: not run because there is no defect or code change to guard (Notes: do not manufacture a fix).
- Not covered by this environment: physical devices, 3-button navigation mode, other API levels/OEM skins, display-size scale changes, the owner's original device and data state.
