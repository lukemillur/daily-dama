import { Image } from 'expo-image';
import { useSyncExternalStore } from 'react';
import { styled } from 'styled-components/native';

import { AppColors, Radii } from '@/constants/theme';
import { LoopingHeroScene } from '@/features/trick-viz/components/LoopingHeroScene';

import { isWebGLAvailable } from '../utils/webgl-availability';

const HERO_ASPECT_RATIO = 4 / 3;

// WebGL availability never changes once the page has loaded, so this store
// has nothing to subscribe to -- 'useSyncExternalStore' is used purely for
// its snapshot/server-snapshot split, which is exactly the primitive React
// ships for reading a client-only value without a hydration mismatch: the
// static web export's Node prerender pass and the very first client render
// both use 'getServerSnapshot' (false, the fallback-image branch), and only
// the next client render reads the real 'isWebGLAvailable()' result.
function subscribe() {
  return () => {};
}

// Exported so its 'always false' contract -- the invariant that keeps the
// static export's Node prerender pass and the first client render in sync --
// can be asserted directly rather than only indirectly through a component render.
export function getServerSnapshot() {
  return false;
}

/**
 * Decorative, continuously-looping render of the trick-viz Big Cup scene,
 * with 'Daily Dama' rendered as 3D text inside it -- replaces the previous
 * hand-drawn SVG hero.
 */
export function LandingHero() {
  const webglOk = useSyncExternalStore(subscribe, isWebGLAvailable, getServerSnapshot);

  return (
    <HeroPanel testID="landing-hero" style={{ boxShadow: `8px 8px 0 ${AppColors.ink}` }}>
      {webglOk ? (
        <SceneFrame>
          <LoopingHeroScene />
        </SceneFrame>
      ) : (
        <Image
          source={require('@/assets/images/landing/landing-hero-fallback.png')}
          accessibilityLabel="A kendama mid-catch in its cup, with the Daily Dama wordmark"
          alt="A kendama mid-catch in its cup, with the Daily Dama wordmark"
          contentFit="cover"
          style={{ width: '100%', aspectRatio: HERO_ASPECT_RATIO, borderRadius: Radii.panel }}
        />
      )}
    </HeroPanel>
  );
}

// `margin-bottom` reserves room for the panel's own hard-edged `boxShadow`
// (8px 8px 0, set at the JSX call site). `getBoundingClientRect` on the
// panel itself doesn't include that shadow, so a bounding-box-only overlap
// check against whatever follows (e.g. the "Why Daily Dama" eyebrow) can
// pass while the rendered shadow still visually overlaps it, and checking a
// single width has missed this before. The margin must
// clear the shadow at every mobile width, not just 375px, so it's sized
// with slack rather than tuned to exactly 8px.
const HeroPanel = styled.View`
  margin-top: 4px;
  margin-bottom: 24px;
  padding: 18px;
  align-items: center;
  justify-content: center;
  width: 100%;
  max-width: 440px;
  align-self: center;
  background-color: ${AppColors.paperStrong};
  border: 2px solid ${AppColors.ink};
  border-radius: ${Radii.panel}px;
`;

const SceneFrame = styled.View`
  width: 100%;
  aspect-ratio: ${HERO_ASPECT_RATIO};
  border-radius: ${Radii.panel}px;
  overflow: hidden;
`;
