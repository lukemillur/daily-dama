import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useMemo, useRef, useState } from 'react';
import { Vector3, type Group } from 'three';

import { frameSubjects, type Framing } from '../model/framing';
import { sampleTrackInto, sampleView, type Trick } from '../model/timeline';
import { TAMA_LAYOUT } from '../model/tama-geometry';
import { Ken } from './Ken';
import { KendamaString } from './String';
import { Tama } from './Tama';

export type TrickSceneHandle = {
  isPlaying: boolean;
  replay: () => void;
  durationSeconds: number;
};

type TrickSceneProps = {
  trick: Trick;
  /**
   * Playback rate. The trick's own length comes from its beats — a toss is
   * as long as its height makes it — so this scales that rather than
   * replacing it.
   */
  speed?: number;
  /**
   * Freezes the trick at a fraction of its length instead of playing it.
   * Inspecting one moment of a two-second animation used to mean temporarily
   * stretching the whole trick to twenty seconds and reverting afterwards.
   */
  scrub?: number | null;
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

const CAMERA_FOV = 45;

/**
 * Seconds for the camera to close most of the way to its desired framing.
 *
 * The camera should trail the action rather than being welded to it — a
 * shot locked exactly onto the tama reads as the tama standing still while
 * the world moves.
 */
const CAMERA_SMOOTHING = 0.32;

/**
 * The same, for the direction it watches from.
 *
 * Slower on purpose. Position tracks a body and has to keep up; direction
 * only changes when the grip does, and snapping round to a new side mid-run
 * is disorienting in a way that trailing a throw is not.
 */
const VIEW_SMOOTHING = 0.6;

type ClockProps = {
  trick: Trick;
  speed: number;
  scrub: number | null;
  isPlaying: boolean;
  runToken: string;
  kenRef: React.RefObject<Group | null>;
  tamaRef: React.RefObject<Group | null>;
  timeRef: React.RefObject<number>;
};

/**
 * Drives both bodies from the trick's track.
 *
 * Both — that is the change. The ken used to be a fixed grip with an
 * optional position offset and the tama a position-only track, so a rotating
 * ken silently rendered as a still one. Position and orientation now come
 * from the same sampler for both, and orientation is slerped rather than
 * lerped component-wise on Euler angles.
 */
function TrickBodies({
  trick,
  speed,
  scrub,
  isPlaying,
  runToken,
  kenRef,
  tamaRef,
  timeRef,
}: ClockProps) {
  const elapsed = useRef(0);
  const lastRunToken = useRef(runToken);

  useFrame((_, delta) => {
    const ken = kenRef.current;
    const tama = tamaRef.current;
    if (!ken || !tama) return;

    // Restart detection lives here rather than in render: refs must not be
    // read or written during render, and the next frame is soon enough.
    if (lastRunToken.current !== runToken) {
      lastRunToken.current = runToken;
      elapsed.current = 0;
    }

    if (scrub === null && isPlaying) {
      elapsed.current = Math.min(elapsed.current + delta * speed, trick.durationSeconds);
    }

    const t = scrub === null ? elapsed.current : scrub * trick.durationSeconds;
    timeRef.current = t;
    sampleTrackInto(trick.samples, t, ken, tama);
  });

  return null;
}

type CameraRigProps = {
  trick: Trick;
  runToken: string;
  kenRef: React.RefObject<Group | null>;
  tamaRef: React.RefObject<Group | null>;
  timeRef: React.RefObject<number>;
  initial: Framing;
};

/**
 * Follows the action, reframing every frame and easing toward it.
 *
 * The Canvas `camera` prop only ever places the camera once and never aims
 * it, so both the position and the look-at are driven here.
 */
function CameraRig({ trick, runToken, kenRef, tamaRef, timeRef, initial }: CameraRigProps) {
  const camera = useThree((state) => state.camera);
  const target = useRef(new Vector3(...initial.target));
  const direction = useRef(new Vector3(...initial.position).sub(new Vector3(...initial.target)));
  const desiredPosition = useRef(new Vector3());
  const desiredTarget = useRef(new Vector3());
  const desiredDirection = useRef(new Vector3());
  const hasFramed = useRef(false);
  const lastRunToken = useRef(runToken);

  useFrame((_, delta) => {
    const ken = kenRef.current;
    const tama = tamaRef.current;
    if (!ken || !tama) return;

    // A new trick opens on a new shot rather than swinging round from the
    // old one, which is a cut, not a camera move.
    if (lastRunToken.current !== runToken) {
      lastRunToken.current = runToken;
      hasFramed.current = false;
    }

    // Framerate-independent exponential ease: the same fraction of the
    // remaining distance per unit time, whatever the frame length. The first
    // frame snaps instead — the opening shot should already be framed, and
    // only here is the real viewport aspect known.
    const snap = !hasFramed.current;
    hasFramed.current = true;

    desiredDirection.current.set(...sampleView(trick.views, timeRef.current)).normalize();
    direction.current.lerp(
      desiredDirection.current,
      snap ? 1 : 1 - Math.exp(-delta / VIEW_SMOOTHING),
    );

    const framing = frameSubjects(
      [tama.position.x, tama.position.y, tama.position.z],
      TAMA_LAYOUT.radius,
      [ken.position.x, ken.position.y, ken.position.z],
      CAMERA_FOV,
      [direction.current.x, direction.current.y, direction.current.z],
      'aspect' in camera ? (camera.aspect as number) : 1,
    );

    desiredPosition.current.set(...framing.position);
    desiredTarget.current.set(...framing.target);

    const alpha = snap ? 1 : 1 - Math.exp(-delta / CAMERA_SMOOTHING);
    camera.position.lerp(desiredPosition.current, alpha);
    target.current.lerp(desiredTarget.current, alpha);
    camera.lookAt(target.current);
  });

  return null;
}

/**
 * Composes the two posed bodies and a dynamic string inside a Canvas.
 * Playback state lives here; visualization components below only read
 * refs/props, no shared store needed at this scale.
 */
export function TrickScene({
  trick,
  speed = 1,
  scrub = null,
  children,
  canvasExtras,
  followAction = true,
}: TrickSceneProps) {
  const kenRef = useRef<Group>(null);
  const tamaRef = useRef<Group>(null);
  const timeRef = useRef(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [playToken, setPlayToken] = useState(0);

  /**
   * Identifies one playthrough, so switching tricks restarts the clock, the
   * rope and the shot without remounting anything.
   *
   * Remounting would be the obvious way to reset all three, and it costs the
   * WebGL context: a keyed `<Canvas>` tears down its renderer and the scene
   * comes back blank. Everything resettable therefore watches this token
   * inside `useFrame` instead.
   */
  const runToken = `${trick.id}#${playToken}`;

  // Opens on the trick's first sample, so the shot starts correctly framed
  // instead of easing in from wherever the camera happened to be placed.
  const framing = useMemo(() => {
    const first = trick.samples[0];
    return frameSubjects(
      first.tama.position,
      TAMA_LAYOUT.radius,
      first.ken.position,
      CAMERA_FOV,
      sampleView(trick.views, 0),
    );
  }, [trick]);

  const replay = () => {
    setPlayToken((token) => token + 1);
    setIsPlaying(true);
  };

  return (
    <>
      <Canvas camera={{ position: [...framing.position], fov: CAMERA_FOV }}>
        <TrickBodies
          trick={trick}
          speed={speed}
          scrub={scrub}
          isPlaying={isPlaying}
          runToken={runToken}
          kenRef={kenRef}
          tamaRef={tamaRef}
          timeRef={timeRef}
        />
        {followAction ? (
          <CameraRig
            trick={trick}
            runToken={runToken}
            kenRef={kenRef}
            tamaRef={tamaRef}
            timeRef={timeRef}
            initial={framing}
          />
        ) : null}
        {/*
          Three lights rather than one. A single key against heavy ambient
          flattens a turned object into a silhouette — the beads, the rim of
          a cup and the taper of the grip are all read from the way the
          shading falls across them, and there was not enough of it before.
        */}
        <ambientLight intensity={0.32} />
        <directionalLight position={[3, 4.5, 2.5]} intensity={1.15} />
        {/* Cool fill from the opposite side, to keep shadows from going flat black. */}
        <directionalLight position={[-3.5, 1, -2]} intensity={0.4} color="#cddcf0" />
        {/* Low back light, so the model separates from a dark background. */}
        <directionalLight position={[0, -2, -3]} intensity={0.28} color="#ffd9a8" />
        <group ref={kenRef}>
          <Ken />
        </group>
        <group ref={tamaRef}>
          <Tama />
        </group>
        <KendamaString kenRef={kenRef} tamaRef={tamaRef} runToken={runToken} />
        {canvasExtras?.(framing)}
      </Canvas>
      {children?.({ isPlaying, replay, durationSeconds: trick.durationSeconds })}
    </>
  );
}
