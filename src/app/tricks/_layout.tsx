import { Stack, useNavigation, useRouter } from 'expo-router';
import { useEffect } from 'react';

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
      router.replace('/tricks');
    });
  }, [navigation, router]);

  return <Stack screenOptions={{ headerShown: false }} />;
}
