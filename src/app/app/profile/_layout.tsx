import { Stack, useNavigation, useRouter } from 'expo-router';
import { useEffect } from 'react';

import { useNestedScreenOptions, useNestedStackScreenOptions } from '@/components/nested-stack-options';

export default function ProfileLayout() {
  const navigation = useNavigation();
  const router = useRouter();

  useEffect(() => {
    const tabNavigation = navigation.getParent();
    if (!tabNavigation) return undefined;

    const profileTabKey = tabNavigation
      .getState()
      .routes.find((route) => route.name === 'profile')?.key;

    return tabNavigation.addListener('tabPress' as never, (event: { readonly target?: string }) => {
      if (event.target !== profileTabKey) return;
      router.replace('/app/profile');
    });
  }, [navigation, router]);

  const stackOptions = useNestedStackScreenOptions();
  const screenOptions = useNestedScreenOptions({ href: '/app/profile', label: 'Profile' });

  return (
    <Stack screenOptions={stackOptions}>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="kentei-assessment" options={screenOptions('Kentei assessment')} />
      <Stack.Screen name="account/security" options={screenOptions('Account')} />
      <Stack.Screen name="account/delete" options={screenOptions('Delete account')} />
    </Stack>
  );
}
