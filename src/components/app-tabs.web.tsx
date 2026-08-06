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
import { useUserProfile } from '@/features/profile/state/user-profile-provider';

export default function AppTabs() {
  const profile = useUserProfile();
  const hasCompletedOnboarding = profile.hasCompletedOnboarding && profile.kenteiRank !== undefined;

  return (
    <Tabs>
      <TabSlot style={styles.tabSlot} />
      <TabList asChild>
        <CustomTabList hidden={!hasCompletedOnboarding}>
          <TabTrigger name="home" href="/" asChild>
            <TabButton>Home</TabButton>
          </TabTrigger>
          {hasCompletedOnboarding && (
            <TabTrigger name="sesh" href="/sesh" asChild>
              <TabButton>Sesh</TabButton>
            </TabTrigger>
          )}
          {hasCompletedOnboarding && (
            <TabTrigger name="tricks" href="/tricks" asChild>
              <TabButton>Tricks</TabButton>
            </TabTrigger>
          )}
          {hasCompletedOnboarding && (
            <TabTrigger name="stats" href="/stats" asChild>
              <TabButton>Stats</TabButton>
            </TabTrigger>
          )}
          {hasCompletedOnboarding && (
            <TabTrigger name="profile" href="/profile" asChild>
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
    width: '100%',
    padding: Spacing.three,
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row',
  },
  tabListHidden: {
    display: 'none',
  },
  pressed: {
    opacity: 0.7,
  },
});
