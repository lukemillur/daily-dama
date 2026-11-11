import { StatusBar } from 'expo-status-bar';
import { Platform } from 'react-native';

import { deriveStatusBarStyle } from '@/shared/color/status-bar-style';

/**
 * Sets the native status-bar icon style from the page background that is visible behind it.
 * Mount exactly one per mutually exclusive route group and never in the root layout: React Native
 * keeps a stack of mounted bars where the last mounted wins, and children mount before parents,
 * so a root bar would override deeper ones. Never set `statusBarStyle` on native-stack screens
 * either, since react-native-screens would then own the style and fight this bar. The style is
 * always explicit (never `auto`), so it follows the saved app theme rather than the system scheme.
 */
export function AppStatusBar({ background }: { readonly background: string }) {
  if (Platform.OS === 'web') return null;
  return <StatusBar style={deriveStatusBarStyle(background)} />;
}
