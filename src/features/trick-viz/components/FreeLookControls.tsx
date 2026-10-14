import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

import type { Vec3 } from '../model/body';

/**
 * Minimal orbit camera for the dev sandbox's free-look mode.
 *
 * Uses three's own addon by its public subpath rather than drei's wrapper:
 * drei's version imports the `three-stdlib` barrel, and Metro does not
 * tree-shake it, so that one import added every loader, exporter, and parser
 * three-stdlib ships (~2.4 MB minified) to whichever bundle chunk contains
 * the scene -- including the landing hero's.
 */
export function FreeLookControls({ target }: { readonly target: Vec3 }) {
  const camera = useThree((state) => state.camera);
  const domElement = useThree((state) => state.gl.domElement);
  // Owned by the effect rather than memoized: the controls are a mutable
  // three.js object, and the compiler's lint forbids mutating hook values.
  const controlsRef = useRef<OrbitControls | null>(null);

  // Destructured so a new-but-equal tuple from the parent's render does not
  // rebuild the controls and snap the orbit back mid-interaction.
  const [x, y, z] = target;
  useEffect(() => {
    const controls = new OrbitControls(camera, domElement);
    controls.enableDamping = true;
    controls.target.set(x, y, z);
    controlsRef.current = controls;
    return () => {
      controls.dispose();
      controlsRef.current = null;
    };
  }, [camera, domElement, x, y, z]);

  // Runs before the scene's own frame callbacks, matching drei's priority.
  useFrame(() => {
    controlsRef.current?.update();
  }, -1);

  return null;
}
