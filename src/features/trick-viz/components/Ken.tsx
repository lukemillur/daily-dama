import { useMemo } from 'react';

import { KENDAMA_LAYOUT } from '../model/kendama-geometry';
import {
  CRADLE_RADIUS,
  kenBodyProfile,
  sideCupProfile,
  SIDE_CUP_ARM_REACH,
} from '../model/ken-profile';
import { createWoodTexture } from '../model/wood-texture';

/**
 * Pale maple, the wood the reference kendama is turned from. The sarado is
 * a separate piece and reads as one for being a shade apart.
 */
const BODY_GRAIN = { base: '#e9d2ac', grain: '#c8a679' };
const SARADO_GRAIN = { base: '#e0c69c', grain: '#bd9564' };

/**
 * Radial segments. High enough that the silhouette of a cup rim is a curve
 * rather than a polygon — the faceting, not the shape, is most of what read
 * as "low poly" before.
 */
const BODY_SEGMENTS = 72;
const CUP_SEGMENTS = 56;

/**
 * The ken: the whole stick assembly the player holds. Top to bottom in its
 * neutral local frame — spike, sarado (crosspiece with small cup facing
 * left and big cup facing right), grip shaft, base cup facing down.
 *
 * Built from two kinds of surface of revolution, which is how a kendama is
 * actually made: one lathe for the body (base cup, grip, hub, neck, spike
 * — all on the same axis) and one per side cup, each including the arm that
 * carries it. See `ken-profile.ts` for the profiles and why they are there
 * and not here.
 *
 * Deliberately pose-free. Tricks hold the ken at wildly different angles,
 * so the grip lives in a `BodyPose` applied by `TrickScene`; keeping this
 * component at identity means `KENDAMA_LAYOUT` stays the single local frame
 * that both the geometry and the trick landmarks are written in.
 */
export function Ken() {
  const { smallCup, bigCup } = KENDAMA_LAYOUT;

  // Generated once and shared: building the grain is a per-pixel loop, and
  // there is no reason for the two cups to each carry their own copy.
  const bodyWood = useMemo(() => createWoodTexture(BODY_GRAIN), []);
  const saradoWood = useMemo(
    () => createWoodTexture({ ...SARADO_GRAIN, lines: 9, direction: 'concentric' }),
    [],
  );

  const body = useMemo(() => kenBodyProfile(CRADLE_RADIUS), []);
  const bigCupProfile = useMemo(
    () => sideCupProfile(bigCup, SIDE_CUP_ARM_REACH, CRADLE_RADIUS),
    [bigCup],
  );
  const smallCupProfile = useMemo(
    () => sideCupProfile(smallCup, SIDE_CUP_ARM_REACH, CRADLE_RADIUS),
    [smallCup],
  );

  return (
    <group>
      {/* Base cup, grip, sarado hub, neck and spike, turned as one piece. */}
      <mesh>
        <latheGeometry args={[body, BODY_SEGMENTS]} />
        <meshStandardMaterial map={bodyWood} roughness={0.62} metalness={0} side={2} />
      </mesh>

      {/* Big cup: opens right (+X), so its lathe axis rolls from +Y to +X. */}
      <mesh position={bigCup.center} rotation={[0, 0, -Math.PI / 2]}>
        <latheGeometry args={[bigCupProfile, CUP_SEGMENTS]} />
        <meshStandardMaterial map={saradoWood} roughness={0.6} metalness={0} side={2} />
      </mesh>

      {/* Small cup: opens left (-X). */}
      <mesh position={smallCup.center} rotation={[0, 0, Math.PI / 2]}>
        <latheGeometry args={[smallCupProfile, CUP_SEGMENTS]} />
        <meshStandardMaterial map={saradoWood} roughness={0.6} metalness={0} side={2} />
      </mesh>
    </group>
  );
}
