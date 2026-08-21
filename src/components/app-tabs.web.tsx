import { usePathname, useRouter } from 'expo-router';
import {
  Tabs,
  TabList,
  TabTrigger,
  TabSlot,
  TabTriggerSlotProps,
  TabListProps,
} from 'expo-router/ui';
import { Pressable, View, StyleSheet } from 'react-native';
import { styled } from 'styled-components/native';

import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';

import { MaxContentWidth, Spacing } from '@/constants/theme';
import { LANDING_ARRIVAL_FROM_APP, LANDING_ARRIVAL_PARAM } from '@/features/landing/state/landing-navigation';
import { deriveAutomaticTextColor, useResolvedTheme } from '@/features/profile/state/use-resolved-theme';
import { useUserProfile } from '@/features/profile/state/user-profile-provider';

export default function AppTabs() {
  const profile = useUserProfile();
  const hasCompletedOnboarding = profile.hasCompletedOnboarding && profile.kenteiRank !== undefined;

  return (
    <Tabs>
      <TabSlot style={styles.tabSlot} />
      <TabList asChild>
        <CustomTabList hidden={!hasCompletedOnboarding}>
          <TabTrigger name="home" href="/app/home" asChild>
            <TabButton>Home</TabButton>
          </TabTrigger>
          {hasCompletedOnboarding && (
            <TabTrigger name="sesh" href="/app/sesh" asChild>
              <TabButton>Sesh</TabButton>
            </TabTrigger>
          )}
          {hasCompletedOnboarding && (
            <TabTrigger name="tricks" href="/app/tricks" asChild>
              <TabButton>Tricks</TabButton>
            </TabTrigger>
          )}
          {hasCompletedOnboarding && (
            <TabTrigger name="stats" href="/app/stats" asChild>
              <TabButton>Stats</TabButton>
            </TabTrigger>
          )}
          {hasCompletedOnboarding && (
            <TabTrigger name="profile" href="/app/profile" asChild>
              <TabButton>Profile</TabButton>
            </TabTrigger>
          )}
        </CustomTabList>
      </TabList>
    </Tabs>
  );
}

export function TabButton({ children, isFocused, ...props }: TabTriggerSlotProps) {
  return (
    <Pressable {...props} style={({ pressed }) => pressed && styles.pressed}>
      <ResponsiveTabButtonView type={isFocused ? 'backgroundSelected' : 'backgroundElement'}>
        <ThemedText type="small" themeColor={isFocused ? 'text' : 'textSecondary'}>
          {children}
        </ThemedText>
      </ResponsiveTabButtonView>
    </Pressable>
  );
}

export function CustomTabList({ hidden, children, ...props }: TabListProps & { readonly hidden?: boolean }) {
  const pathname = usePathname();
  const showFooter = pathname === '/app/profile';

  return (
    <View {...props} style={[styles.tabListContainer, hidden ? styles.tabListHidden : null]} pointerEvents="box-none">
      <View style={styles.topNavWrap} pointerEvents="box-none">
        <ResponsiveTabListInner type="backgroundElement">
          <ResponsiveBrandText type="smallBold">Daily Dama</ResponsiveBrandText>

          {children}
        </ResponsiveTabListInner>
      </View>

      {showFooter && <AppFooterBar />}
    </View>
  );
}

/**
 * Footer bar spanning the app shell, holding the persistent affordance for
 * leaving the app and returning to the marketing landing page at `/`. Pure
 * client-side navigation: it must not sign the user out, reset onboarding, or
 * touch any persisted data.
 *
 * Background uses the resolved theme's `buttonBackground` (already tuned for contrast
 * against the resolved page background) rather than `background` itself, and link text follows the visitor's saved theme (via
 * `useResolvedTheme`), falling back to the default resolved theme when no
 * custom colors are set.
 *
 * Carries the T112.5 in-app-arrival signal so `useRedirectOnboardedVisitorHome`
 * skips its redirect-to-`/app/home` behavior and the landing page actually
 * renders, instead of bouncing the visitor straight back into the app.
 */
function AppFooterBar() {
  const router = useRouter();
  const theme = useResolvedTheme();
  const backgroundColor = theme.buttonBackground;
  const textColor = deriveAutomaticTextColor(backgroundColor, backgroundColor);

  const handlePress = () => {
    router.push({
      pathname: '/',
      params: { [LANDING_ARRIVAL_PARAM]: LANDING_ARRIVAL_FROM_APP },
    });
  };

  return (
    <View testID="app-footer-bar" style={[styles.footerBar, { backgroundColor }]}>
      <Pressable
        accessibilityRole="link"
        onPress={handlePress}
        style={({ pressed }) => [styles.leaveAppLink, pressed && styles.pressed]}>
        <ThemedText type="small" style={{ color: textColor }}>
          Leave app
        </ThemedText>
      </Pressable>
    </View>
  );
}

const ResponsiveBrandText = styled(ThemedText)`
  display: none;
  margin-right: ${Spacing.four}px;

  @media (min-width: 480px) {
    display: flex;
  }
`;

const ResponsiveTabListInner = styled(ThemedView)`
  max-width: ${MaxContentWidth}px;
  flex-direction: row;
  align-items: center;
  gap: 2px;
  padding: ${Spacing.two}px;
  border-radius: ${Spacing.five}px;

  @media (min-width: 480px) {
    gap: ${Spacing.two}px;
    padding-right: ${Spacing.five}px;
    padding-left: ${Spacing.five}px;
  }
`;

const ResponsiveTabButtonView = styled(ThemedView)`
  padding: ${Spacing.one}px 6px;
  border-radius: ${Spacing.three}px;

  @media (min-width: 480px) {
    padding-right: ${Spacing.three}px;
    padding-left: ${Spacing.three}px;
  }
`;

const styles = StyleSheet.create({
  tabSlot: {
    flex: 1,
    width: '100%',
  },
  tabListContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  tabListHidden: {
    display: 'none',
  },
  topNavWrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    padding: Spacing.three,
    alignItems: 'center',
  },
  footerBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'flex-start',
    alignItems: 'center',
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
  },
  leaveAppLink: {
    padding: Spacing.one,
  },
  pressed: {
    opacity: 0.7,
  },
});
