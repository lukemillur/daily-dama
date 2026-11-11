# T318 evidence: native Kentei reveal pacing and responsive badge

Branch `task/T318-give-the-native-kentei-reveal-deliberate`, Metro pinned to this worktree on port 8093 (cwd verified, `Android/iOS Bundled` logged). Existing dev clients were used (JS-only change, no native rebuild).

## Method and limits

- Frame analysis: recordings (`screenrecord` on Android, `simctl io recordVideo` on iOS) were sampled at 30 fps with a small AVFoundation script (no ffmpeg available). It measured the badge bounding box and badge-interior colour per frame. Videos are not committed.
- **Harness-driven, not real flows.** Onboarding was already complete on iOS and on Android user 10 (`t317test`), and the owner's Android user 0 was not touched. All Android and iOS reveal recordings used a temporary uncommitted route that renders the real `RankUpCelebrationModal` (promotion reveal; writes nothing). The onboarding reveal shares the same component, so the same entrance applies, but the real onboarding path on native was **not run**. The real onboarding reveal for rank 1 was exercised on web (browser profile, fresh state) and in Jest for ranks 1 and 12.
- A real rank-up on Android user 10 was not run.

## Devices

- Android: Pixel_10 (`emulator-5554`), Android 17 / API 37, 1080x2424 @ 420 dpi, GLES renderer `Apple M1 Max`. Run as user 10.
- iOS: iPhone 17e, iOS 27.0, 390x844 pt, UDID 31BF7946-E642-4522-A55F-7CB89E11CBD5.

## Entrance timing (fixed timed 900 ms, ease-out quad, 0.92 -> 1 scale plus fade)

| Case | Result |
| --- | --- |
| Android rank 12 | badge scale 538 -> 576 px, monotonic, no overshoot; interior colour settled about 0.8 s after the capture began (capture began near the start, about 15 percent through the fade) |
| Android rank 1 | first visible frame at 3.17 s, settled by 3.83 s (about 0.8 s); 546 -> 576 px, no overshoot |
| iOS rank 12 | 614 -> 658 px, fully settled about 0.77 s after the first visible frame; no overshoot |
| iOS rank 1 (first, cubic easing build) | about 0.55 s to 97 percent; easing was then changed to quad to make the settle read nearer 0.8 s |

Perceived settle is about 0.75 to 0.85 s because ease-out hides the last few percent of a 900 ms animation. This sits at the low edge of the 800-1000 ms criterion; the nominal duration is 900 ms.

## Layout and text size

- Android 720x1280 @ 320 dpi, font scale 2.0: badge, numeral, and capped title render without clipping; copy and Nice! button reached by scrolling; one press of Nice! dismissed the overlay.
- iOS content size `accessibility-extra-extra-extra-large`: first build showed the uncapped title splitting words ("level / ed"); the title was capped with `maxFontSizeMultiplier={1.3}`; after that, badge fine, copy and Nice! reachable by scrolling.
- Default text on both devices: settled screens show a circular badge, centered numeral, title, copy and button, with nothing clipped.

## Reduced motion

- Android: animator, transition and window animation scales set to 0; the badge appeared fully settled in one frame (no scale or fade). Passed.
- iOS: `ReduceMotionEnabled` set via `defaults`; app relaunched; the badge appeared at its final colour in one sampled frame with no intermediate frames. Passed, with the caveat that the harness route mounts after a navigation, so an intermediate frame could be hidden by the transition.

## Web

Dev server on 8093: onboarding rank reveal for rank 1 renders at 800x600 and 320x640; web keeps the previous spring motion values (asserted in `rank-reveal-motion.test.ts`). At viewport heights under about 733 px the badge now shrinks (180 px at 600 px high); at 800 px high or more it is the accepted 220/100/40. Console shows only the known benign styled-components media-query warnings plus an existing `props.pointerEvents` deprecation.

## Settings restored

- Android user 10 `font_scale`: 1.0 before, set 2.0, restored 1.0 (verified). `wm size` and `wm density` reset (verified 1080x2424 and 420). Global animation scales: `animator_duration_scale` was unset (deleted back to null), transition and window scales restored to 1.0 (verified). Foreground user returned to 0.
- iOS: content size was `large`, restored `large` (verified); ReduceMotionEnabled restored to 0 (verified).
- `adb reverse tcp:8093` (added by the Expo dev server for this run) was removed; other pre-existing reverse entries were left.

## Not run

Real (non-harness) onboarding reveal on Android/iOS; real promotion on a device; physical devices; TalkBack/VoiceOver.
