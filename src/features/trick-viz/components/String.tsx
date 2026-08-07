import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import { CatmullRomCurve3, Group, Mesh, TubeGeometry, Vector3 } from 'three';

import type { Vec3 } from '../model/keyframes';

/** Light, like a real kendama string — and legible on a dark scene. */
const STRING_COLOR = '#ded5c4';
const STRING_RADIUS = 0.012;
/** How much of the slack turns into visible droop. */
const SAG_FACTOR = 0.55;

type StringProps = {
  /** The ken group, so the anchor tracks the ken as it moves. */
  kenRef: React.RefObject<Group | null>;
  /** String hole position in ken-local space. */
  anchorLocal: Vec3;
  /** Length of the string; anything shorter than this hangs slack. */
  restLength: number;
  tamaRef: React.RefObject<Mesh | null>;
};

/**
 * Recomputes a thin tube each frame between the string hole (tracked
 * through the ken's live transform, since the ken moves during a trick)
 * and the tama's live position.
 *
 * When the tama is closer to the hole than the string is long, the excess
 * has to go somewhere — the midpoint is bowed downward in proportion to
 * the slack. Without this the string reads as a rigid rod at the catch,
 * where roughly half its length is spare.
 */
export function KendamaString({ kenRef, anchorLocal, restLength, tamaRef }: StringProps) {
  const meshRef = useRef<Mesh>(null);

  useFrame(() => {
    const mesh = meshRef.current;
    const tama = tamaRef.current;
    const ken = kenRef.current;
    if (!mesh || !tama || !ken) return;

    // Allocated per frame rather than hoisted: the tube geometry below is
    // rebuilt every frame anyway, so a few vectors are noise, and it keeps
    // this free of render-scoped mutable state.
    ken.updateMatrixWorld();
    const anchor = new Vector3(...anchorLocal).applyMatrix4(ken.matrixWorld);

    const distance = anchor.distanceTo(tama.position);
    const slack = Math.max(restLength - distance, 0);

    const mid = new Vector3()
      .addVectors(anchor, tama.position)
      .multiplyScalar(0.5)
      .setY((anchor.y + tama.position.y) / 2 - slack * SAG_FACTOR);

    const curve = new CatmullRomCurve3([anchor, mid, tama.position.clone()]);
    const nextGeometry = new TubeGeometry(curve, 16, STRING_RADIUS, 6, false);

    mesh.geometry.dispose();
    mesh.geometry = nextGeometry;
  });

  return (
    <mesh ref={meshRef}>
      <tubeGeometry
        args={[new CatmullRomCurve3([new Vector3(), new Vector3()]), 16, STRING_RADIUS, 6, false]}
      />
      <meshStandardMaterial color={STRING_COLOR} />
    </mesh>
  );
}
