import { Link, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { styled } from 'styled-components/native';

import { Screen } from '@/components/ui/screen';
import { BodyText } from '@/components/ui/typography';
import { AppColors } from '@/constants/theme';
import { useCustomTricks } from '@/features/custom-tricks/state/custom-trick-provider';
import { DailyHome } from '@/features/home/components/daily-home';
import { HOME_CLOCK_INTERVAL_MS, useLiveClock } from '@/features/home/hooks/use-live-clock';
import { createHomeSummary } from '@/features/home/model/home-summary';
import { isGuestImportPendingResolution } from '@/features/guest-import/model/guest-import';
import { useGuestImport } from '@/features/guest-import/state/use-guest-import';
import { KenteiOnboarding } from '@/features/onboarding/components/kentei-onboarding';
import { useUserProfile, useUserProfileSync } from '@/features/profile/state/user-profile-provider';
import { selectRegularSessions } from '@/features/stats/model/practice-history';
import { usePracticeHistory } from '@/features/stats/state/practice-history-provider';
import { KENDAMA_KENTEI_TRICKS } from '@/features/tricks/data/kendama-kentei-tricks';
import { useIdentityHandle } from '@/shared/persistence/identity-provider';

// T207: a one-time signal auth-callback-screen.tsx's default branch (post-signup-email-
// verification redirect) attaches to its /app/home redirect -- never set by sign-in-screen.tsx's
// routine sign-in redirect. Read once on mount to show a dismissible acknowledgment banner, then
// stripped from the URL so a refresh/back-nav doesn't re-show it.
type HomeSearchParams = { newAccount?: string | string[] };

function firstStringOrUndefined(value: string | string[] | undefined): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

export default function HomeScreen() {
  const params = useLocalSearchParams<HomeSearchParams>();
  const router = useRouter();
  // Captured once via the lazy initializer -- the param is stripped from the URL right after
  // mount (below), so re-reading params on later renders must not re-derive this.
  const [showNewAccountBanner, setShowNewAccountBanner] = useState(
    () => firstStringOrUndefined(params.newAccount) === '1',
  );
  const hasStrippedNewAccountParamRef = useRef(false);

  useEffect(() => {
    if (hasStrippedNewAccountParamRef.current) return;
    if (firstStringOrUndefined(params.newAccount) !== '1') return;
    hasStrippedNewAccountParamRef.current = true;
    router.replace('/app/home');
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-shot strip, guarded by the ref.
  }, [params]);

  const profile = useUserProfile();
  const { tricks: customTricks } = useCustomTricks();
  const { sessions } = usePracticeHistory();
  const { identity } = useIdentityHandle();
  const { state: guestImportState } = useGuestImport();
  const { runSync } = useUserProfileSync();
  // T186.1: a signed-in identity with a pending or in-progress guest
  // import (nonzero-local awaitingConfirmation, or anything past it) must
  // never see onboarding a second time -- the import may still be writing
  // hasCompletedOnboarding/kenteiRank. See isGuestImportPendingResolution's
  // own doc comment for why an all-zero-inventory awaitingConfirmation is
  // deliberately excluded (it's permanently parked, not pending).
  const importPending = identity.kind === 'user' && isGuestImportPendingResolution(guestImportState);

  // T199: the guest import's upload phase pushes the imported profile
  // (hasCompletedOnboarding/kenteiRank) straight to the cloud profile row
  // via its own outbox push, never through the primary UserProfile
  // reducer's own sync/hydration path. Once the import reaches
  // 'completed', import-pending no longer blocks rendering, but the local
  // primary profile was never told to re-pull the cloud row that the
  // import just wrote. Without an explicit resync here, onboarding would
  // flash because hasCompletedOnboarding is still locally false. Gate on
  // importId (not a one-shot flag) so a resync retries once per distinct
  // completed import, including across a remount/page reload.
  const [isResyncingAfterImport, setIsResyncingAfterImport] = useState(false);
  const resyncedImportIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (identity.kind !== 'user') {
      // Covers logout/account-switch while a resync was in flight: never
      // leave a stale identity's in-progress flag blocking a different
      // (possibly guest) identity's render.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setIsResyncingAfterImport(false);
      return;
    }
    if (guestImportState.status !== 'completed') return;
    const importId = guestImportState.importId;
    if (importId === undefined) return;
    if (resyncedImportIdsRef.current.has(importId)) return;
    resyncedImportIdsRef.current.add(importId);

    let cancelled = false;
    setIsResyncingAfterImport(true);
    void runSync('login').finally(() => {
      if (!cancelled) setIsResyncingAfterImport(false);
    });
    return () => {
      cancelled = true;
    };
  }, [identity, guestImportState.status, guestImportState.importId, runSync]);

  const blockingOnboardingRender = importPending || isResyncingAfterImport;
  const regularSessions = selectRegularSessions(sessions);
  const liveNow = useLiveClock(HOME_CLOCK_INTERVAL_MS);
  const summaryNow = regularSessions.reduce(
    (latest, session) => Math.max(latest, session.completedAt),
    liveNow,
  );
  const summary = useMemo(
    () =>
      createHomeSummary({
        profile,
        standardTricks: KENDAMA_KENTEI_TRICKS,
        customTricks,
        sessions: regularSessions,
        now: summaryNow,
      }),
    [customTricks, profile, regularSessions, summaryNow],
  );

  return (
    <Screen
      background={
        blockingOnboardingRender || profile.hasCompletedOnboarding
          ? undefined
          : (profile.themeBackgroundColor ?? AppColors.yellow)
      }
      edges={['top', 'left', 'right']}
      webBottomInset={24}>
      {showNewAccountBanner ? (
        <NewAccountBanner onDismiss={() => setShowNewAccountBanner(false)} />
      ) : null}
      {blockingOnboardingRender ? null : profile.hasCompletedOnboarding && profile.kenteiRank ? (
        <DailyHome summary={summary} />
      ) : (
        <KenteiOnboarding />
      )}
      {__DEV__ ? (
        <>
          <Link href="/app/stats/trick-viz-sandbox" style={styles.devLink}>
            Trick viz sandbox
          </Link>
          <Link href="/app/stats/sesh-sequence-sandbox" style={styles.devLinkSecondary}>
            Sesh sequence sandbox
          </Link>
        </>
      ) : null}
    </Screen>
  );
}

