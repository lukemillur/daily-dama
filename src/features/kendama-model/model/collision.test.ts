import { cupMouthRadius, cupSeatOffset, HANDLE, SARADO, TAMA } from './anatomy';
import { collideWithKen, createKenContact } from './collision';

const IDENTITY = [0, 0, 0, 1];
const ORIGIN = [0, 0, 0];

function contactAt(point: number[], radius: number) {
  const contact = createKenContact();
  const touching = collideWithKen(ORIGIN, IDENTITY, point, 0, radius, contact);
  return { touching, depth: contact.depth, normal: [...contact.normal] };
}

describe('collideWithKen', () => {
  it('rests a tama exactly on the big cup rim', () => {
    const { bigCup, heightOnHandle } = SARADO;
    const seated = [bigCup.rimHeight + cupSeatOffset(bigCup), heightOnHandle, 0];

    // Seated: touching to within the rim's rounding, not buried in it.
    const atSeat = contactAt(seated, TAMA.radius);
    expect(atSeat.depth).toBeLessThan(1.5);

    const lifted = contactAt([seated[0] + 2, seated[1], seated[2]], TAMA.radius);
    expect(lifted.touching).toBe(false);

    const pressed = contactAt([seated[0] - 3, seated[1], seated[2]], TAMA.radius);
    expect(pressed.touching).toBe(true);
    // A ball on a rim is pushed along the line from the rim to its centre,
    // tilted off the cup's axis by the seat geometry.
    expect(pressed.normal[0]).toBeCloseTo(cupSeatOffset(bigCup) / TAMA.radius, 1);
  });

  it('pushes a point inside the handle back out radially', () => {
    const { depth, normal } = contactAt([3, 120, 0], 0.5);
    expect(depth).toBeGreaterThan(2);
    expect(normal[0]).toBeGreaterThan(0.95);
  });

  it('treats the inside of a cup as open space', () => {
    // Just inside the big cup's mouth, on its axis.
    const { touching } = contactAt([SARADO.bigCup.rimHeight - 2, SARADO.heightOnHandle, 0], 1);
    expect(touching).toBe(false);
    expect(cupMouthRadius(SARADO.bigCup)).toBeGreaterThan(20);
  });

  it('ignores points far from the ken', () => {
    expect(contactAt([0, HANDLE.height + 50, 0], 1).touching).toBe(false);
    expect(contactAt([200, 50, 0], 1).touching).toBe(false);
  });

  it('respects the ken pose', () => {
    // Rotate the ken a quarter turn about Z: local +Y (handle) becomes world -X.
    const s = Math.SQRT1_2;
    const contact = createKenContact();
    const touching = collideWithKen([0, 0, 0], [0, 0, s, s], [-120, 3, 0], 0, 0.5, contact);
    expect(touching).toBe(true);
    expect(contact.normal[1]).toBeGreaterThan(0.95);
  });
});
