import { useMemo } from 'react';
import { DoubleSide } from 'three';

import { createWoodTexture } from '@/features/trick-viz/model/wood-texture';

import {
  HANDLE_BODY,
  HANDLE_DISH,
  SARADO,
  SARADO_BIG_BOWL,
  SARADO_BODY,
  SARADO_SMALL_BOWL,
  TAMA_BORE,
  TAMA_SHELL,
} from '../model/anatomy';
import { lathePoints } from '../model/views';

/**
 * Radial segments. A cup rim seen edge-on shows its faceting long before
 * anything else does.
 */
const SEGMENTS = 128;

const MAPLE = { base: '#ead3ad', grain: '#c9a77a' };

/**
 * The ken: handle and sarado, in millimetres, handle axis +Y with the base
 * cup mouth at the origin and the big cup toward +X.
 *
 * The sarado is its own lathe turned about its own axis and pushed onto the
 * handle, as a real one is. The handle passes through the sarado's waist;
 * the overlap is hidden inside the wood, so neither mesh needs a bore cut.
 */
export function KenModel() {
  const shaftGrain = useMemo(() => createWoodTexture(MAPLE), []);
  const endGrain = useMemo(
    () => createWoodTexture({ ...MAPLE, lines: 9, direction: 'concentric' }),
    [],
  );

  const handle = useMemo(() => lathePoints(HANDLE_BODY), []);
  const dish = useMemo(() => lathePoints(HANDLE_DISH), []);
  const sarado = useMemo(() => lathePoints(SARADO_BODY), []);
  const smallBowl = useMemo(() => lathePoints(SARADO_SMALL_BOWL), []);
  const bigBowl = useMemo(() => lathePoints(SARADO_BIG_BOWL), []);

  return (
    <group>
      <mesh>
        <latheGeometry args={[handle, SEGMENTS]} />
        <meshStandardMaterial map={shaftGrain} roughness={0.55} />
      </mesh>
      <mesh>
        <latheGeometry args={[dish, SEGMENTS]} />
        <meshStandardMaterial map={endGrain} roughness={0.6} />
      </mesh>

      {/* Lathe axis +Y rolled onto +X, so the big cup points along +X. */}
      <group position={[0, SARADO.heightOnHandle, 0]} rotation={[0, 0, -Math.PI / 2]}>
        <mesh>
          <latheGeometry args={[sarado, SEGMENTS]} />
          <meshStandardMaterial map={shaftGrain} roughness={0.55} />
        </mesh>
        <mesh>
          <latheGeometry args={[smallBowl, SEGMENTS]} />
          <meshStandardMaterial map={endGrain} roughness={0.6} />
        </mesh>
        <mesh>
          <latheGeometry args={[bigBowl, SEGMENTS]} />
          <meshStandardMaterial map={endGrain} roughness={0.6} />
        </mesh>
      </group>

      {/*
        The string hole through the sarado's waist, facing the player. A lathe
        cannot carry a cross-drilled hole, and at viewing distance a dark disc
        on the surface reads the same; polygon offset keeps it off the wood.
      */}
      <mesh position={[0, SARADO.heightOnHandle, SARADO.waistRadius]}>
        <circleGeometry args={[SARADO.stringHoleRadius, 32]} />
        <meshBasicMaterial
          color="#2b1d12"
          polygonOffset
          polygonOffsetFactor={-2}
          polygonOffsetUnits={-2}
        />
      </mesh>
    </group>
  );
}

type TamaModelProps = {
  color?: string;
};

/**
 * The tama, in millimetres, centred on the origin with its spike hole facing
 * -Y. The outside is lacquered; the bore and string hole are bare wood, as
 * they are on a real ball.
 */
export function TamaModel({ color = '#b9232c' }: TamaModelProps) {
  const boreGrain = useMemo(
    () => createWoodTexture({ base: '#c9a273', grain: '#9c774c', direction: 'concentric' }),
    [],
  );
  const shell = useMemo(() => lathePoints(TAMA_SHELL), []);
  const bore = useMemo(() => lathePoints(TAMA_BORE), []);

  return (
    <group>
      <mesh>
        <latheGeometry args={[shell, SEGMENTS]} />
        <meshPhysicalMaterial
          color={color}
          roughness={0.42}
          clearcoat={1}
          clearcoatRoughness={0.18}
        />
      </mesh>
      {/* Double-sided: the bore is mostly seen from inside, at grazing angles. */}
      <mesh>
        <latheGeometry args={[bore, SEGMENTS]} />
        <meshStandardMaterial map={boreGrain} roughness={0.8} side={DoubleSide} />
      </mesh>
    </group>
  );
}
