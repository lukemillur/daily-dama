import '@/global.css';

import { Analytics } from '@vercel/analytics/react';
import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { Platform } from 'react-native';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import AppTabs from '@/components/app-tabs';
import { AccessGateProvider } from '@/features/access-gate/state/access-gate-provider';
import { CustomTrickProvider } from '@/features/custom-tricks/state/custom-trick-provider';
import { GoalProvider } from '@/features/goals/state/goal-provider';
import { NoteProvider } from '@/features/notes/state/note-provider';
import { AppThemeProvider } from '@/features/profile/components/app-theme-provider';
import { KenteiRankAutoPromotion } from '@/features/profile/state/kentei-rank-auto-promotion';
import { UserProfileProvider } from '@/features/profile/state/user-profile-provider';
import { PracticeHistoryProvider } from '@/features/stats/state/practice-history-provider';
import { useColorScheme } from '@/hooks/use-color-scheme';

SplashScreen.preventAutoHideAsync();

export default function TabLayout() {
  const colorScheme = useColorScheme();
  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      {Platform.OS === 'web' && <Analytics />}
      <AnimatedSplashOverlay />
      <AccessGateProvider>
        <CustomTrickProvider>
          <UserProfileProvider>
            <PracticeHistoryProvider>
              <NoteProvider>
                <GoalProvider>
                  <AppThemeProvider>
                    <KenteiRankAutoPromotion />
                    <AppTabs />
                  </AppThemeProvider>
                </GoalProvider>
              </NoteProvider>
            </PracticeHistoryProvider>
          </UserProfileProvider>
        </CustomTrickProvider>
      </AccessGateProvider>
    </ThemeProvider>
  );
}
