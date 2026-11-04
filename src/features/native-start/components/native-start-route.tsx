import { useNativeStartRoute } from '../state/use-native-start-route';
import { NativeStartScreen } from './native-start-screen';

/** Renders nothing while the stored profile is read or while redirecting a returning user. */
export function NativeStartRoute() {
  const decision = useNativeStartRoute();
  return decision === 'show-start' ? <NativeStartScreen /> : null;
}
