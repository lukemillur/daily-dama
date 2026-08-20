import { bigCup } from '../model/tricks/cupCatches';
import { HeroCaption } from './HeroCaption';
import { TrickScene } from './TrickScene';

/**
 * Decorative, non-interactive, continuously-looping render of Big Cup with
 * the "Daily Dama" wordmark rendered inside the scene.
 *
 * No `children` render prop (no HUD) and no `canvasExtras`-driven
 * OrbitControls -- this is purely for looking at, per the resolved product
 * decision that the hero has no drag/orbit/tap interaction. Used both by
 * the landing-page hero (T123.2) and the sandbox's isolated preview
 * (T123.1), so it's validated once and reused rather than rebuilt.
 */
export function LoopingHeroScene() {
  return (
    <TrickScene trick={bigCup} loop followAction speed={0.85} canvasExtras={() => <HeroCaption />} />
  );
}
