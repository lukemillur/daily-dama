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

export const TRICKS = { 'big-cup': BIG_CUP, spike: SPIKE } as const;
export type TrickId = keyof typeof TRICKS;
