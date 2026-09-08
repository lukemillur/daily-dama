import type { TrickSummary } from '@/features/tricks/model/trick';

/**
 * Which subset of the Kentei rank ladder an assessment run should cover, and
 * in what order. This is distinct from the self-declared placement quiz in
 * `src/features/onboarding/model/kentei-assessment.ts` (a different feature
 * with a different reducer) — this drives a real, timed practice run through
 * `MultiTrickSesh`, not a one-time onboarding estimate.
 */
export type AssessmentFlow =
  | { readonly kind: 'fullBottomToTop' }
  | { readonly kind: 'fromRank'; readonly startingRank: number }
  | { readonly kind: 'currentRankOnly'; readonly rank: number };

/**
 * Builds the ordered trick list to hand to `MultiTrickSesh` for a given
 * assessment flow. Order follows `standardTricks`' own order (rank-ascending,
 * declaration order within a rank in `KENDAMA_KENTEI_TRICKS`) — this function
 * never reorders, only filters.
 */
export function selectAssessmentTricks(
  flow: AssessmentFlow,
  standardTricks: readonly TrickSummary[],
): readonly TrickSummary[] {
  switch (flow.kind) {
    case 'fullBottomToTop':
      return standardTricks;
    case 'fromRank':
      return standardTricks.filter((trick) => trick.kenteiRank >= flow.startingRank);
    case 'currentRankOnly':
      return standardTricks.filter((trick) => trick.kenteiRank === flow.rank);
  }
}

/**
 * The valid rank bounds for this assessment, derived from the trick data
 * itself rather than hardcoded — mirrors `selectPromotedKenteiRank`'s
 * convention in `trick-directory.ts`.
 */
export function selectAssessmentRankBounds(standardTricks: readonly TrickSummary[]): {
  readonly minRank: number;
  readonly maxRank: number;
} {
  const ranks = standardTricks.map((trick) => trick.kenteiRank);
  return { minRank: Math.min(...ranks), maxRank: Math.max(...ranks) };
}

/**
 * The index of the first trick belonging to the next rank after
 * `tricks[fromIndex]`'s rank — i.e. where a "skip this rank" action during
 * an assessment run should land. Relies on the invariant (guaranteed by
 * `selectAssessmentTricks`, itself derived from `standardTricks`' own
 * declaration order) that ranks appear in ascending order, so this only
 * needs to scan forward for the first strictly-greater rank rather than
 * re-sorting or grouping.
 *
 * Returns `tricks.length` (i.e. "assessment finished") once there's no
 * higher rank left to skip to, including when `fromIndex` is already past
 * the end of the list.
 */
export function selectNextRankStartIndex(
  tricks: readonly TrickSummary[],
  fromIndex: number,
): number {
  if (fromIndex >= tricks.length) return tricks.length;
  const currentRank = tricks[fromIndex].kenteiRank;
  const nextIndex = tricks.findIndex((trick, index) => index > fromIndex && trick.kenteiRank > currentRank);
  return nextIndex === -1 ? tricks.length : nextIndex;
}

/**
 * Copy for the assessment wrap-up screen, given the rank the profile had
 * when the run started and the rank it has now (after any auto-promotion
 * from practice recorded during the run). Because the underlying rank model
 * is promotion-only (see selectPromotedKenteiRank in trick-directory.ts),
 * `resultRank` can never be lower than `startingRank` — this only has to
 * distinguish "advanced" from "held," never handle a regression case.
 */
export function selectAssessmentResultCopy(
  startingRank: number | undefined,
  resultRank: number | undefined,
): string {
  if (resultRank === undefined) {
    return 'Keep practicing — you have not earned a rank yet.';
  }
  if (startingRank === undefined || resultRank > startingRank) {
    return `Rank up! You're now Rank ${resultRank}.`;
  }
  return `You held Rank ${resultRank}. Land every trick in a rank to advance.`;
}

/**
 * Whether this run started at a rank strictly above the profile's own
 * stored rank at the time — i.e. an out-of-order `fromRank` start that
 * skips the user's current frontier rank (and, structurally, everything
 * below it). `fullBottomToTop` always starts at the true bottom and
 * `currentRankOnly` always pins `rank` to the stored rank, so neither can
 * ever be out-of-order this way. Starting a `fromRank` run exactly at the
 * stored rank (a re-test) is not out-of-order.
 */
export function selectStartedAboveStoredRank(
  flow: AssessmentFlow,
  startingKenteiRank: number | undefined,
  minRank: number,
): boolean {
  if (flow.kind !== 'fromRank') return false;
  return flow.startingRank > (startingKenteiRank ?? minRank);
}

/**
 * Explanatory copy for the wrap-up screen when an out-of-order run (started
 * above the stored rank via "Start from a rank", or one where a rank was
 * skipped mid-run) did not result in a promotion. Returns `undefined` when
 * the run wasn't out-of-order, or when it was but still promoted anyway —
 * in both of those cases the existing `selectAssessmentResultCopy` message
 * is sufficient on its own.
 */
export function selectAssessmentGapNotice(
  startingRank: number | undefined,
  resultRank: number | undefined,
  wasOutOfOrder: boolean,
): string | undefined {
  if (!wasOutOfOrder) return undefined;
  const promoted =
    resultRank !== undefined && (startingRank === undefined || resultRank > startingRank);
  if (promoted) return undefined;
  return 'Promotion needs every rank cleared in order — go back and clear the earlier or skipped ranks to unlock it.';
}
