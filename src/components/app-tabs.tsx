import { NativeTabs } from 'expo-router/unstable-native-tabs';
import type { SFSymbol } from 'sf-symbols-typescript';

import { Colors } from '@/constants/theme';
import { useUserProfile } from '@/features/profile/state/user-profile-provider';
import { useColorScheme } from '@/hooks/use-color-scheme';

type TabRoute = 'home' | 'sesh' | 'tricks' | 'stats' | 'profile';

// iOS SF Symbols are tinted by the system. Every route needs a distinct default symbol;
// `timer` has no filled variant, so Sesh reuses it when selected.
export const TAB_ICON_SYMBOLS: Record<TabRoute, { default: SFSymbol; selected: SFSymbol }> = {
  home: { default: 'house', selected: 'house.fill' },
  sesh: { default: 'timer', selected: 'timer' },
  tricks: { default: 'list.bullet.rectangle', selected: 'list.bullet.rectangle.fill' },
  stats: { default: 'chart.bar', selected: 'chart.bar.fill' },
  profile: { default: 'person.crop.circle', selected: 'person.crop.circle.fill' },
};

export default function AppTabs() {
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'unspecified' ? 'light' : scheme];
  const profile = useUserProfile();
  const hasCompletedOnboarding = profile.hasCompletedOnboarding && profile.kenteiRank !== undefined;

  return (
    <NativeTabs
      hidden={!hasCompletedOnboarding}
      backgroundColor={colors.background}
      indicatorColor={colors.backgroundElement}
      iconColor={{ default: colors.textSecondary, selected: colors.text }}
      labelStyle={{ selected: { color: colors.text } }}>
      <NativeTabs.Trigger name="home">
        <NativeTabs.Trigger.Label>Home</NativeTabs.Trigger.Label>
        {/* `src` remains as the Android fallback; iOS prefers `sf`. */}
        <NativeTabs.Trigger.Icon
          sf={TAB_ICON_SYMBOLS.home}
          src={require('@/assets/images/tabIcons/home.png')}
          renderingMode="template"
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger hidden={!hasCompletedOnboarding} name="sesh">
        <NativeTabs.Trigger.Label>Sesh</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={TAB_ICON_SYMBOLS.sesh} />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger hidden={!hasCompletedOnboarding} name="tricks">
        <NativeTabs.Trigger.Label>Tricks</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={TAB_ICON_SYMBOLS.tricks} />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger hidden={!hasCompletedOnboarding} name="stats">
        <NativeTabs.Trigger.Label>Stats</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={TAB_ICON_SYMBOLS.stats} />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger hidden={!hasCompletedOnboarding} name="profile">
        <NativeTabs.Trigger.Label>Profile</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={TAB_ICON_SYMBOLS.profile} />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
