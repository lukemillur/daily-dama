import type { Keyframe } from '../keyframes';
import { KENDAMA_LAYOUT } from '../kendama-geometry';

/**
 * Big Cup: tama hangs at rest below the ken, gets tossed up past the spike,
 * and is caught seated in the big cup. Time is normalized 0-1; TrickScene
 * controls actual playback duration.
 */
export const BIG_CUP_KEYFRAMES: readonly Keyframe[] = [
  { t: 0, position: [0, -KENDAMA_LAYOUT.stringRestLength, 0.18] },
  { t: 0.12, position: [0, -KENDAMA_LAYOUT.stringRestLength - 0.06, 0.1] },
  { t: 0.55, position: [0, 1.05, 0.02] },
  { t: 0.82, position: [0, 0.55, 0] },
  { t: 1.0, position: KENDAMA_LAYOUT.bigCupRest },
];
