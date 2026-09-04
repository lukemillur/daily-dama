import '@/global.css';

import { Analytics } from '@vercel/analytics/react';
import {
  DarkTheme,
  DefaultTheme,
  type Href,
  Slot,
  ThemeProvider,
  useGlobalSearchParams,
  usePathname,
  useRouter,
} from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { NewAccountWelcomeOverlay } from '@/features/auth/components/new-account-welcome-overlay';
import { sanitizeAnalyticsEvent } from '@/features/auth/observability/auth-observability';
import { AuthProvider } from '@/features/auth/state/auth-provider';
import { DefaultAppThemeProvider } from '@/features/profile/components/app-theme-provider';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { initSentry } from '@/shared/observability/sentry-client';

SplashScreen.preventAutoHideAsync();

// T208: a one-time signal auth-callback-screen.tsx's default branch (post-signup-email-
// verification redirect) attaches to its redirect (`newAccount=1`) -- never set by
// sign-in-screen.tsx's routine sign-in redirect. Read once on mount (via
// useGlobalSearchParams, since this lives above every route and no route-scoped
// useLocalSearchParams read is available above <Slot />) to show a full-screen,
// auto-dismissing acknowledgment, then strip it from the URL so a refresh/back-nav
// doesn't re-show it. Replaces home.tsx's route-scoped T207 NewAccountBanner.
type GlobalSearchParams = { newAccount?: string | string[] };

function firstStringOrUndefined(value: string | string[] | undefined): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

export default function TabLayout() {
  const colorScheme = useColorScheme();

  useEffect(() => {
    initSentry();
  }, []);

  const params = useGlobalSearchParams<GlobalSearchParams>();
  const router = useRouter();
  const pathname = usePathname();
  // Captured once via the lazy initializer -- the param is stripped from the URL right after
  // mount (below), so re-reading params on later renders must not re-derive this. This is what
  // keeps the mount-time check a single synchronous read instead of a render-then-effect toggle,
  // avoiding a visible one-frame pop-in.
  const [showNewAccountWelcome, setShowNewAccountWelcome] = useState(
    () => firstStringOrUndefined(params.newAccount) === '1',
  );
  const hasStrippedNewAccountParamRef = useRef(false);

  useEffect(() => {
    if (hasStrippedNewAccountParamRef.current) return;
    if (firstStringOrUndefined(params.newAccount) !== '1') return;
    hasStrippedNewAccountParamRef.current = true;
    // usePathname() always returns the currently-mounted route's own path, so it's guaranteed to
    // be a valid Href even though its static type is a plain string -- typed routes can't express
    // "whatever route is currently active" as a literal union member.
    router.replace(pathname as Href);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-shot strip, guarded by the ref.
  }, [params]);

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      {Platform.OS === 'web' && <Analytics beforeSend={sanitizeAnalyticsEvent} />}
      <AnimatedSplashOverlay />
      <DefaultAppThemeProvider>
        {showNewAccountWelcome ? (
          <NewAccountWelcomeOverlay onDismiss={() => setShowNewAccountWelcome(false)} />
        ) : null}
        <AuthProvider>
          <Slot />
        </AuthProvider>
      </DefaultAppThemeProvider>
    </ThemeProvider>
  );
}
