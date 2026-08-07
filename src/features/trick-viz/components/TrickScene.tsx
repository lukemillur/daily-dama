import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useMemo, useRef, useState } from 'react';
import { Vector3, type Group, type Mesh } from 'three';

import { frameSubjects, viewDirectionFor, type Framing } from '../model/framing';
import { sampleAtTime, type Keyframe, type Vec3 } from '../model/keyframes';
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
  canvasExtras?: (framing: Framing) => React.ReactNode;
  /**
   * Whether the camera follows the action. Turn it off to hand control to
   * something in `canvasExtras` (e.g. OrbitControls), which would otherwise
   * fight the rig for the camera every frame.
   */
  followAction?: boolean;
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

const CAMERA_FOV = 45;

/**
 * Seconds for the camera to close most of the way to its desired framing.
 *
 * The camera should trail the action rather than being welded to it — a
 * shot locked exactly onto the tama reads as the tama standing still while
 * the world moves. Long enough to feel like an operator following a throw,
 * short enough to keep up with a 2.2s trick.
 */
const CAMERA_SMOOTHING = 0.32;

type CameraRigProps = {
  tamaRef: React.RefObject<Mesh | null>;
  kenRef: React.RefObject<Group | null>;
  direction: Vec3;
  initial: Framing;
};

/**
 * Follows the action, reframing every frame and easing toward it.
 *
 * The Canvas `camera` prop only ever places the camera once and never aims
 * it, so both the position and the look-at are driven here.
 */
function CameraRig({ tamaRef, kenRef, direction, initial }: CameraRigProps) {
  const camera = useThree((state) => state.camera);
  const target = useRef(new Vector3(...initial.target));
  const desiredPosition = useRef(new Vector3());
  const desiredTarget = useRef(new Vector3());
  const hasFramed = useRef(false);

  useFrame((_, delta) => {
    const tama = tamaRef.current;
    const ken = kenRef.current;
    if (!tama || !ken) return;

    const framing = frameSubjects(
      [tama.position.x, tama.position.y, tama.position.z],
      KENDAMA_LAYOUT.tamaRadius,
      [ken.position.x, ken.position.y, ken.position.z],
      CAMERA_FOV,
      direction,
      'aspect' in camera ? (camera.aspect as number) : 1,
    );

    desiredPosition.current.set(...framing.position);
    desiredTarget.current.set(...framing.target);

    // Framerate-independent exponential ease: the same fraction of the
    // remaining distance per unit time, whatever the frame length. The first
    // frame snaps instead — the opening shot should already be framed, and
    // only here is the real viewport aspect known.
    const alpha = hasFramed.current ? 1 - Math.exp(-delta / CAMERA_SMOOTHING) : 1;
    hasFramed.current = true;

    camera.position.lerp(desiredPosition.current, alpha);
    target.current.lerp(desiredTarget.current, alpha);
    camera.lookAt(target.current);
  });

  return null;
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
  followAction = true,
}: TrickSceneProps) {
  const tamaRef = useRef<Mesh>(null);
  const kenRef = useRef<Group>(null);
  const [isPlaying, setIsPlaying] = useState(true);
  const [playToken, setPlayToken] = useState(0);

  const viewDirection = useMemo(
    () => viewDirectionFor(kenPose, KENDAMA_LAYOUT.stringHoleLocal),
    [kenPose],
  );

  // Opens on the trick's first pose, so the shot starts correctly framed
  // instead of easing in from wherever the camera happened to be placed.
  const framing = useMemo(
    () =>
      frameSubjects(
        keyframes[0].position,
        KENDAMA_LAYOUT.tamaRadius,
        kenPose.position,
        CAMERA_FOV,
        viewDirection,
      ),
    [keyframes, kenPose, viewDirection],
  );

  const replay = () => {
    setPlayToken((token) => token + 1);
    setIsPlaying(true);
  };

  return (
    <>
      <Canvas camera={{ position: [...framing.position], fov: CAMERA_FOV }}>
        {followAction ? (
          <CameraRig
            tamaRef={tamaRef}
            kenRef={kenRef}
            direction={viewDirection}
            initial={framing}
          />
        ) : null}
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
          tamaRadius={KENDAMA_LAYOUT.tamaRadius}
          playToken={playToken}
        />
        {canvasExtras?.(framing)}
      </Canvas>
      {children?.({ isPlaying, replay })}
    </>
  );
}
