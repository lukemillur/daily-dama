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
 * Static primitive-built ken body. Top to bottom: spike, serato (crosspiece
 * with small cup facing left and big cup facing right), handle, base cup
 * facing down.
 */
export function KendamaModel() {
  const { smallCup, bigCup, baseCup } = KENDAMA_LAYOUT;
  // The spike's base starts exactly where the handle ends, at the handle's
  // own radius, so it reads as one continuous taper rather than a thin
  // point erupting partway up a thicker shaft.
  const spikeHeight = KENDAMA_LAYOUT.spikeTip[1] - KENDAMA_LAYOUT.handleTop;

  return (
    <group>
      {/* Handle */}
      <mesh position={[0, (KENDAMA_LAYOUT.handleBottom + KENDAMA_LAYOUT.handleTop) / 2, 0]}>
        <cylinderGeometry
          args={[
            KENDAMA_LAYOUT.handleRadius,
            KENDAMA_LAYOUT.handleRadius,
            KENDAMA_LAYOUT.handleTop - KENDAMA_LAYOUT.handleBottom,
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

      {/* Base cup: tapers from the handle, opens down (-Y) */}
      <Cup
        position={baseCup.center}
        mouthRadius={baseCup.mouthRadius}
        neckRadius={baseCup.neckRadius}
        height={baseCup.height}
        rotation={[Math.PI, 0, 0]}
      />

      {/* Spike, tapering from the top of the handle up to its tip */}
      <mesh position={[0, KENDAMA_LAYOUT.handleTop + spikeHeight / 2, 0]}>
        <coneGeometry args={[KENDAMA_LAYOUT.handleRadius, spikeHeight, 16]} />
        <meshStandardMaterial color="#8a5a2b" />
      </mesh>
    </group>
  );
}
