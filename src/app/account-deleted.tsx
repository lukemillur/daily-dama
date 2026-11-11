import { AppStatusBar } from '@/components/app-status-bar';
import { AppColors } from '@/constants/theme';
import { AccountDeletedScreen } from '@/features/auth/components/account-deleted-screen';
import { HideSplashWhenMounted } from '@/shared/splash/splash-ready';

export default function AccountDeletedRoute() {
  return (
    <>
      <AppStatusBar background={AppColors.sage} />
      <HideSplashWhenMounted />
      <AccountDeletedScreen />
    </>
  );
}
