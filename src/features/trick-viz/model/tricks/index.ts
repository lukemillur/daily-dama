import type { Trick } from '../timeline';
import { airplane } from './airplane';
import { bigCup, smallCup } from './cupCatches';
import { pullUpSpikeNoSpin, pullUpSpikeWithSpin } from './pullUpSpike';

/**
 * Every trick that has a visualization, keyed by the same IDs the app's
 * Kentei data generates.
 *
 * Reusing `KENDAMA_KENTEI_TRICKS`' ID scheme rather than inventing a
 * parallel one means wiring these into the Tricks UI later is a lookup, not
 * a mapping table — and a trick with no visualization yet is simply a miss.
 */
export const TRICK_VISUALIZATIONS: readonly Trick[] = [
  bigCup,
  smallCup,
  pullUpSpikeNoSpin,
  pullUpSpikeWithSpin,
  airplane,
];

const byId = new Map(TRICK_VISUALIZATIONS.map((trick) => [trick.id, trick]));

export function findTrickVisualization(trickId: string): Trick | undefined {
  return byId.get(trickId);
}

export { airplane, bigCup, pullUpSpikeNoSpin, pullUpSpikeWithSpin, smallCup };
