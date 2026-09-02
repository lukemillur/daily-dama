import { LandingPage } from '@/features/landing/components/landing-page';
import { useRedirectOnboardedVisitorHome } from '@/features/landing/state/redirect-onboarded-visitor-home';

export default function RootRoute() {
  const shouldRedirect = useRedirectOnboardedVisitorHome();
  if (shouldRedirect) return null;
  return <LandingPage />;
}
