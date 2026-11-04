import Head from 'expo-router/head';
import { Platform } from 'react-native';

import { LandingPage } from '@/features/landing/components/landing-page';
import { useRedirectOnboardedVisitorHome } from '@/features/landing/state/redirect-onboarded-visitor-home';
import { NativeStartRoute } from '@/features/native-start/components/native-start-route';

const PRODUCTION_HOST = 'https://dailydama.com';
const LANDING_PAGE_DESCRIPTION =
  'Daily Dama is a kendama practice tracker: pick a trick, run a timed or open-ended sesh, and climb the Kentei ladder with progress you can point to.';
const OG_SHARE_IMAGE_URL = `${PRODUCTION_HOST}/images/daily-dama-og-share-card.png`;

/** Web keeps the marketing landing page; iOS and Android open the native Start screen. */
export default function RootRoute() {
  return Platform.OS === 'web' ? <WebLandingRoute /> : <NativeStartRoute />;
}

/**
 * `<Head>` renders before `shouldRedirect` short-circuits to
 * `null` below, so static export and first paint both get the landing page's
 * meta description and share tags even when a visitor is about to be
 * redirected into the app.
 */
function WebLandingRoute() {
  const shouldRedirect = useRedirectOnboardedVisitorHome();

  return (
    <>
      <Head>
        <title>Daily Dama - Kendama Practice Tracker</title>
        <meta name="description" content={LANDING_PAGE_DESCRIPTION} />
        <link rel="canonical" href={PRODUCTION_HOST} />
        <meta property="og:title" content="Daily Dama - Kendama Practice Tracker" />
        <meta property="og:site_name" content="Daily Dama" />
        <meta property="og:description" content={LANDING_PAGE_DESCRIPTION} />
        <meta property="og:image" content={OG_SHARE_IMAGE_URL} />
        <meta property="og:url" content={PRODUCTION_HOST} />
        <meta property="og:type" content="website" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Daily Dama - Kendama Practice Tracker" />
        <meta name="twitter:description" content={LANDING_PAGE_DESCRIPTION} />
        <meta name="twitter:image" content={OG_SHARE_IMAGE_URL} />
      </Head>
      {!shouldRedirect && <LandingPage />}
    </>
  );
}
