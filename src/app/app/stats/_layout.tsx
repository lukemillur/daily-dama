import { Stack } from 'expo-router';

import { useNestedScreenOptions, useNestedStackScreenOptions } from '@/components/nested-stack-options';

export default function StatsLayout() {
  const stackOptions = useNestedStackScreenOptions();
  const screenOptions = useNestedScreenOptions({ href: '/app/stats', label: 'Stats' });

  return (
    <Stack screenOptions={stackOptions}>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="[trickId]" options={screenOptions('Trick history')} />
      <Stack.Screen name="kendama-model-sandbox" options={screenOptions('Kendama model sandbox')} />
      <Stack.Screen name="sesh-sequence-sandbox" options={screenOptions('Sesh sequence sandbox')} />
      <Stack.Screen name="trick-viz-sandbox" options={screenOptions('Trick viz sandbox')} />
    </Stack>
  );
}
