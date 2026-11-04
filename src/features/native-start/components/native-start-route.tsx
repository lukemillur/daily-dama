import { HideSplashWhenMounted } from '@/shared/splash/splash-ready';

import { useNativeStartRoute } from '../state/use-native-start-route';
import { NativeStartScreen } from './native-start-screen';

/**
 * Renders nothing while the stored profile is read or while redirecting a returning user; the
 * native splash stays up through both, and `/app/home` releases it after hydration.
 */
export function NativeStartRoute() {
  const decision = useNativeStartRoute();
  if (decision !== 'show-start') return null;
  return (
    <>
      <HideSplashWhenMounted />
      <NativeStartScreen />
    </>
  );
}
