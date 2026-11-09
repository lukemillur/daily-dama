import { Stack, useNavigation, useRouter } from 'expo-router';
import { useEffect } from 'react';

import {
  useNestedScreenOptions,
  useNestedStackScreenOptions,
  useTricksIndexScreenOptions,
} from '@/components/nested-stack-options';

export default function TricksLayout() {
  const navigation = useNavigation();
  const router = useRouter();

  useEffect(() => {
    const tabNavigation = navigation.getParent();
    if (!tabNavigation) return undefined;

    const tricksTabKey = tabNavigation
      .getState()
      .routes.find((route) => route.name === 'tricks')?.key;

    return tabNavigation.addListener('tabPress' as never, (event: { readonly target?: string }) => {
      if (event.target !== tricksTabKey) return;
      router.replace('/app/tricks');
    });
  }, [navigation, router]);

  const indexOptions = useTricksIndexScreenOptions();
  const stackOptions = useNestedStackScreenOptions();
  const screenOptions = useNestedScreenOptions({ href: '/app/tricks', label: 'Tricks' });

  return (
    <Stack screenOptions={stackOptions}>
      <Stack.Screen name="index" options={indexOptions} />
      <Stack.Screen name="goals" options={screenOptions('Goals')} />
      <Stack.Screen name="notes" options={screenOptions('Notes')} />
      <Stack.Screen name="laced" options={screenOptions('Laced tricks')} />
      <Stack.Screen name="[trickId]/goals" options={screenOptions('Trick goals')} />
      <Stack.Screen name="[trickId]/notes" options={screenOptions('Trick notes')} />
      <Stack.Screen name="custom/new" options={screenOptions('New trick')} />
      <Stack.Screen name="custom/[trickId]/edit" options={screenOptions('Edit trick')} />
      <Stack.Screen name="custom/[trickId]/delete" options={screenOptions('Delete trick')} />
    </Stack>
  );
}
