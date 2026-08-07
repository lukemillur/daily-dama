import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import { CatmullRomCurve3, Group, Mesh, TubeGeometry, Vector3 } from 'three';

import { createWorldColliderBuffer, toWorldColliders } from '../model/kendama-colliders';
import { KENDAMA_LAYOUT } from '../model/kendama-geometry';
import { createRope, stepRope, toCurvePoints, type RopeState } from '../model/rope';
import { TAMA_LAYOUT } from '../model/tama-geometry';

/** Light, like a real kendama string — and legible on a dark scene. */
const STRING_COLOR = '#ded5c4';
const STRING_RADIUS = 0.012;

/**
 * Rope particles. Enough that the string can curve around a cup rim without
 * cutting the corner, few enough that ten solver passes stay cheap.
 */
const PARTICLE_COUNT = 28;

type StringProps = {
  /** The ken group, so the anchor and colliders track it as it moves. */
  kenRef: React.RefObject<Group | null>;
  /** The tama group. The string runs hole-to-ball whoever is holding what. */
  tamaRef: React.RefObject<Group | null>;
  /** Changes when a new run starts, to re-lay the rope straight. */
  runToken: string;
};

/**
 * The string, simulated as a verlet rope that collides with the ken.
 *
 * The previous version drew a fixed three-point curve with a hardcoded sag,
 * which had no way to avoid anything — at full string length it hung
 * straight through the model. A rope with real segments gets collision and
 * natural drape from the same solve, and needs no per-trick routing: it
 * reacts to wherever the ken and tama happen to be.
 */
export function KendamaString({ kenRef, tamaRef, runToken }: StringProps) {
  const anchorLocal = KENDAMA_LAYOUT.stringHoleLocal;
  const restLength = KENDAMA_LAYOUT.stringRestLength;
  const tamaRadius = TAMA_LAYOUT.radius;

  const meshRef = useRef<Mesh>(null);
  const ropeRef = useRef<RopeState | null>(null);
  const lastRunToken = useRef(runToken);
  const collidersRef = useRef(createWorldColliderBuffer());
  const anchorRef = useRef(new Vector3());
  const endRef = useRef(new Vector3());

  useFrame((_, delta) => {
    const mesh = meshRef.current;
    const tama = tamaRef.current;
    const ken = kenRef.current;
    if (!mesh || !tama || !ken) return;

    ken.updateMatrixWorld();
    const anchor = anchorRef.current.set(...anchorLocal).applyMatrix4(ken.matrixWorld);

    // The string meets the tama at its surface, on the side facing the
    // hole, so the tube stops at the ball rather than spearing its centre.
    const end = endRef.current.subVectors(anchor, tama.position);
    const span = end.length();
    if (span < 1e-6) end.set(0, tamaRadius, 0).add(tama.position);
    else end.multiplyScalar(tamaRadius / span).add(tama.position);

    if (!ropeRef.current || lastRunToken.current !== runToken) {
      lastRunToken.current = runToken;
      ropeRef.current = createRope(PARTICLE_COUNT, anchor, end, restLength);
    }

    stepRope(ropeRef.current, {
      anchor,
      end,
      colliders: toWorldColliders(ken.matrixWorld, collidersRef.current),
      tamaCenter: tama.position,
      tamaRadius,
      skin: STRING_RADIUS,
      dt: delta,
    });

    const points = toCurvePoints(ropeRef.current.positions, anchor, end);
    if (!points) {
      // A non-finite particle would poison the whole tube; re-lay the rope
      // straight and pick up again next frame.
      ropeRef.current = createRope(PARTICLE_COUNT, anchor, end, restLength);
      return;
    }

    const curve = new CatmullRomCurve3(points);
    const nextGeometry = new TubeGeometry(curve, PARTICLE_COUNT * 2, STRING_RADIUS, 6, false);

    mesh.geometry.dispose();
    mesh.geometry = nextGeometry;
  });

  return (
    <mesh ref={meshRef}>
      <tubeGeometry
        args={[new CatmullRomCurve3([new Vector3(), new Vector3()]), 8, STRING_RADIUS, 6, false]}
      />
      <meshStandardMaterial color={STRING_COLOR} />
    </mesh>
  );
}
