import { useEffect } from 'react';
import { Platform } from 'react-native';

import { hideNativeSplash } from './hide-native-splash';

/**
 * Releases the native splash once mounted. Mount it only where real, hydrated UI is already
 * visible (inside the persistence providers' hydration gate); the gate placement is the contract.
 */
export function HideSplashWhenMounted() {
  useEffect(() => {
    if (Platform.OS === 'web') return;
    // One frame lets the first real frame commit before the splash is removed.
    const frame = requestAnimationFrame(hideNativeSplash);
    return () => cancelAnimationFrame(frame);
  }, []);
  return null;
}
