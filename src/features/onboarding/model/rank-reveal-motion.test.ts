import { describe, expect, it } from '@jest/globals';

import { selectRankRevealLayout, selectRankRevealMotion } from './rank-reveal-motion';

describe('selectRankRevealMotion', () => {
  it.each(['ios', 'android'] as const)('uses a bounded timed entrance on %s', (os) => {
    const motion = selectRankRevealMotion(os);
    expect(motion.kind).toBe('timed');
    if (motion.kind !== 'timed') return;
    expect(motion.badgeDurationMs).toBeGreaterThanOrEqual(800);
    expect(motion.badgeDurationMs).toBeLessThanOrEqual(1000);
    expect(motion.badgeStartScale).toBeGreaterThanOrEqual(0.9);
    expect(motion).not.toHaveProperty('badgeDamping');
    // Everything settles by about one second.
    expect(motion.buttonDelayMs + motion.textFadeMs).toBeLessThanOrEqual(1000);
  });

  it('keeps the accepted web spring values', () => {
    expect(selectRankRevealMotion('web')).toEqual({
      kind: 'spring',
      eyebrowFadeMs: 400,
      badgeZoomMs: 650,
      badgeDamping: 11,
      textFadeMs: 400,
      titleDelayMs: 350,
      copyDelayMs: 450,
      buttonDelayMs: 550,
    });
  });
});

describe('selectRankRevealLayout', () => {
  it('keeps the accepted web look at 1280x800', () => {
    expect(selectRankRevealLayout({ width: 1280, height: 800 })).toEqual({
      badgeSize: 220,
      numeralSize: 100,
      titleSize: 40,
      bottomPadding: 130,
    });
  });

  it.each([
    [320, 568, 170],
    [360, 640, 192],
    [393, 852, 220],
  ])('sizes the badge for %ix%i', (width, height, badge) => {
    const layout = selectRankRevealLayout({ width, height });
    expect(layout.badgeSize).toBe(badge);
    expect(layout.badgeSize).toBeLessThanOrEqual(width * 0.6);
    expect(layout.numeralSize).toBeLessThan(layout.badgeSize);
  });

  it('never goes below the minimum badge and shortens padding on short viewports', () => {
    const layout = selectRankRevealLayout({ width: 200, height: 300 });
    expect(layout.badgeSize).toBe(120);
    expect(layout.bottomPadding).toBeLessThan(130);
  });
});
