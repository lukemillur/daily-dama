import { ContactShadows, Environment, Lightformer, OrbitControls } from '@react-three/drei';
import { Canvas, useFrame, type ThreeEvent } from '@react-three/fiber';
import { useRef, useState } from 'react';
import { Group, Mesh, Plane, Quaternion, TubeGeometry, Vector3 } from 'three';

import { advanceTrickRun, createTrickRun, type CatchPhase, type TrickRun } from '../model/catch-trick';
import { createStringSim, stepStringSim, type StringSim } from '../model/string-sim';
import { GRIP_QUATERNIONS, gripPose, STRING_RADIUS, type Grip, type Handedness } from '../model/stringing';
import {
  dragTurn,
  DROP_TAMA_CENTRE,
  followHand,
  followOrientation,
  stringCurve,
  type StrungLayout,
} from '../model/strung-render';
import { TRICKS } from '../model/tricks';
import { MM } from '../model/views';
import { KenModel, TamaModel } from './KendamaParts';

type StrungKendamaSceneProps = {
  handedness: Handedness;
  layout: StrungLayout;
  /** How the hand holds the ken. Changing it turns the ken without a restart. */
  grip: Grip;
  /** Changes to restart the simulation from `layout`. */
  runToken: string;
  slowMotion?: boolean;
  /** Reports each phase change while a trick attempt runs. */
  onTrickPhase?: (phase: CatchPhase['kind']) => void;
};

const BACKGROUND = '#efe9df';
/**
 * Behind the player's right shoulder, looking where they look, and far
 * enough back to keep both the hanging ball and a Big Cup's flight above
 * the hand in frame.
 */
const CAMERA_POSITION = [2.9, 1.9, 13.6] as const;
const CAMERA_TARGET = [-0.2, -0.6, 0] as const;
/** Below the hanging ball, so its shadow grounds the scene. */
const FLOOR_Y = -4.4;

type RigProps = StrungKendamaSceneProps & {
  onDragChange: (dragging: boolean) => void;
};

/**
 * Owns the simulation and writes it into the scene every frame. The sim
 * lives in a ref, not React state: it changes 480 times a second and nothing
 * outside this frame loop needs to re-render when it does.
 */
