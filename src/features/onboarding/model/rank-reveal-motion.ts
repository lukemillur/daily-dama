// Pure presentation tuning for the shared rank reveal. Kept free of React so tests can assert the
// numbers directly instead of trusting an animation mock.

export type RankRevealOs = 'web' | 'ios' | 'android';

export type RankRevealMotion =
  | {
      readonly kind: 'spring';
      readonly eyebrowFadeMs: number;
      readonly badgeZoomMs: number;
      readonly badgeDamping: number;
      readonly textFadeMs: number;
      readonly titleDelayMs: number;
      readonly copyDelayMs: number;
      readonly buttonDelayMs: number;
    }
  | {
      readonly kind: 'timed';
      readonly eyebrowFadeMs: number;
      readonly badgeDurationMs: number;
      readonly badgeStartScale: number;
      readonly textFadeMs: number;
      readonly titleDelayMs: number;
      readonly copyDelayMs: number;
      readonly buttonDelayMs: number;
    };

// Web keeps the accepted zoom spring. Native uses a bounded timed fade with a small scale so the
// entrance has a known duration: `springify()` called without a config discards `.duration()`,
// which made the native zoom an unbounded, visibly bouncing spring.
export function selectRankRevealMotion(os: RankRevealOs): RankRevealMotion {
  if (os === 'web') {
    return {
      kind: 'spring',
      eyebrowFadeMs: 400,
      badgeZoomMs: 650,
      badgeDamping: 11,
      textFadeMs: 400,
      titleDelayMs: 350,
      copyDelayMs: 450,
      buttonDelayMs: 550,
    };
  }
  return {
    kind: 'timed',
    eyebrowFadeMs: 400,
    badgeDurationMs: 900,
    badgeStartScale: 0.92,
    textFadeMs: 350,
    titleDelayMs: 300,
    copyDelayMs: 400,
    buttonDelayMs: 500,
  };
}

export type RankRevealLayout = {
  readonly badgeSize: number;
  readonly numeralSize: number;
  readonly titleSize: number;
  readonly bottomPadding: number;
};

const MAX_BADGE = 220;
const MIN_BADGE = 120;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function selectRankRevealLayout({
  width,
  height,
}: {
  readonly width: number;
  readonly height: number;
}): RankRevealLayout {
  const badgeSize = Math.round(clamp(Math.min(width * 0.58, height * 0.3), MIN_BADGE, MAX_BADGE));
  return {
    badgeSize,
    // 100 at the full 220 badge, matching the accepted web numeral.
    numeralSize: Math.round((badgeSize * 100) / MAX_BADGE),
    titleSize: Math.round(clamp(width * 0.1, 30, 40)),
    bottomPadding: height < 700 ? 40 : 130,
  };
}
