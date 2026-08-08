import { useMemo } from 'react';

import {
  TAMA_BORE_STEP_DEPTH,
  TAMA_BORE_TIP_RADIUS,
  TAMA_HOLE_MOUTH_Y,
  TAMA_LAYOUT,
  TAMA_MARK_ANGLE,
} from '../model/tama-geometry';
import { createWoodTexture } from '../model/wood-texture';

/**
 * The ball is turned from the same kind of wood as the ken, so it takes the
 * same grain — fainter, because a tama is sanded and finished smoother, and
 * banded rather than lengthwise: it is turned on the axis its two holes sit
 * on, so the growth rings show as bands around it.
 */
const TAMA_GRAIN = { base: '#f0e0c2', grain: '#d8bf99' };
const CAVITY_COLOR = '#3a2c1e';
/**
 * The shoulder where the wide bore stops. Cut end grain facing straight out
 * of the hole, so it catches more light than the walls beside it — which is
 * what makes the two stages read as two stages rather than one dark hole.
 */
const BORE_STEP_COLOR = '#4a3826';
const BORE_COLOR = '#241a12';
const MARK_COLOR = '#b5462f';
const KNOT_COLOR = '#ded5c4';

/**
 * The tama (dama), in its neutral local frame: big hole down, painted top up.
 *
 * Deliberately pose-free, exactly like `Ken` — the trick's track supplies
 * position and orientation, so `TAMA_LAYOUT` stays the single local frame
 * that both the geometry and the trick landmarks are written in.
 *
 * The ball is a sphere with the bottom cap **actually omitted**, not a solid
 * sphere with a dark spot painted where a hole should be. That matters for
 * more than looks: the cavity behind the opening is what swallows the spike,
 * and being able to see into it is what makes a landed spike read as landed
 * rather than balanced.
 */
export function Tama() {
  const { radius, holeRadius, holeDepth, stringHoleRadius, knotRadius } = TAMA_LAYOUT;

  // Where the opening cuts the sphere, measured from the top pole. The ring
  // it leaves has exactly `holeRadius`, so the bore lining meets it seamlessly
  // — and it cuts at `TAMA_HOLE_MOUTH_Y`, which is the same plane the hole's
  // socket sits on, so a landed ball touches the sarado in the model and in
  // the mesh alike.
  const holeAngle = Math.asin(holeRadius / radius);
  const cavityTop = TAMA_HOLE_MOUTH_Y + holeDepth;

  // Where the wide bore gives way to the narrow one. Both stages are real
  // here rather than one deep cylinder, because a spike this long bored at
  // full width the whole way would leave the ball a shell.
  const stepY = TAMA_HOLE_MOUTH_Y + TAMA_BORE_STEP_DEPTH;

  const stringHoleAngle = Math.asin(stringHoleRadius / radius);

  const wood = useMemo(
    () => createWoodTexture({ ...TAMA_GRAIN, strength: 0.14, lines: 7, direction: 'concentric' }),
    [],
  );

  return (
    <group>
      {/* The ball, less the cap at the bottom pole. */}
      <mesh>
        <sphereGeometry args={[radius, 40, 32, 0, Math.PI * 2, 0, Math.PI - holeAngle]} />
        <meshStandardMaterial map={wood} roughness={0.55} metalness={0} />
      </mesh>

      {/*
        The wide stage, which takes the body of the spike. Lining it with a
        double-sided tube is what stops the opening reading as a window
        straight through the ball: back faces of the sphere are culled, so
        without this you would see the background.
      */}
      <mesh position={[0, (TAMA_HOLE_MOUTH_Y + stepY) / 2, 0]}>
        <cylinderGeometry
          args={[holeRadius, holeRadius, TAMA_BORE_STEP_DEPTH, 32, 1, true]}
        />
        <meshStandardMaterial color={CAVITY_COLOR} side={2} />
      </mesh>

      {/* The shoulder the wide bore stops on. */}
      <mesh position={[0, stepY, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <ringGeometry args={[TAMA_BORE_TIP_RADIUS, holeRadius, 32]} />
        <meshStandardMaterial color={BORE_STEP_COLOR} side={2} />
      </mesh>

      {/* The narrow stage, carrying on for the point. */}
      <mesh position={[0, (stepY + cavityTop) / 2, 0]}>
        <cylinderGeometry
          args={[
            TAMA_BORE_TIP_RADIUS,
            TAMA_BORE_TIP_RADIUS,
            cavityTop - stepY,
            24,
            1,
            true,
          ]}
        />
        <meshStandardMaterial color={BORE_COLOR} side={2} />
      </mesh>

      {/* The blind end, seen looking up into the hole. */}
      <mesh position={[0, cavityTop, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <circleGeometry args={[TAMA_BORE_TIP_RADIUS, 24]} />
        <meshStandardMaterial color={BORE_COLOR} side={2} />
      </mesh>

      {/*
        The knot. It sits at the inner end of the string channel, bearing
        against the top of the cavity — that is what stops the string pulling
        back out through the hole. Only visible looking into the big hole,
        which is exactly where it should be.
      */}
      <mesh position={[0, cavityTop - knotRadius * 0.7, 0]}>
        <sphereGeometry args={[knotRadius, 12, 12]} />
        <meshStandardMaterial color={KNOT_COLOR} />
      </mesh>

      {/*
        The painted circle, centred on the string hole. A spherical cap
        rather than a disc stuck to the top: a flat disc of this radius would
        sink into the ball at its edges.
      */}
      <mesh>
        <sphereGeometry args={[radius * 1.003, 40, 16, 0, Math.PI * 2, 0, TAMA_MARK_ANGLE]} />
        <meshStandardMaterial color={MARK_COLOR} />
      </mesh>

      {/* The string hole itself, in the middle of the paint. */}
      <mesh>
        <sphereGeometry args={[radius * 1.006, 24, 8, 0, Math.PI * 2, 0, stringHoleAngle]} />
        <meshStandardMaterial color={BORE_COLOR} />
      </mesh>
    </group>
  );
}
