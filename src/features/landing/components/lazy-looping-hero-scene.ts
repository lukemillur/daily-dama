import { lazy } from 'react';

/**
 * The landing hero's 3D scene as a separate web chunk: the 3D stack is
 * several times larger than the rest of the app, so it must not be in the
 * entry bundle every visitor downloads before first interaction.
 *
 * Kept in its own module so tests can replace it; Jest's CommonJS runtime
 * cannot execute `import()` without experimental VM modules.
 */
export const LazyLoopingHeroScene = lazy(() =>
  import('@/features/trick-viz/components/trick-viz-chunk').then((module) => ({
    default: module.LoopingHeroScene,
  })),
);
