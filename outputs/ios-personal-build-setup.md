# Daily Dama: personal iPhone build

## First iteration

Launch a development build in the iOS Simulator and verify the guest practice
loop and saved history. Physical-device installation and a Release configuration
that works without Metro follow later. No paid Apple membership, TestFlight, Android work, native account
implementation, or unfinished-Sesh process-death recovery is included yet.

The owner explicitly resumed iOS work on 2026-10-29. The standing web-only rule
continues to apply to Android; do not expand this effort to Android.

## Readiness checkpoint: 2026-10-29

- Initial repository: Expo 57.0.10, React Native 0.86.2, React 19.2.3; clean working tree
  before setup work, on `feat/kendama-anatomy-model`.
- Mac: M1 Max MacBook Pro, 64 GB RAM; upgraded to macOS 27.2 and Xcode 27.1.
- Node 24.14.0 and Yarn 1.22.22 are installed.
- Free space was about 87 GiB when simulator build work resumed.
- `pod --version` fails: an executable under Ruby 3.0 tries to use Ruby 4.0.1,
  which cannot find the CocoaPods gem. Repair after the OS/toolchain upgrade.
- Prepared Expo 57.0.31 / React Native 0.86.3, SDK-compatible package patches,
  `expo-dev-client`, and `expo-build-properties` with iOS scene support.
- Configured provisional bundle identifier `com.dailydama.app` and generated
  the ignored iOS project. Scene manifest and factory-provider conformance
  were confirmed in the generated files.
- Homebrew itself also fails to start (missing `sorbet-runtime`). Rather than
  alter the global toolchain, installed CocoaPods 1.17.0 under
  `/tmp/daily-dama-ios-gems`. This is temporary and may need reinstalling after
  cleanup/reboot. `pod install` passed (113 installed pods). Generated
  `ios/.xcode.env.local` points at the working NVM Node 24 executable.
- Owner installed iOS 27.0 and 27.1 simulator runtimes. Selected iPhone 18 Pro
  on iOS 27.0 (`5CACC5E8-8237-4F18-BEDF-E63C5EEE42CD`) for the first build.
- Full application verification passed after dependency/configuration updates:
  tests, lint, TypeScript, and web export (`node .claude/scripts/verify.mjs`).
- Dependency security gate failed on existing high/critical advisories. All 13
  gated advisory IDs in its report also appeared when auditing the original
  HEAD package.json/yarn.lock in an isolated temporary directory. No advisory
  exceptions were added. This remains a security-gate limitation, not a pass.
- Native build succeeded (zero errors, two Xcode script-phase warnings) and
  installed/launched in the iPhone 18 Pro simulator. Metro runs on port 8082.
  Build output: `/tmp/daily-dama-ios-build.log`.
- First launch exposed website `<Head>` metadata running on native and throwing
  because no handoff origin was configured. Guarded website metadata with
  `Platform.OS === 'web'` in the landing route and application layout. Native
  handoff is outside this iteration. Added a root-route regression test.
- After that fix, root-route and landing component tests, lint, full TypeScript,
  and web export passed. A test-cleanup callback initially returned Jest's API
  object; changed it to return void and reran typechecking successfully.
- Visually verified the landing screen, entry to onboarding, and the skill-level
  selection screen. Complete onboarding, tab navigation, Sesh, Stats, and
  persistence checks remain pending. The simulator is left at skill selection.
- Generated `/ios` and `/android` directories are already ignored by Git.
- Native Supabase and Sentry initialization are explicitly disabled in source.
- `yarn expo export --platform ios --output-dir /tmp/daily-dama-ios-export`
  passed on 2026-10-29 (2,838 modules). This verifies JavaScript/asset bundling,
  not native compilation, runtime behavior, or device signing.

## Owner: next action

Use the running simulator to complete onboarding and explore the app. Report
layout or interaction defects as they appear. Apple Account sign-in, device
connection, and paid enrollment are unnecessary for this simulator milestone.

Metro remains running in the build process. To resume it later, use
`yarn expo start --dev-client --port 8082` and open the installed Daily Dama app.
Native dependency/configuration changes require another native build; routine
JavaScript changes use Fast Refresh.

