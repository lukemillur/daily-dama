// Manual mock for `expo-audio`, adjacent to node_modules per Jest's automatic node-module
// mocking convention (https://jestjs.io/docs/manual-mocks#mocking-node-modules).
//
// `expo-audio`'s real module touches native-only class internals
// (`AudioModule.AudioPlayer.prototype`) at import time, which isn't backed by jest-expo's
// generic native-module mock. That crashes any test file that transitively imports a module
// using `expo-audio` (e.g. `src/features/sesh/components/sesh.tsx`) unless the package is
// mocked before import. This mock covers only what this app currently uses.

export function useAudioPlayer() {
  return {
    play: () => {},
    pause: () => {},
    seekTo: () => {},
    replace: () => {},
  };
}
