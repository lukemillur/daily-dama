import { useFrame } from '@react-three/fiber';
import { forwardRef, useRef } from 'react';
import type { Mesh } from 'three';

import { sampleAtTime, type Keyframe } from '../model/keyframes';

const TAMA_COLOR = '#f2e4c9';

type TamaProps = {
  keyframes: readonly Keyframe[];
  radius: number;
  /** Seconds for one full playthrough of the keyframe sequence. */
  durationSeconds: number;
  isPlaying: boolean;
  /** Bumped by the parent to restart playback from t=0. */
  playToken: number;
};

/**
 * Sphere whose position is driven each frame by sampling the trick's
 * keyframes against elapsed playback time. Forwards its mesh ref so
 * sibling components (e.g. the string) can read its live position.
 */
export const Tama = forwardRef<Mesh, TamaProps>(function Tama(
  { keyframes, radius, durationSeconds, isPlaying, playToken },
  ref,
) {
  const elapsedRef = useRef(0);
  const lastPlayToken = useRef(playToken);

  if (lastPlayToken.current !== playToken) {
    lastPlayToken.current = playToken;
    elapsedRef.current = 0;
  }

  useFrame((_, delta) => {
    const mesh = (ref as React.RefObject<Mesh>)?.current;
    if (!mesh) return;

    if (isPlaying) {
      elapsedRef.current = Math.min(elapsedRef.current + delta, durationSeconds);
    }

    const t = durationSeconds === 0 ? 1 : elapsedRef.current / durationSeconds;
    const { position } = sampleAtTime(keyframes, t);
    mesh.position.set(position[0], position[1], position[2]);
  });

  return (
    <mesh ref={ref}>
      <sphereGeometry args={[radius, 24, 24]} />
      <meshStandardMaterial color={TAMA_COLOR} />
    </mesh>
  );
});
