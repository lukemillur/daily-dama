import { SARADO } from './anatomy';
import { KEN_MASS } from './mass';

describe('the ken mass properties', () => {
  it('weighs what a real ken does', () => {
    expect(KEN_MASS.mass).toBeGreaterThan(65);
    expect(KEN_MASS.mass).toBeLessThan(95);
  });

  it('has its centre on the handle, below the sarado', () => {
    // Below the string hole is what makes a hanging ken hang spike up.
    const [x, y, z] = KEN_MASS.centre;
    expect(Math.abs(x)).toBeLessThan(2);
    expect(z).toBe(0);
    expect(y).toBeGreaterThan(50);
    expect(y).toBeLessThan(SARADO.heightOnHandle);
  });

  it('is hardest to turn end over end and easiest about the handle', () => {
    const I = KEN_MASS.inertia;
    expect(I[4]).toBeLessThan(I[0]);
    expect(I[4]).toBeLessThan(I[8]);
  });

  it('inverts its inertia exactly', () => {
    const I = KEN_MASS.inertia;
    const M = KEN_MASS.inverseInertia;
    for (let r = 0; r < 3; r += 1) {
      for (let c = 0; c < 3; c += 1) {
        const product = I[r * 3] * M[c] + I[r * 3 + 1] * M[3 + c] + I[r * 3 + 2] * M[6 + c];
        expect(product).toBeCloseTo(r === c ? 1 : 0, 9);
      }
    }
  });
});
