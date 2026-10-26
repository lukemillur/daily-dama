import { Vector2 } from 'three';

import {
  cupSeatOffset,
  sampleProfile,
  SARADO,
  spikedMouthRestHeight,
  TAMA_MOUTH_HEIGHT,
  type ProfilePiece,
} from './anatomy';

export type Vec3 = readonly [number, number, number];

/** Position in mm and XYZ Euler rotation in radians, in world space. */
export type PartPose = { position: Vec3; rotation: Vec3 };

export type ModelView = 'spike' | 'bigCup' | 'smallCup' | 'apart';

export type ViewLayout = {
  ken: PartPose;
  tama: PartPose;
  /** World height of the floor the contact shadow is cast on. */
  floorY: number;
  /** Where the orbit camera looks. */
  target: Vec3;
};

/** Rendered units per millimetre: the whole kendama is about 1.6 units tall. */
export const MM = 0.01;

export const MODEL_VIEWS: readonly { id: ModelView; label: string }[] = [
  { id: 'spike', label: 'On spike' },
  { id: 'bigCup', label: 'Big cup' },
  { id: 'smallCup', label: 'Small cup' },
  { id: 'apart', label: 'Apart' },
];

/**
 * Static arrangements for inspecting the model. Every resting position is
 * derived from the anatomy (rim seats, the spiked tama's rest on the
 * sarado), so a wrong dimension shows up as a visibly wrong rest rather than
 * being hidden by a hand-placed number.
 */
export function viewLayout(view: ModelView): ViewLayout {
  const { bigCup, smallCup, heightOnHandle } = SARADO;

  switch (view) {
    case 'spike':
      return {
        ken: { position: [0, 0, 0], rotation: [0, 0, 0] },
        tama: {
          position: [0, heightOnHandle + spikedMouthRestHeight() - TAMA_MOUTH_HEIGHT, 0],
          rotation: [0, 0, 0],
        },
        floorY: 0,
        target: [0, 95, 0],
      };
    case 'bigCup':
      // Rolled so the big cup (local +X) faces up, then slid so its rim is
      // over the origin. The handle then lies along X, base cup toward +X,
      // and the small cup's rim is the lowest point.
      return {
        ken: { position: [heightOnHandle, 0, 0], rotation: [0, 0, Math.PI / 2] },
        tama: { position: [0, bigCup.rimHeight + cupSeatOffset(bigCup), 0], rotation: [0, 0, 0] },
        floorY: smallCup.rimHeight,
        target: [25, 10, 0],
      };
    case 'smallCup':
      return {
        ken: { position: [-heightOnHandle, 0, 0], rotation: [0, 0, -Math.PI / 2] },
        tama: {
          position: [0, -smallCup.rimHeight + cupSeatOffset(smallCup), 0],
          rotation: [0, 0, 0],
        },
        floorY: -bigCup.rimHeight,
        target: [-25, 10, 0],
      };
    case 'apart':
      // The tama rests on the floor beside the ken, tipped so its bore and
      // bevel face the camera.
      return {
        ken: { position: [0, 0, 0], rotation: [0, 0, 0] },
        tama: { position: [80, 30, 15], rotation: [-1, 0, 0] },
        floorY: 0,
        target: [35, 70, 0],
      };
  }
}

export function toRenderUnits(point: Vec3): [number, number, number] {
  return [point[0] * MM, point[1] * MM, point[2] * MM];
}

/** A profile as the `Vector2[]` that `LatheGeometry` takes. */
export function lathePoints(pieces: readonly ProfilePiece[]): Vector2[] {
  return sampleProfile(pieces).map(([r, h]) => new Vector2(r, h));
}
