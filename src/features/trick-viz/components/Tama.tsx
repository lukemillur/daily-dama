import { TAMA_LAYOUT } from '../model/tama-geometry';

const TAMA_COLOR = '#f2e4c9';
const HOLE_COLOR = '#2b2118';
const MARK_COLOR = '#b5462f';

/**
 * The tama: the ball, in its neutral local frame with the spike hole facing
 * up (+Y).
 *
 * Deliberately pose-free, exactly like `Ken` — the trick's track supplies
 * position and orientation, so `TAMA_LAYOUT` stays the single local frame
 * that both the geometry and the trick landmarks are written in.
 *
 * It used to be a plain sphere driven by a position track, which was enough
 * while every trick caught it in a cup: a ball on a rim looks the same
 * whichever way it is turned. A spike catch fixes its orientation
 * completely, so the hole has to be visible or the catch reads as the ball
 * balancing on a point.
 */
export function Tama() {
  const { radius, holeRadius, holeDepth } = TAMA_LAYOUT;

  // Where a flat disc of the hole's radius meets the sphere, so the bore's
  // mouth sits in the surface rather than floating above or sunk below it.
  const mouthY = Math.sqrt(radius ** 2 - holeRadius ** 2);

  return (
    <group>
      <mesh>
        <sphereGeometry args={[radius, 32, 32]} />
        <meshStandardMaterial color={TAMA_COLOR} />
      </mesh>

      {/* The spike hole, sunk into the top. */}
      <mesh position={[0, mouthY - holeDepth / 2, 0]}>
        <cylinderGeometry args={[holeRadius, holeRadius * 0.75, holeDepth, 16]} />
        <meshStandardMaterial color={HOLE_COLOR} />
      </mesh>

      {/*
        A painted mark on one side. Not decoration: a sphere spinning about
        its own axis is invisible without one, and whether the tama turns on
        the way up is the graded difference between the two pull-up spikes.
      */}
      <mesh position={[0, 0, radius * 0.94]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[radius * 0.3, radius * 0.3, radius * 0.16, 24]} />
        <meshStandardMaterial color={MARK_COLOR} />
      </mesh>
    </group>
  );
}
