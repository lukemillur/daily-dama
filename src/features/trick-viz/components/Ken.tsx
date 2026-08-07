import { KENDAMA_LAYOUT } from '../model/kendama-geometry';

const WOOD_COLOR = '#c98a4b';
const CUP_COLOR = '#e0a868';

type CupProps = {
  position: readonly [number, number, number];
  mouthRadius: number;
  neckRadius: number;
  height: number;
  rotation?: readonly [number, number, number];
};

/**
 * A cup tapers from its neck (narrow, matching the shaft it grows out of)
 * to its mouth (wide, open end) along local +Y by default; `rotation`
 * points that taper in whichever direction the cup actually opens.
 */
function Cup({ position, mouthRadius, neckRadius, height, rotation = [0, 0, 0] }: CupProps) {
  return (
    <mesh position={position} rotation={rotation}>
      <cylinderGeometry args={[mouthRadius, neckRadius, height, 24, 1, true]} />
      <meshStandardMaterial color={CUP_COLOR} side={2} />
    </mesh>
  );
}

/**
 * The ken: the whole stick assembly the player holds. Top to bottom in its
 * neutral local frame — spike, serato (crosspiece with small cup facing
 * left and big cup facing right), grip shaft, base cup facing down.
 *
 * Deliberately pose-free. Tricks hold the ken at wildly different angles,
 * so the grip lives in a `KenPose` applied by `TrickScene`; keeping this
 * component at identity means `KENDAMA_LAYOUT` stays the single local
 * frame that both the geometry and the trick landmarks are written in.
 */
export function Ken() {
  const { smallCup, bigCup, baseCup } = KENDAMA_LAYOUT;
  // The spike's base starts exactly where the shaft ends, at the shaft's
  // own radius, so it reads as one continuous taper rather than a thin
  // point erupting partway up a thicker shaft.
  const spikeHeight = KENDAMA_LAYOUT.spikeTip[1] - KENDAMA_LAYOUT.shaftTop;

  return (
    <group>
      {/* Grip shaft */}
      <mesh position={[0, (KENDAMA_LAYOUT.shaftBottom + KENDAMA_LAYOUT.shaftTop) / 2, 0]}>
        <cylinderGeometry
          args={[
            KENDAMA_LAYOUT.shaftRadius,
            KENDAMA_LAYOUT.shaftRadius,
            KENDAMA_LAYOUT.shaftTop - KENDAMA_LAYOUT.shaftBottom,
            16,
          ]}
        />
        <meshStandardMaterial color={WOOD_COLOR} />
      </mesh>

      {/* Serato (crosspiece) hub bar */}
      <mesh position={[0, KENDAMA_LAYOUT.seratoY, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry
          args={[KENDAMA_LAYOUT.seratoBarRadius, KENDAMA_LAYOUT.seratoBarRadius, KENDAMA_LAYOUT.seratoBarHalfSpan * 2, 16]}
        />
        <meshStandardMaterial color={WOOD_COLOR} />
      </mesh>

      {/* Small cup: tapers from the serato bar, opens left (-X) */}
      <Cup
        position={smallCup.center}
        mouthRadius={smallCup.mouthRadius}
        neckRadius={smallCup.neckRadius}
        height={smallCup.height}
        rotation={[0, 0, Math.PI / 2]}
      />

      {/* Big cup: tapers from the serato bar, opens right (+X) */}
      <Cup
        position={bigCup.center}
        mouthRadius={bigCup.mouthRadius}
        neckRadius={bigCup.neckRadius}
        height={bigCup.height}
        rotation={[0, 0, -Math.PI / 2]}
      />

      {/* Base cup: tapers from the shaft, opens down (-Y) */}
      <Cup
        position={baseCup.center}
        mouthRadius={baseCup.mouthRadius}
        neckRadius={baseCup.neckRadius}
        height={baseCup.height}
        rotation={[Math.PI, 0, 0]}
      />

      {/* Spike, tapering from the top of the shaft up to its tip */}
      <mesh position={[0, KENDAMA_LAYOUT.shaftTop + spikeHeight / 2, 0]}>
        <coneGeometry args={[KENDAMA_LAYOUT.shaftRadius, spikeHeight, 16]} />
        <meshStandardMaterial color="#8a5a2b" />
      </mesh>
    </group>
  );
}
