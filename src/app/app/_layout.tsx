import { usePathname } from "expo-router";
import Head from "expo-router/head";

import AppTabs from "@/components/app-tabs";
import { LocalDurabilityWarningBanner } from "@/components/local-durability-warning-banner";
import { CustomTrickProvider } from "@/features/custom-tricks/state/custom-trick-provider";
import { GoalProvider } from "@/features/goals/state/goal-provider";
import { NoteProvider } from "@/features/notes/state/note-provider";
import { AppThemeProvider } from "@/features/profile/components/app-theme-provider";
import { KenteiRankAutoPromotion } from "@/features/profile/state/kentei-rank-auto-promotion";
import { UserProfileProvider } from "@/features/profile/state/user-profile-provider";
import { PracticeHistoryProvider } from "@/features/stats/state/practice-history-provider";
import { IdentityProvider } from "@/shared/persistence/identity-provider";
import { SyncCoordinatorProvider } from "@/shared/sync/sync-coordinator-provider";

/**
 * Maps each primary section route to its web tab title. Kept at this layout
 * level (above the persistence providers' hydration gate) rather than inside
 * each screen: the providers below intentionally render a "Loading your
 * practice..." fallback in place of the real screen until AsyncStorage
 * hydration resolves, and that fallback stands in for every screen during
 * both static export and first paint. A `<Head>` placed inside an individual
 * screen would never run in either case, so it can't satisfy "the exported
 * HTML contains the expected title" for a route-level placement. Pathname
 * matching here renders unconditionally, before that gate.
 */
const SECTION_TITLES_BY_PATHNAME: Readonly<Record<string, string>> = {
  "/app/home": "Home",
  "/app/sesh": "Sesh",
  "/app/tricks": "Tricks",
  "/app/stats": "Stats",
  "/app/profile": "Profile",
};

export default function AppShellLayout() {
  const pathname = usePathname();
  const sectionTitle = SECTION_TITLES_BY_PATHNAME[pathname];

  return (
    <>
      {sectionTitle ? (
        <Head>
          <title>{`Daily Dama: ${sectionTitle}`}</title>
        </Head>
      ) : null}
      <IdentityProvider>
        <CustomTrickProvider>
          <UserProfileProvider>
            <PracticeHistoryProvider>
              <NoteProvider>
                <GoalProvider>
                  <SyncCoordinatorProvider>
                    <AppThemeProvider>
                      <KenteiRankAutoPromotion />
                      <LocalDurabilityWarningBanner />
                      <AppTabs />
                    </AppThemeProvider>
                  </SyncCoordinatorProvider>
                </GoalProvider>
              </NoteProvider>
            </PracticeHistoryProvider>
          </UserProfileProvider>
        </CustomTrickProvider>
      </IdentityProvider>
    </>
  );
}
