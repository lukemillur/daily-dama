import { AccountDeletedScreen } from '@/features/auth/components/account-deleted-screen';
import { HideSplashWhenMounted } from '@/shared/splash/splash-ready';

export default function AccountDeletedRoute() {
  return (
    <>
      <HideSplashWhenMounted />
      <AccountDeletedScreen />
    </>
  );
}
