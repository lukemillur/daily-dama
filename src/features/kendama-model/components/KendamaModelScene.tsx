import { ContactShadows, Environment, Lightformer, OrbitControls } from '@react-three/drei';
import { Canvas } from '@react-three/fiber';

import { MM, toRenderUnits, viewLayout, type ModelView } from '../model/views';
import { KenModel, TamaModel } from './KendamaParts';

type KendamaModelSceneProps = {
  view: ModelView;
  autoRotate?: boolean;
  tamaColor?: string;
};

const BACKGROUND = '#efe9df';

/**
 * A studio turntable for inspecting the kendama model on its own, outside
 * any trick.
 *
 * The environment is built from drei `Lightformer`s rather than a loaded
 * HDRI, which keeps the scene procedural and still gives lacquer and wood a
 * reflection to show their sheen in. A plain `meshStandardMaterial` with no
 * environment reflects nothing and reads as matte plastic.
 */
export function KendamaModelScene({ view, autoRotate = false, tamaColor }: KendamaModelSceneProps) {
  const layout = viewLayout(view);
  const ken = layout.ken;
  const tama = layout.tama;

  return (
    <Canvas camera={{ position: [1.9, 1.7, 3.2], fov: 32 }} dpr={[1, 2]}>
      <color attach="background" args={[BACKGROUND]} />
      <ambientLight intensity={0.15} />
      <directionalLight position={[2.5, 4, 3]} intensity={1.6} />
      <directionalLight position={[-3, 1.5, -2]} intensity={0.35} color="#d6e2f2" />

      <Environment resolution={256} frames={1}>
        {/* Softbox overhead, strip lights either side, warm bounce from the floor. */}
        <Lightformer form="rect" intensity={2.2} position={[0, 5, 1]} rotation-x={Math.PI / 2} scale={[6, 3, 1]} />
        <Lightformer form="rect" intensity={1.4} position={[-4, 1.5, 1]} rotation-y={Math.PI / 2} scale={[1, 5, 1]} />
        <Lightformer form="rect" intensity={1} position={[4, 1.5, -1]} rotation-y={-Math.PI / 2} scale={[1, 5, 1]} />
        <Lightformer form="rect" intensity={0.4} color="#f3d9b5" position={[0, -3, 0]} rotation-x={-Math.PI / 2} scale={[8, 8, 1]} />
      </Environment>

      <group position={toRenderUnits(ken.position)} rotation={ken.rotation} scale={MM}>
        <KenModel />
      </group>
      <group position={toRenderUnits(tama.position)} rotation={tama.rotation} scale={MM}>
        <TamaModel color={tamaColor} />
      </group>

      <ContactShadows
        position={[0, layout.floorY * MM - 0.002, 0]}
        opacity={0.45}
        scale={5}
        blur={2.4}
        far={1.2}
        resolution={512}
        color="#3b2a1a"
      />

      <OrbitControls
        makeDefault
        target={toRenderUnits(layout.target)}
        autoRotate={autoRotate}
        autoRotateSpeed={1.2}
        enableDamping
        minDistance={0.6}
        maxDistance={8}
      />
    </Canvas>
  );
}
