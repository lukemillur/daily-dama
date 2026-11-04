import { Stack, useNavigation, useRouter } from 'expo-router';
import { useEffect } from 'react';

import { useNestedScreenOptions, useNestedStackScreenOptions } from '@/components/nested-stack-options';

export default function SeshLayout() {
  const navigation = useNavigation();
  const router = useRouter();

  useEffect(() => {
    const tabNavigation = navigation.getParent();
    if (!tabNavigation) return undefined;

    const seshTabKey = tabNavigation
      .getState()
      .routes.find((route) => route.name === 'sesh')?.key;

    return tabNavigation.addListener('tabPress' as never, (event: { readonly target?: string }) => {
      if (event.target !== seshTabKey) return;
      router.replace('/app/sesh');
    });
  }, [navigation, router]);

  const stackOptions = useNestedStackScreenOptions();
  const screenOptions = useNestedScreenOptions({ href: '/app/sesh', label: 'Sesh' });

  return (
    <Stack screenOptions={stackOptions}>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="multi-trick" options={screenOptions('Multi-trick sesh')} />
    </Stack>
  );
}
