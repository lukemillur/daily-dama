import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';

/**
 * Calls `onForeground` with an explicit timestamp each time the app returns to the foreground.
 * Timestamp acquisition lives here so reducers stay pure and receive `now` through actions.
 */
export function useAppForeground(onForeground: (now: number) => void): void {
  const callbackRef = useRef(onForeground);

  useEffect(() => {
    callbackRef.current = onForeground;
  }, [onForeground]);

  useEffect(() => {
    // AppState fires 'change' for inactive/background too; only entry to 'active' is a foreground.
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') callbackRef.current(Date.now());
    });
    return () => subscription.remove();
  }, []);
}
