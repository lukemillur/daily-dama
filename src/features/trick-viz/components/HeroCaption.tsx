import { Text } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { useRef } from 'react';
import { Group, Vector3 } from 'three';

/**
 * "Daily Dama" rendered as 3D text inside the scene, for the decorative
 * looping hero (`LoopingHeroScene`).
 *
 * `CameraRig` reframes every frame from `frameSubjects`, driven only by
 * the ken/tama positions -- a caption placed at a fixed world position
 * would drift in and out of frame as that shot pans. Instead this reads
 * the live camera transform each frame and places itself at a fixed
 * offset in front of and below the camera, the same "3D HUD" technique a
 * cockpit readout uses. `CameraRig`/`frameSubjects` stay untouched.
 */

/** Camera-local offset: forward (−Z) and down (−Y). */
const CAPTION_OFFSET = new Vector3(0, -0.72, -2.4);
const CAPTION_FONT_SIZE = 0.32;
const CAPTION_FONT_URL = '/fonts/SplineSans-Bold.ttf';
const CAPTION_TEXT = 'Daily Dama';

export function HeroCaption() {
  const camera = useThree((state) => state.camera);
  const groupRef = useRef<Group>(null);
  const worldPosition = useRef(new Vector3());

  useFrame(() => {
    const group = groupRef.current;
    if (!group) return;
    worldPosition.current.copy(CAPTION_OFFSET).applyQuaternion(camera.quaternion);
    worldPosition.current.add(camera.position);
    group.position.copy(worldPosition.current);
    group.quaternion.copy(camera.quaternion);
  });

  return (
    <group ref={groupRef}>
      <Text
        font={CAPTION_FONT_URL}
        fontSize={CAPTION_FONT_SIZE}
        color="#fbf2df"
        anchorX="center"
        anchorY="middle"
        outlineWidth={0.014}
        outlineColor="#241a0f"
      >
        {CAPTION_TEXT}
      </Text>
    </group>
  );
}