function StrungRig({
  handedness,
  layout,
  grip,
  runToken,
  slowMotion = false,
  onTrickPhase,
  onDragChange,
}: RigProps) {
  const kenRef = useRef<Group>(null);
  const tamaRef = useRef<Group>(null);
  const stringRef = useRef<Mesh>(null);
  const simRef = useRef<StringSim | null>(null);
  /** Set while a trick drives the hand; the pointer then has no say. */
  const trickRef = useRef<TrickRun | null>(null);
  const lastPhase = useRef<CatchPhase['kind'] | null>(null);
  const lastRunToken = useRef<string | null>(null);

  // The hand, in mm. `handTarget` follows the pointer; `hand` trails it.
  const hand = useRef(new Vector3());
  const handTarget = useRef(new Vector3());
  const dragPlane = useRef(new Plane());
  const grabOffset = useRef(new Vector3());
  const hit = useRef(new Vector3());

  // The wrist. `orientationTarget` follows a tilt drag or a grip change;
  // `orientation` trails it.
  const orientation = useRef(new Quaternion());
  const orientationTarget = useRef(new Quaternion());
  const lastGrip = useRef<Grip | null>(null);
  const turning = useRef(false);
  const turnStart = useRef({ x: 0, y: 0, orientation: new Quaternion() });

  useFrame((_, frameDelta) => {
    const ken = kenRef.current;
    const tama = tamaRef.current;
    const string = stringRef.current;
    if (!ken || !tama || !string) return;

    // Restarts happen here rather than in render: refs must not be touched
    // during render, and keying the Canvas would lose the WebGL context.
    if (lastRunToken.current !== runToken || !simRef.current) {
      lastRunToken.current = runToken;
      hand.current.set(0, 0, 0);
      handTarget.current.set(0, 0, 0);
      orientation.current.set(...GRIP_QUATERNIONS[grip]);
      orientationTarget.current.copy(orientation.current);
      lastGrip.current = grip;
      lastPhase.current = null;
      if (layout !== 'hanging' && layout !== 'drop') {
        trickRef.current = createTrickRun(TRICKS[layout], handedness);
        simRef.current = trickRef.current.sim;
      } else {
        trickRef.current = null;
        simRef.current = createStringSim(
          handedness,
          gripPose([0, 0, 0], GRIP_QUATERNIONS[grip]),
          layout === 'drop' ? { kind: 'held', tamaCentre: DROP_TAMA_CENTRE } : { kind: 'hanging' },
        );
      }
    }

    // A long frame (tab in the background) should not fling everything.
    const delta = Math.min(frameDelta, 1 / 20) * (slowMotion ? 0.25 : 1);
    const sim = simRef.current;
    const trick = trickRef.current;
    if (lastGrip.current !== grip) {
      lastGrip.current = grip;
      orientationTarget.current.set(...GRIP_QUATERNIONS[grip]);
    }
    if (trick) {
      advanceTrickRun(trick, delta);
      const [x, y, z] = trick.attempt.hand.position;
      hand.current.set(x, y, z);
      handTarget.current.copy(hand.current);
      orientation.current.set(...trick.attempt.hand.orientation);
      orientationTarget.current.copy(orientation.current);
      if (trick.attempt.phase.kind !== lastPhase.current) {
        lastPhase.current = trick.attempt.phase.kind;
        onTrickPhase?.(lastPhase.current);
      }
    } else {
      followHand(hand.current, handTarget.current, delta);
      followOrientation(orientation.current, orientationTarget.current, delta);
      const q = orientation.current;
      stepStringSim(sim, gripPose([hand.current.x, hand.current.y, hand.current.z], [q.x, q.y, q.z, q.w]), delta);
    }

    ken.position.set(sim.kenPosition[0] * MM, sim.kenPosition[1] * MM, sim.kenPosition[2] * MM);
    ken.quaternion.set(sim.kenQuaternion[0], sim.kenQuaternion[1], sim.kenQuaternion[2], sim.kenQuaternion[3]);
    tama.position.set(sim.tamaPosition[0] * MM, sim.tamaPosition[1] * MM, sim.tamaPosition[2] * MM);
    tama.quaternion.set(
      sim.tamaQuaternion[0],
      sim.tamaQuaternion[1],
      sim.tamaQuaternion[2],
      sim.tamaQuaternion[3],
    );

    const next = new TubeGeometry(stringCurve(sim), 160, STRING_RADIUS * MM, 6, false);
    string.geometry.dispose();
    string.geometry = next;
  });

  const startDrag = (event: ThreeEvent<PointerEvent>) => {
    if (trickRef.current) return;
    event.stopPropagation();
    (event.target as Element).setPointerCapture(event.pointerId);
    onDragChange(true);

    // Shift-drag turns the wrist instead of moving the hand.
    turning.current = event.nativeEvent.shiftKey;
    if (turning.current) {
      turnStart.current.x = event.nativeEvent.clientX;
      turnStart.current.y = event.nativeEvent.clientY;
      turnStart.current.orientation.copy(orientationTarget.current);
      return;
    }

    // Drag in the plane facing the camera through the hand, so the ken
    // moves under the pointer whichever way the view is orbited.
    const facing = new Vector3();
    event.camera.getWorldDirection(facing);
    const handScene = hand.current.clone().multiplyScalar(MM);
    dragPlane.current.setFromNormalAndCoplanarPoint(facing, handScene);
    if (event.ray.intersectPlane(dragPlane.current, hit.current)) {
      grabOffset.current.copy(handScene).sub(hit.current);
    }
  };

  const moveDrag = (event: ThreeEvent<PointerEvent>) => {
    if (!(event.target as Element).hasPointerCapture(event.pointerId)) return;
    if (turning.current) {
      const cameraRight = new Vector3(1, 0, 0).applyQuaternion(event.camera.quaternion);
      dragTurn(
        turnStart.current.orientation,
        event.nativeEvent.clientX - turnStart.current.x,
        event.nativeEvent.clientY - turnStart.current.y,
        cameraRight,
        orientationTarget.current,
      );
      return;
    }
    if (event.ray.intersectPlane(dragPlane.current, hit.current)) {
      handTarget.current.copy(hit.current).add(grabOffset.current).divideScalar(MM);
    }
  };

  const endDrag = (event: ThreeEvent<PointerEvent>) => {
    (event.target as Element).releasePointerCapture(event.pointerId);
    onDragChange(false);
  };

  return (
    <>
      <group
        ref={kenRef}
        onPointerDown={startDrag}
        onPointerMove={moveDrag}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <group scale={MM}>
          <KenModel />
        </group>
      </group>
      <group ref={tamaRef}>
        <group scale={MM}>
          <TamaModel />
        </group>
      </group>
      <mesh ref={stringRef}>
        <meshStandardMaterial color="#efe8da" roughness={0.9} />
      </mesh>
    </>
  );
}

/**
 * The kendama strung and held in the big-cup grip, with the string and the
 * tama simulated. Drag the ken to move the hand; everything else follows
 * from the physics.
 */
export function StrungKendamaScene(props: StrungKendamaSceneProps) {
  const [dragging, setDragging] = useState(false);

  return (
    <Canvas camera={{ position: [...CAMERA_POSITION], fov: 32 }} dpr={[1, 2]}>
      <color attach="background" args={[BACKGROUND]} />
      <ambientLight intensity={0.15} />
      <directionalLight position={[2.5, 4, 3]} intensity={1.6} />
      <directionalLight position={[-3, 1.5, -2]} intensity={0.35} color="#d6e2f2" />

      <Environment resolution={256} frames={1}>
        <Lightformer form="rect" intensity={2.2} position={[0, 5, 1]} rotation-x={Math.PI / 2} scale={[6, 3, 1]} />
        <Lightformer form="rect" intensity={1.4} position={[-4, 1.5, 1]} rotation-y={Math.PI / 2} scale={[1, 5, 1]} />
        <Lightformer form="rect" intensity={1} position={[4, 1.5, -1]} rotation-y={-Math.PI / 2} scale={[1, 5, 1]} />
      </Environment>

      <StrungRig {...props} onDragChange={setDragging} />

      <ContactShadows
        position={[0, FLOOR_Y, 0]}
        opacity={0.35}
        scale={6}
        blur={2.6}
        far={2}
        resolution={512}
        color="#3b2a1a"
      />

      <OrbitControls
        makeDefault
        enabled={!dragging}
        target={[...CAMERA_TARGET]}
        enableDamping
        minDistance={1}
        maxDistance={14}
      />
    </Canvas>
  );
}
