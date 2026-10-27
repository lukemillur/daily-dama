import { cupSeatOffset, HANDLE, SARADO, TAMA } from './anatomy';
import type { CatchTrick } from './catch-trick';
import { spikedTamaRestHeight } from './collision';

/** Into the big cup, held cup-up in the big-cup grip. */
export const BIG_CUP: CatchTrick = {
  name: 'Big Cup',
  grip: 'big-cup',
  catchAxis: [1, 0, 0],
  seatHeight: SARADO.bigCup.rimHeight + cupSeatOffset(SARADO.bigCup),
  kenTop: SARADO.bigCup.rimHeight,
  apexClearance: 110,
  alignRoom: 1.2,
  followsHole: false,
  intercept: 'cubic',
};

/** Onto the spike, held spike-up: the ball comes down hole-first and slides home. */
export const SPIKE: CatchTrick = {
  name: 'Spike',
  grip: 'spike-up',
  catchAxis: [0, 1, 0],
  seatHeight: spikedTamaRestHeight(),
  kenTop: HANDLE.height - SARADO.heightOnHandle,
  // The spike stands higher than the cup, so the ball is lifted less far
  // above it, or the string, wrapped over the ball to its string hole,
  // runs out.
  apexClearance: 50,
  alignRoom: 4,
  followsHole: true,
  intercept: 'cubic',
};

/**
 * Onto the base cup, the shallow dish at the bottom of the handle. The pull
 * starts spike up and the wrist turns the ken over as the ball climbs, so
 * it is spike down, base cup up, by the time the ball peaks.
 */
export const BASE_CUP: CatchTrick = {
  name: 'Base Cup',
  grip: 'spike-down',
  catchAxis: [0, -1, 0],
  // The dish's mouth is at the handle's end, and the ball sits on its rim.
  seatHeight: SARADO.heightOnHandle + Math.sqrt(TAMA.radius ** 2 - HANDLE.baseCup.mouthRadius ** 2),
  kenTop: SARADO.heightOnHandle,
  // Higher than Big Cup's: the ball must climb past a ken whose top is
  // 105 mm up, and the hand needs the time to come back under it.
  apexClearance: 135,
  alignRoom: 0.6,
  followsHole: false,
  intercept: 'dive',
  // The same turn that makes the spike-down grip from the spike-up one.
  riseTurn: { from: 'spike-up', axis: [1, 0, 0], angle: -Math.PI },
};

/** A named run of tricks from a hanging ball, each leading on from the last. */
export type Routine = { name: string; tricks: readonly [CatchTrick, ...CatchTrick[]] };

export const ROUTINES = {
  'big-cup': { name: 'Big Cup', tricks: [BIG_CUP] },
  spike: { name: 'Spike', tricks: [SPIKE] },
  'base-cup': { name: 'Base Cup', tricks: [BASE_CUP] },
  // The turn from one grip to the other pivots about the sarado's centre,
  // which carries the spike up under the cup's seat: a ball popped straight
  // up out of the cup comes down onto it, hole first if it sat hole down.
  'big-cup-to-spike': { name: 'Big Cup to Spike', tricks: [BIG_CUP, SPIKE] },
} as const satisfies Record<string, Routine>;

export type RoutineId = keyof typeof ROUTINES;
