import { Canvas } from '@react-three/fiber';
import { useRef, useState } from 'react';
import type { Mesh } from 'three';

import type { Keyframe } from '../model/keyframes';
import { KENDAMA_LAYOUT } from '../model/kendama-geometry';
import { KendamaModel } from './KendamaModel';
import { Tama } from './Tama';
import { KendamaString } from './String';

export type TrickSceneHandle = {
  isPlaying: boolean;
  replay: () => void;
};

type TrickSceneProps = {
  keyframes: readonly Keyframe[];
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
};

/**
 * Composes the static kendama model with an animated tama and dynamic
 * string inside a Canvas. Playback state lives here; visualization
 * components below only read refs/props, no shared store needed at
 * this scale.
 */
export function TrickScene({
  keyframes,
  durationSeconds = 1.6,
  children,
  canvasExtras,
}: TrickSceneProps) {
  const tamaRef = useRef<Mesh>(null);
  const [isPlaying, setIsPlaying] = useState(true);
  const [playToken, setPlayToken] = useState(0);

  const replay = () => {
    setPlayToken((token) => token + 1);
    setIsPlaying(true);
  };

  return (
    <>
      <Canvas camera={{ position: [1.6, 0.6, 2.4], fov: 45 }}>
        <ambientLight intensity={0.6} />
        <directionalLight position={[2, 3, 2]} intensity={1.1} />
        <KendamaModel />
        <Tama
          ref={tamaRef}
          keyframes={keyframes}
          radius={KENDAMA_LAYOUT.tamaRadius}
          durationSeconds={durationSeconds}
          isPlaying={isPlaying}
          playToken={playToken}
        />
        <KendamaString anchorPosition={KENDAMA_LAYOUT.spikeTip} tamaRef={tamaRef} />
        {canvasExtras}
      </Canvas>
      {children?.({ isPlaying, replay })}
    </>
  );
}
