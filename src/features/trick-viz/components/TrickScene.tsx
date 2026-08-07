import { Canvas, useFrame } from '@react-three/fiber';
import { useMemo, useRef, useState } from 'react';
import type { Group, Mesh } from 'three';

import { sampleAtTime, type Keyframe } from '../model/keyframes';
import { KENDAMA_LAYOUT } from '../model/kendama-geometry';
import { kenEuler, type KenPose } from '../model/ken-pose';
import { Ken } from './Ken';
import { Tama } from './Tama';
import { KendamaString } from './String';

export type TrickSceneHandle = {
  isPlaying: boolean;
  replay: () => void;
};

type TrickSceneProps = {
  keyframes: readonly Keyframe[];
  /** How the player holds the ken for this trick. */
  kenPose: KenPose;
  /**
   * Optional ken movement (a pull, a catch cushion) layered on top of the
   * pose. Omit for tricks where the ken is effectively still.
   */
  kenKeyframes?: readonly Keyframe[];
  durationSeconds?: number;
  /** Render prop for a HUD (e.g. Play/Replay button) driven by scene state. */
  children?: (handle: TrickSceneHandle) => React.ReactNode;
  /**
   * Extra three.js children rendered inside the Canvas, e.g. drei's
   * OrbitControls for dev inspection. Intentionally separate from
   * `children` (which renders outside the Canvas) since real in-app
   * placements of this scene won't pass camera controls.
   */
  canvasExtras?: React.ReactNode;
  cameraPosition?: readonly [number, number, number];
};

type PosedKenProps = {
  pose: KenPose;
  keyframes?: readonly Keyframe[];
  durationSeconds: number;
  isPlaying: boolean;
  playToken: number;
  groupRef: React.RefObject<Group | null>;
};

/**
 * The ken under its trick grip, translated each frame by the trick's ken
 * keyframes. Rotation comes from `kenEuler` — the same helper the trick's
 * landmark math uses — so the rendered grip and the computed cup positions
 * cannot disagree.
 */
function PosedKen({
  pose,
  keyframes,
  durationSeconds,
  isPlaying,
  playToken,
  groupRef,
}: PosedKenProps) {
  const elapsedRef = useRef(0);
  const lastPlayToken = useRef(playToken);
  const euler = useMemo(() => kenEuler(pose), [pose]);

  useFrame((_, delta) => {
    const group = groupRef.current;
    if (!group) return;

    // Restart detection lives here rather than in render: refs must not be
    // read or written during render, and the next frame is soon enough.
    if (lastPlayToken.current !== playToken) {
      lastPlayToken.current = playToken;
      elapsedRef.current = 0;
    }

    if (isPlaying) {
      elapsedRef.current = Math.min(elapsedRef.current + delta, durationSeconds);
    }

    const [x, y, z] = pose.position;
    if (!keyframes) {
      group.position.set(x, y, z);
      return;
    }

    const t = durationSeconds === 0 ? 1 : elapsedRef.current / durationSeconds;
    const offset = sampleAtTime(keyframes, t).position;
    group.position.set(x + offset[0], y + offset[1], z + offset[2]);
  });

  return (
    <group ref={groupRef} rotation={euler}>
      <Ken />
    </group>
  );
}

/**
 * Composes the posed kendama with an animated tama and dynamic string
 * inside a Canvas. Playback state lives here; visualization components
 * below only read refs/props, no shared store needed at this scale.
 */
export function TrickScene({
  keyframes,
  kenPose,
  kenKeyframes,
  durationSeconds = 2.2,
  children,
  canvasExtras,
  cameraPosition = [2.2, 1.4, 2.2],
}: TrickSceneProps) {
  const tamaRef = useRef<Mesh>(null);
  const kenRef = useRef<Group>(null);
  const [isPlaying, setIsPlaying] = useState(true);
  const [playToken, setPlayToken] = useState(0);

  const replay = () => {
    setPlayToken((token) => token + 1);
    setIsPlaying(true);
  };

  return (
    <>
      <Canvas camera={{ position: [...cameraPosition], fov: 45 }}>
        <ambientLight intensity={0.6} />
        <directionalLight position={[2, 3, 2]} intensity={1.1} />
        <PosedKen
          pose={kenPose}
          keyframes={kenKeyframes}
          durationSeconds={durationSeconds}
          isPlaying={isPlaying}
          playToken={playToken}
          groupRef={kenRef}
        />
        <Tama
          ref={tamaRef}
          keyframes={keyframes}
          radius={KENDAMA_LAYOUT.tamaRadius}
          durationSeconds={durationSeconds}
          isPlaying={isPlaying}
          playToken={playToken}
        />
        <KendamaString
          kenRef={kenRef}
          anchorLocal={KENDAMA_LAYOUT.stringHoleLocal}
          restLength={KENDAMA_LAYOUT.stringRestLength}
          tamaRef={tamaRef}
        />
        {canvasExtras}
      </Canvas>
      {children?.({ isPlaying, replay })}
    </>
  );
}
