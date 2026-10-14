import { Redirect } from 'expo-router';
import { lazy, Suspense } from 'react';

/**
 * A dynamic import is what makes Metro emit the 3D stack (three, fiber,
 * troika) as a separate web chunk. A static import here would put it in the
 * entry bundle every visitor downloads, even though production only ever
 * renders the redirect below.
 */
const TrickVizSandboxScreen = lazy(() =>
  import('@/features/trick-viz/components/trick-viz-chunk').then((module) => ({
    default: module.TrickVizSandboxScreen,
  })),
);

/**
 * Dev-only route. Nested under the stats route (which already has a Stack
 * layout) rather than the NativeTabs/Tabs root, since those tab navigators
 * only host routes tied to a registered tab trigger. Not linked from the tab
 * nav; only reachable via the dev-only link on Home, and inert outside local
 * development regardless of how the URL is reached.
 */
export default function TrickVizSandboxRoute() {
  if (!__DEV__) {
    return <Redirect href="/app/home" />;
  }

  return (
    <Suspense fallback={null}>
      <TrickVizSandboxScreen />
    </Suspense>
  );
}
