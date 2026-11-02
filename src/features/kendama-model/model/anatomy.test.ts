import {
  cupMouthRadius,
  cupSeatOffset,
  HANDLE,
  HANDLE_BODY,
  HANDLE_DISH,
  sampleProfile,
  SARADO,
  SARADO_BIG_BOWL,
  SARADO_BODY,
  SARADO_SMALL_BOWL,
  spikedMouthRestHeight,
  TAMA,
  TAMA_BORE,
  TAMA_BORE_DEPTH,
  TAMA_SHELL,
  type ProfilePiece,
} from './anatomy';

const PROFILES: Record<string, readonly ProfilePiece[]> = {
  HANDLE_DISH,
  HANDLE_BODY,
  SARADO_SMALL_BOWL,
  SARADO_BODY,
  SARADO_BIG_BOWL,
  TAMA_SHELL,
  TAMA_BORE,
};

/** Height along the handle of the sarado's top surface, where the spike starts. */
const SARADO_TOP = SARADO.heightOnHandle + SARADO.waistRadius;

describe('sampled profiles', () => {
  it.each(Object.entries(PROFILES))('%s has finite, non-negative, distinct points', (_, pieces) => {
    const points = sampleProfile(pieces);
    expect(points.length).toBeGreaterThan(2);

    for (const [index, [r, h]] of points.entries()) {
      expect(Number.isFinite(r) && Number.isFinite(h)).toBe(true);
      expect(r).toBeGreaterThanOrEqual(0);
      if (index > 0) {
        const [pr, ph] = points[index - 1];
        // A zero-length step poisons LatheGeometry's normals with NaN.
        expect(Math.hypot(r - pr, h - ph)).toBeGreaterThan(1e-4);
      }
    }
  });

  it('meets each neighbouring mesh exactly at the seam', () => {
    const seam = (a: readonly ProfilePiece[], b: readonly ProfilePiece[]) => {
      const end = a[a.length - 1].at(-1)!;
      const start = b[0][0];
      return Math.hypot(end[0] - start[0], end[1] - start[1]);
    };

    expect(seam(HANDLE_DISH, HANDLE_BODY)).toBeLessThan(1e-9);
    expect(seam(SARADO_SMALL_BOWL, SARADO_BODY)).toBeLessThan(1e-9);
    expect(seam(SARADO_BODY, SARADO_BIG_BOWL)).toBeLessThan(1e-9);
    expect(seam(TAMA_SHELL, TAMA_BORE)).toBeLessThan(1e-9);
    expect(seam(TAMA_BORE, TAMA_SHELL)).toBeLessThan(1e-9);
  });
});

describe('cups', () => {
  it.each([
    ['big', SARADO.bigCup],
    ['small', SARADO.smallCup],
  ] as const)('the %s cup catches the tama on its rim, not in its bowl', (_, cup) => {
    expect(cupMouthRadius(cup)).toBeLessThan(TAMA.radius);
    // A bowl tighter than the ball means the ball can only touch the rim.
    expect(cup.sphereRadius).toBeLessThan(TAMA.radius);
    expect(cupSeatOffset(cup)).toBeGreaterThan(0);
  });

  it('keeps real proportions: big cup mouth about 0.73 of the tama radius', () => {
    expect(cupMouthRadius(SARADO.bigCup) / TAMA.radius).toBeCloseTo(0.73, 1);
    expect(cupMouthRadius(SARADO.smallCup)).toBeLessThan(cupMouthRadius(SARADO.bigCup));
  });

  it('builds the rim from the same mouth the seat is computed against', () => {
    const rimInner = SARADO_BODY[4].at(-1)!;
    expect(rimInner[0]).toBeCloseTo(cupMouthRadius(SARADO.bigCup), 0);
  });

  it('keeps the base cup shallower than the side cups', () => {
    const bigDepth = SARADO.bigCup.rimHeight - SARADO.bigCup.bottomHeight;
    expect(HANDLE.baseCup.depth).toBeLessThan(bigDepth);
  });
});

describe('spike and tama', () => {
  const exposedSpike = sampleProfile(HANDLE_BODY).filter(([, h]) => h >= SARADO_TOP);

  it('fits the spike inside the bore along its whole exposed length', () => {
    const widest = Math.max(...exposedSpike.map(([r]) => r));
    expect(widest).toBeLessThan(TAMA.boreRadius);
  });

  it('has a bore deeper than the exposed spike, so the ball rests on the sarado', () => {
    expect(TAMA_BORE_DEPTH).toBeGreaterThan(HANDLE.height - SARADO_TOP);
  });

  it('rests a spiked tama on the hourglass with the tip short of the bore ceiling', () => {
    const mouthHeight = SARADO.heightOnHandle + spikedMouthRestHeight();
    expect(mouthHeight).toBeGreaterThan(SARADO_TOP);
    const inserted = HANDLE.height - mouthHeight;
    expect(inserted).toBeLessThan(TAMA_BORE_DEPTH);
    expect(inserted).toBeGreaterThan(TAMA_BORE_DEPTH * 0.75);
  });

  it('leaves wood between the bore ceiling and the string hole', () => {
    expect(TAMA.radius - TAMA.boreTopHeight).toBeGreaterThan(5);
  });
});
