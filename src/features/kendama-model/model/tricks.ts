import { cupSeatOffset, HANDLE, SARADO } from './anatomy';
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
};

/** A named run of tricks from a hanging ball, each leading on from the last. */
export type Routine = { name: string; tricks: readonly [CatchTrick, ...CatchTrick[]] };

export const ROUTINES = {
  'big-cup': { name: 'Big Cup', tricks: [BIG_CUP] },
  spike: { name: 'Spike', tricks: [SPIKE] },
  // The turn from one grip to the other pivots about the sarado's centre,
  // which carries the spike up under the cup's seat: a ball popped straight
  // up out of the cup comes down onto it, hole first if it sat hole down.
  'big-cup-to-spike': { name: 'Big Cup to Spike', tricks: [BIG_CUP, SPIKE] },
} as const satisfies Record<string, Routine>;

export type RoutineId = keyof typeof ROUTINES;
