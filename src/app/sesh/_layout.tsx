import { Stack, useNavigation, useRouter } from 'expo-router';
import { useEffect } from 'react';

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
      router.replace('/sesh');
    });
  }, [navigation, router]);

  return <Stack screenOptions={{ headerShown: false }} />;
}