function NewAccountBanner({ onDismiss }: { readonly onDismiss: () => void }) {
  return (
    <BannerCard accessibilityLabel="Account verified">
      <BannerCopy>
        <BannerEyebrow>Welcome to Daily Dama</BannerEyebrow>
        <BannerTitle>Your account is verified and you’re signed in.</BannerTitle>
      </BannerCopy>
      <BannerDismiss accessibilityLabel="Dismiss" accessibilityRole="button" onPress={onDismiss}>
        <BannerDismissText>✕</BannerDismissText>
      </BannerDismiss>
    </BannerCard>
  );
}

const BannerCard = styled.View`
  width: 100%;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  background-color: ${({ theme }) => theme.accent ?? AppColors.yellow};
  border: 3px solid ${AppColors.ink};
  border-radius: 6px;
  padding: 14px 16px;
  margin: 0 16px 12px 16px;
`;
const BannerCopy = styled.View`
  flex: 1;
`;
const BannerEyebrow = styled(BodyText)`
  font-size: 11px;
  font-weight: 900;
  letter-spacing: 1.4px;
  text-transform: uppercase;
`;
const BannerTitle = styled(BodyText)`
  margin-top: 4px;
  font-weight: 700;
`;
const BannerDismiss = styled(Pressable)`
  padding: 4px 8px;
`;
const BannerDismissText = styled(BodyText)`
  font-size: 16px;
  font-weight: 900;
`;

const styles = StyleSheet.create({
  devLink: {
    position: 'absolute',
    bottom: 26,
    right: 12,
    fontSize: 11,
    opacity: 0.5,
  },
  devLinkSecondary: {
    position: 'absolute',
    bottom: 8,
    right: 12,
    fontSize: 11,
    opacity: 0.5,
  },
});
