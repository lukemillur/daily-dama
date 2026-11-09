import { Tabs } from 'expo-router';
import { SymbolView, type SFSymbol } from 'expo-symbols';

import { useUserProfile } from '@/features/profile/state/user-profile-provider';
import {
  deriveReadableForeground,
  useResolvedTheme,
  type ResolvedTheme,
} from '@/features/profile/state/use-resolved-theme';
import { blendHexColors } from '@/shared/color/blend';
import { WCAG_AA_MIN_CONTRAST_RATIO, contrastRatio } from '@/shared/color/contrast';

type TabRoute = 'home' | 'sesh' | 'tricks' | 'stats' | 'profile';

// Every route needs a distinct default symbol; `timer` has no filled variant, so Sesh reuses it
// when selected.
export const TAB_ICON_SYMBOLS: Record<TabRoute, { default: SFSymbol; selected: SFSymbol }> = {
  home: { default: 'house', selected: 'house.fill' },
  sesh: { default: 'timer', selected: 'timer' },
  tricks: { default: 'list.bullet.rectangle', selected: 'list.bullet.rectangle.fill' },
  stats: { default: 'chart.bar', selected: 'chart.bar.fill' },
  profile: { default: 'person.crop.circle', selected: 'person.crop.circle.fill' },
};

const TAB_ROUTES: readonly { name: TabRoute; title: string }[] = [
  { name: 'home', title: 'Home' },
  { name: 'sesh', title: 'Sesh' },
  { name: 'tricks', title: 'Tricks' },
  { name: 'stats', title: 'Stats' },
  { name: 'profile', title: 'Profile' },
];

// Fraction of the theme text color blended into the screen background to form the bar. The
// bar is text-tinted rather than accent-filled: the accent is user-chosen, can sit close to a
// custom background and already fills buttons and badges, whereas text versus background is the
// one pair a theme keeps readable, so the blend always moves away from the background (darker on
// light themes, lighter on dark). 0.12 separates the bar from the screen; 0.16 would push the
// default light theme's inactive tint below 3:1.
export const TAB_BAR_TEXT_BLEND = 0.12;
const INACTIVE_TINT_BLEND = 0.65;
const MIN_INACTIVE_CONTRAST_RATIO = 3;

/**
 * Bar colors come from the saved app theme, never the system appearance. The bar is a tinted
 * step off the screen background; `screenBackground` is what the scene behind it must use.
 * Tints are derived against the bar, not the screen, so contrast holds on the bar itself.
 */
export function deriveTabBarColors(theme: ResolvedTheme) {
  const background = blendHexColors(theme.text, theme.background, TAB_BAR_TEXT_BLEND);
  const active = deriveReadableForeground(background, theme.text, WCAG_AA_MIN_CONTRAST_RATIO);
  const mutedActive = blendHexColors(active, background, INACTIVE_TINT_BLEND);
  const mutedRatio = contrastRatio(mutedActive, background);
  return {
    screenBackground: theme.background,
    background,
    border: blendHexColors(theme.text, theme.background, 0.2),
    active,
    inactive:
      mutedRatio !== undefined && mutedRatio >= MIN_INACTIVE_CONTRAST_RATIO
        ? mutedActive
        : active,
  };
}

export default function AppTabs() {
  const theme = useResolvedTheme();
  const colors = deriveTabBarColors(theme);
  const profile = useUserProfile();
  const hasCompletedOnboarding = profile.hasCompletedOnboarding && profile.kenteiRank !== undefined;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.active,
        tabBarInactiveTintColor: colors.inactive,
        // Opaque, in-flow bar: the scene sits above it, so content never scrolls underneath.
        tabBarStyle: {
          backgroundColor: colors.background,
          borderTopColor: colors.border,
          ...(hasCompletedOnboarding ? {} : { display: 'none' }),
        },
        sceneStyle: { backgroundColor: colors.screenBackground },
      }}>
      {TAB_ROUTES.map(({ name, title }) => (
        <Tabs.Screen
          key={name}
          name={name}
          options={{
            title,
            tabBarIcon: ({ color, focused }) => (
              <SymbolView
                name={focused ? TAB_ICON_SYMBOLS[name].selected : TAB_ICON_SYMBOLS[name].default}
                tintColor={color}
                size={24}
              />
            ),
          }}
        />
      ))}
    </Tabs>
  );
}
