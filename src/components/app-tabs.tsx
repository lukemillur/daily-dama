import { Tabs } from 'expo-router';
import { SymbolView, type SFSymbol } from 'expo-symbols';

import { useUserProfile } from '@/features/profile/state/user-profile-provider';
import { useResolvedTheme, type ResolvedTheme } from '@/features/profile/state/use-resolved-theme';
import { blendHexColors } from '@/shared/color/blend';

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

/**
 * Bar colors come from the saved app theme, never the system appearance, so the bar always
 * matches the screens above it.
 */
export function deriveTabBarColors(theme: ResolvedTheme) {
  return {
    background: theme.background,
    border: blendHexColors(theme.text, theme.background, 0.2),
    active: theme.text,
    inactive: theme.textMuted,
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
        sceneStyle: { backgroundColor: colors.background },
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
