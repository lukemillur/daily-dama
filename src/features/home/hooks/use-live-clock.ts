import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

// The Home summary windows this feeds are 24h/7d/30d/365d rolling windows and local-day streak
// boundaries. Sub-second precision (like Sesh's 250ms countdown tick) isn't needed and would
// cause pointless re-renders of the whole Home tree. A minute-level tick means the 24h/local-day
// boundary is reflected within at most a minute of it passing, which is more than good enough for
// a dashboard.
export const HOME_CLOCK_INTERVAL_MS = 60_000;

export function useLiveClock(intervalMs: number): number {
  const [now, setNow] = useState(Date.now);

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), intervalMs);
    // AppState fires 'change' on any transition (active/inactive/background), not just entry to
    // 'active' — the guard below is required, not optional, so backgrounding doesn't trigger a
    // pointless re-render.
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') setNow(Date.now());
    });
    return () => {
      clearInterval(interval);
      subscription.remove();
    };
  }, [intervalMs]);

  return now;
}
