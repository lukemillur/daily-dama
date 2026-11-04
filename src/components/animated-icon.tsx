// Native has no JS overlay: the OS-level splash (configured by the expo-splash-screen plugin in
// app.json) is held until the first hydrated screen calls hideNativeSplash(). The web
// counterpart lives in animated-icon.web.tsx.
export function AnimatedSplashOverlay() {
  return null;
}
