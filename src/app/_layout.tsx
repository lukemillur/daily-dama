import '@/global.css';

import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import AppTabs from '@/components/app-tabs';
import { AccessGateProvider } from '@/features/access-gate/state/access-gate-provider';
import { CustomTrickProvider } from '@/features/custom-tricks/state/custom-trick-provider';
import { NoteProvider } from '@/features/notes/state/note-provider';
import { KenteiRankAutoPromotion } from '@/features/profile/state/kentei-rank-auto-promotion';
import { UserProfileProvider } from '@/features/profile/state/user-profile-provider';
import { PracticeHistoryProvider } from '@/features/stats/state/practice-history-provider';
import { useColorScheme } from '@/hooks/use-color-scheme';

SplashScreen.preventAutoHideAsync();

export default function TabLayout() {
  const colorScheme = useColorScheme();
  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <AnimatedSplashOverlay />
      <AccessGateProvider>
        <CustomTrickProvider>
          <UserProfileProvider>
            <PracticeHistoryProvider>
              <NoteProvider>
                <KenteiRankAutoPromotion />
                <AppTabs />
              </NoteProvider>
            </PracticeHistoryProvider>
          </UserProfileProvider>
        </CustomTrickProvider>
      </AccessGateProvider>
    </ThemeProvider>
  );
}
