import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import { CatmullRomCurve3, Mesh, TubeGeometry, Vector3 } from 'three';

import type { Vec3 } from '../model/keyframes';

const STRING_COLOR = '#2c2c2c';
const STRING_RADIUS = 0.012;

type StringProps = {
  anchorPosition: Vec3;
  tamaRef: React.RefObject<Mesh | null>;
};

/**
 * Recomputes a thin tube each frame between the ken's fixed anchor point
 * and the tama's live position, so the string visually stretches and
 * slackens as the tama moves.
 */
export function KendamaString({ anchorPosition, tamaRef }: StringProps) {
  const meshRef = useRef<Mesh>(null);
  const anchor = new Vector3(...anchorPosition);

  useFrame(() => {
    const mesh = meshRef.current;
    const tama = tamaRef.current;
    if (!mesh || !tama) return;

    const curve = new CatmullRomCurve3([anchor, tama.position.clone()]);
    const nextGeometry = new TubeGeometry(curve, 8, STRING_RADIUS, 6, false);

    mesh.geometry.dispose();
    mesh.geometry = nextGeometry;
  });

  return (
    <mesh ref={meshRef}>
      <tubeGeometry args={[new CatmullRomCurve3([anchor, anchor]), 8, STRING_RADIUS, 6, false]} />
      <meshStandardMaterial color={STRING_COLOR} />
    </mesh>
  );
}
