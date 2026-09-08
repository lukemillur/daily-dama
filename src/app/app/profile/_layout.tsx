import { Stack, useNavigation, useRouter } from 'expo-router';
import { useEffect } from 'react';

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

  return <Stack screenOptions={{ headerShown: false }} />;
}
