import { ContactShadows, Environment, Lightformer, OrbitControls } from '@react-three/drei';
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { useRef, useState } from 'react';
import { Group, Mesh, Plane, Quaternion, Vector3 } from 'three';

import { advanceAirplaneRun, createAirplaneRun, type AirplaneRun } from '../model/airplane';
import {
  advanceTrickRun,
  createSeatedRun,
  createTrickRun,
  currentTrick,
  type CatchPhase,
  type TrickRun,
} from '../model/catch-trick';
import { createStringSim, stepStringSim, stringPoints, type StringSim } from '../model/string-sim';
import { GRIP_QUATERNIONS, gripPose, TAMA_HOLE_UP_QUATERNION, type Grip, type Handedness } from '../model/stringing';
import {
  applyFraming,
  dragTurn,
  DROP_TAMA_CENTRE,
  framingFor,
  HELD_KEN_FRAMING,
  followHand,
  followOrientation,
  placeBodies,
  replaceString,
  stringCurve,
  type Framing,
  type StrungLayout,
} from '../model/strung-render';
import { tamaHeldStringPoints } from '../model/tama-held-sim';
import { BASE_CUP, ROUTINES, SPIKE } from '../model/tricks';
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
  /** Reports each phase change while a routine runs, with the trick it belongs to. */
  onTrickPhase?: (trick: string, phase: CatchPhase['kind']) => void;
};

const BACKGROUND = '#efe9df';
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
  /** Set while Airplane runs: the hand holds the tama, so it has its own simulation. */
  const airplaneRef = useRef<AirplaneRun | null>(null);
  const lastPhase = useRef<string | null>(null);
  const lastRunToken = useRef<string | null>(null);
  const lastFraming = useRef<Framing | null>(null);
  const camera = useThree((state) => state.camera);
  const controls = useThree((state) => state.controls);

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
    if (lastRunToken.current !== runToken || (!simRef.current && !airplaneRef.current)) {
      lastRunToken.current = runToken;
      hand.current.set(0, 0, 0);
      handTarget.current.set(0, 0, 0);
      orientation.current.set(...GRIP_QUATERNIONS[grip]);
      orientationTarget.current.copy(orientation.current);
      lastGrip.current = grip;
      lastPhase.current = null;
      airplaneRef.current = null;

      if (layout === 'airplane') {
        trickRef.current = null;
        simRef.current = null;
        airplaneRef.current = createAirplaneRun(handedness);
      } else if (layout === 'hole-up-to-spike') {
        trickRef.current = createSeatedRun([BASE_CUP, SPIKE], handedness, TAMA_HOLE_UP_QUATERNION);
        simRef.current = trickRef.current.sim;
      } else if (layout !== 'hanging' && layout !== 'drop') {
        trickRef.current = createTrickRun(ROUTINES[layout].tricks, handedness);
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

    // The framing changes only between kinds of trick, so an orbit the
    // viewer chose survives rerunning the same one. This owns the orbit's
    // centre; the controls take none of their own.
    const framing = framingFor(layout);
    if (framing !== lastFraming.current && applyFraming(camera, controls, framing)) {
      lastFraming.current = framing;
    }

    // A long frame (tab in the background) should not fling everything.
    const delta = Math.min(frameDelta, 1 / 20) * (slowMotion ? 0.25 : 1);
    const airplane = airplaneRef.current;
    if (airplane) {
      advanceAirplaneRun(airplane, delta);
      const phase = airplane.attempt.phase.kind;
      if (phase !== lastPhase.current) {
        lastPhase.current = phase;
        onTrickPhase?.('Airplane', phase);
      }
      placeBodies(ken, tama, airplane.sim);
      replaceString(string, stringCurve(airplane.sim, tamaHeldStringPoints(airplane.sim)));
      return;
    }

    const sim = simRef.current;
    if (!sim) return;
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
      const { name } = currentTrick(trick);
      const phase = trick.attempt.phase.kind;
      if (`${trick.step}:${phase}` !== lastPhase.current) {
        lastPhase.current = `${trick.step}:${phase}`;
        onTrickPhase?.(name, phase);
      }
    } else {
      followHand(hand.current, handTarget.current, delta);
      followOrientation(orientation.current, orientationTarget.current, delta);
      const q = orientation.current;
      stepStringSim(sim, gripPose([hand.current.x, hand.current.y, hand.current.z], [q.x, q.y, q.z, q.w]), delta);
    }

    placeBodies(ken, tama, sim);
    replaceString(string, stringCurve(sim, stringPoints(sim)));
  });

  const startDrag = (event: ThreeEvent<PointerEvent>) => {
    if (trickRef.current || airplaneRef.current) return;
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
    <Canvas camera={{ position: [...HELD_KEN_FRAMING.position], fov: 32 }} dpr={[1, 2]}>
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
        enableDamping
        minDistance={1}
        maxDistance={26}
      />
    </Canvas>
  );
}
