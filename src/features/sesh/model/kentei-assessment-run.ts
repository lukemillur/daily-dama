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
