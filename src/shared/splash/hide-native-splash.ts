import * as SplashScreen from 'expo-splash-screen';
import { Platform } from 'react-native';

// Ceiling so a route that forgets to mount <HideSplashWhenMounted /> can never strand the user
// behind the splash.
const SPLASH_SAFETY_TIMEOUT_MS = 8000;

let hasHidden = false;

function logSplashFailure(action: string, error: unknown) {
  // Diagnostic only: a splash failure has no user-facing recovery.
  console.warn(`Native splash ${action} failed`, error);
}

/** Keeps the native splash up until a post-hydration screen releases it. Call once at module scope. */
export function holdNativeSplash() {
  if (Platform.OS === 'web') return;
  SplashScreen.preventAutoHideAsync().catch((error: unknown) => {
    logSplashFailure('hold', error);
  });
  setTimeout(hideNativeSplash, SPLASH_SAFETY_TIMEOUT_MS);
}

/** Idempotent release; the first call hides the splash and later calls do nothing. */
export function hideNativeSplash() {
  if (Platform.OS === 'web' || hasHidden) return;
  hasHidden = true;
  SplashScreen.hideAsync().catch((error: unknown) => {
    logSplashFailure('hide', error);
  });
}

/** Test-only reset of the module-level release flag. */
export function resetNativeSplashForTests() {
  hasHidden = false;
}
