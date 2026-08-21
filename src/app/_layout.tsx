import '@/global.css';

import { Analytics } from '@vercel/analytics/react';
import { DarkTheme, DefaultTheme, Slot, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { Platform } from 'react-native';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { DefaultAppThemeProvider } from '@/features/profile/components/app-theme-provider';
import { useColorScheme } from '@/hooks/use-color-scheme';

SplashScreen.preventAutoHideAsync();

export default function TabLayout() {
  const colorScheme = useColorScheme();
  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      {Platform.OS === 'web' && <Analytics />}
      <AnimatedSplashOverlay />
      <DefaultAppThemeProvider>
        <Slot />
      </DefaultAppThemeProvider>
    </ThemeProvider>
  );
}