## Later: physical device setup

1. Back up the Mac before the macOS upgrade.
2. macOS 27.2 and Xcode 27.1 are installed; the required SDK 57 scene-support
   configuration is prepared. Recheck versions if the toolchain changes.
3. Complete the simulator milestone before connecting a physical device.
4. In Xcode Settings > Accounts, sign in with an ordinary Apple Account.
   Use the free Personal Team; paid enrollment is unnecessary for this path.
5. Connect the unlocked iPhone to the Mac with a data cable and accept trust
   prompts. Note the phone model and iOS version for compatibility checking.
6. Enable Settings > Privacy & Security > Developer Mode when available;
   connecting through Xcode may be needed before the setting appears. Complete
   the required restart and confirmation.

Stop after toolchain setup and return to the chat. The agent can then recheck
versions, repair CocoaPods, and prepare the app. Apple sign-in, system upgrades,
and physical-device confirmations remain owner actions.

## Agent: resume after toolchain setup

1. Recheck Git status, Xcode selection/version, runtime installation, and disk
   space. Preserve unrelated work and stay on Expo SDK 57.
2. Use the isolated CocoaPods environment below until global tooling is repaired.
   The old Homebrew Node 21 binary also fails (missing ICU library), so prepend
   the working NVM Node 24 directory explicitly for native subprocesses.
3. Keep native settings in Expo configuration and generated directories ignored.
   `yarn expo prebuild --platform ios --no-install` generates iOS only, but may
   rewrite both package scripts; preserve the existing Android script.
4. After pods are installed, build and launch the selected simulator with
   `yarn ios`. No Personal Team or signing configuration is needed here.
5. Defer `yarn expo run:ios --device` until simulator behavior is ready and the
   owner is ready for a physical-device installation.
6. Verify launch, onboarding, Tricks, Sesh completion, Stats, persistence after
   relaunch, keyboard access, safe areas, and foreground/background timing.
   Surface defects as concrete follow-up work; do not claim these checks passed
   from a successful bundle or compilation alone.
7. Build a local Release configuration for the phone, using
   `yarn expo run:ios --device --configuration Release`, and verify cold launch
   and offline practice with Metro stopped.
8. Run the repository's required automated checks for any dependency/config or
   application changes. Preserve the existing web experience.

### Temporary CocoaPods invocation

Run from the generated `ios` directory, using the working Node 24 on PATH:

```sh
env PATH="/Users/luke/.nvm/versions/node/v24.14.0/bin:/tmp/daily-dama-ios-gems/bin:$PATH" \
  GEM_HOME=/tmp/daily-dama-ios-gems GEM_PATH=/tmp/daily-dama-ios-gems \
  NODE_BINARY=/Users/luke/.nvm/versions/node/v24.14.0/bin/node \
  /tmp/daily-dama-ios-gems/bin/pod install
```

If the temporary gems have been removed, reinstall them with the working Ruby:
`gem install cocoapods --install-dir /tmp/daily-dama-ios-gems --no-document`.
Set `ios/.xcode.env.local` to the same working Node binary before compiling
through Xcode if the build otherwise resolves the broken Homebrew executable.

## Free signing constraints

Personal Team provisioning profiles expire after seven days. Refresh signing
and install over the existing app with the same bundle identifier; avoid
deleting the app because deletion removes local practice data. Free signing
also limits capabilities and registered apps/devices. Revisit paid membership
when distribution or required capabilities justify it.

## References

- [Expo SDK 57 requirements](https://docs.expo.dev/versions/v57.0.0/)
- [Apple Xcode/macOS compatibility](https://developer.apple.com/xcode/system-requirements/)
- [Apple developer downloads](https://developer.apple.com/download/all/)
- [Local development builds](https://docs.expo.dev/develop/development-builds/introduction/)
- [Free Apple Account limitations](https://developer.apple.com/help/account/basics/about-your-developer-account)
- [SDK 57 and Xcode 27 caveat](https://expo.dev/changelog/sdk-57)
