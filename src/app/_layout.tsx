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
// sign-in-screen.tsx's routine sign-in redirect. Read via useGlobalSearchParams, since this
// lives above every route and no route-scoped useLocalSearchParams read is available above
// <Slot />, to show a full-screen, auto-dismissing acknowledgment, then strip it from the URL
// so a refresh/back-nav doesn't re-show it. Replaces home.tsx's route-scoped T207
// NewAccountBanner.
//
// T249: this root layout mounts exactly once per browser page load and never remounts on
// in-app navigation (<Slot /> just swaps the subtree beneath it). auth-callback-screen.tsx's
// redirect into this param is a client-side router.replace, not a full page load, so the param
// almost always arrives *after* this layout has already mounted without it -- the lazy
// initializer below only covers the rarer case where the param is present at the very first
// render (e.g. a direct navigation to /app/home?newAccount=1). The effect below is what handles
// the real-world post-mount arrival.
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
  // Covers the param-present-at-mount case (e.g. a direct navigation to
  // /app/home?newAccount=1) synchronously, so the overlay shows with no visible one-frame
  // pop-in. The far more common real-world case -- the param arriving after mount via
  // auth-callback-screen.tsx's client-side router.replace -- is handled by the effect below,
  // which is the only thing that can react to a post-mount params change.
  const [showNewAccountWelcome, setShowNewAccountWelcome] = useState(
    () => firstStringOrUndefined(params.newAccount) === '1',
  );
  // Guards both paths above: whichever one first detects newAccount=1 (the lazy initializer at
  // mount, or this effect on a later render) is the only one allowed to flip state and strip the
  // URL, so a single mounted root layout never double-handles the param.
  const hasHandledNewAccountParamRef = useRef(false);

  useEffect(() => {
    if (hasHandledNewAccountParamRef.current) return;
    if (firstStringOrUndefined(params.newAccount) !== '1') return;
    hasHandledNewAccountParamRef.current = true;
    // This effect is itself the subscription to an external system (the router's params
    // changing after this component already mounted, per the T249 comment above) -- there is no
    // synchronous alternative, since render-time params reads can't distinguish "present at
    // mount" from "arrived later" the way this ref-guarded effect does.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing from an external params change, guarded to run once.
    setShowNewAccountWelcome(true);
    // usePathname() always returns the currently-mounted route's own path, so it's guaranteed to
    // be a valid Href even though its static type is a plain string -- typed routes can't express
    // "whatever route is currently active" as a literal union member.
    router.replace(pathname as Href);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-shot handle, guarded by the ref.
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
