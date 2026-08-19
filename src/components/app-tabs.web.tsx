import { useRouter } from 'expo-router';
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

export function CustomTabList({ hidden, ...props }: TabListProps & { readonly hidden?: boolean }) {
  return (
    <View {...props} style={[styles.tabListContainer, hidden ? styles.tabListHidden : null]}>
      <ResponsiveTabListInner type="backgroundElement">
        <ResponsiveBrandText type="smallBold">Daily Dama</ResponsiveBrandText>

        {props.children}
      </ResponsiveTabListInner>

      <LeaveAppLink />
    </View>
  );
}

/**
 * Persistent footer-style affordance for leaving the app shell and returning
 * to the marketing landing page at `/`. Pure client-side navigation: it must
 * not sign the user out, reset onboarding, or touch any persisted data.
 *
 * Carries the T112.5 in-app-arrival signal so `useRedirectOnboardedVisitorHome`
 * skips its redirect-to-`/app/home` behavior and the landing page actually
 * renders, instead of bouncing the visitor straight back into the app.
 */
function LeaveAppLink() {
  const router = useRouter();

  const handlePress = () => {
    router.push({
      pathname: '/',
      params: { [LANDING_ARRIVAL_PARAM]: LANDING_ARRIVAL_FROM_APP },
    });
  };

  return (
    <Pressable
      accessibilityRole="link"
      onPress={handlePress}
      style={({ pressed }) => [styles.leaveAppLink, pressed && styles.pressed]}>
      <ThemedText type="small" themeColor="textSecondary">
        Leave app
      </ThemedText>
    </Pressable>
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
    width: '100%',
    padding: Spacing.three,
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'column',
    gap: Spacing.one,
  },
  tabListHidden: {
    display: 'none',
  },
  leaveAppLink: {
    padding: Spacing.one,
  },
  pressed: {
    opacity: 0.7,
  },
});
