import { useEffect, useMemo, useState } from 'react';

import { RankUpCelebrationModal } from '@/features/profile/components/rank-up-celebration-modal';
import { useUserProfile, useUserProfileActions } from '@/features/profile/state/user-profile-provider';
import { usePracticeHistory } from '@/features/stats/state/practice-history-provider';
import { KENDAMA_KENTEI_TRICKS } from '@/features/tricks/data/kendama-kentei-tricks';
import {
  selectEffectiveUnlockedTrickIds,
  selectLacedCountByTrickId,
  selectPromotedKenteiRank,
} from '@/features/tricks/model/trick-directory';

// Non-rendering wiring: reacts to practice-history and manual-unlock changes and silently
// advances the profile's assessed Kentei rank whenever every standard trick in the current rank
// has been laced, by either practice history or manual marking. Must render as a child of both
// UserProfileProvider and PracticeHistoryProvider since it bridges the two otherwise-independent
// persistence domains.
export function KenteiRankAutoPromotion() {
  const { kenteiRank, manuallyUnlockedTrickIds = [] } = useUserProfile();
  const { advanceKenteiRank } = useUserProfileActions();
  const { sessions } = usePracticeHistory();

  const lacedCountByTrickId = useMemo(() => selectLacedCountByTrickId(sessions), [sessions]);
  const lacedTrickIds = useMemo(
    () => new Set([...lacedCountByTrickId.entries()].filter(([, count]) => count > 0).map(([trickId]) => trickId)),
    [lacedCountByTrickId],
  );
  const effectiveLacedTrickIds = useMemo(
    () => selectEffectiveUnlockedTrickIds(lacedTrickIds, manuallyUnlockedTrickIds),
    [lacedTrickIds, manuallyUnlockedTrickIds],
  );

  const promotedRank =
    kenteiRank === undefined
      ? undefined
      : selectPromotedKenteiRank(kenteiRank, KENDAMA_KENTEI_TRICKS, effectiveLacedTrickIds);

  useEffect(() => {
    if (promotedRank !== undefined && promotedRank !== kenteiRank) {
      advanceKenteiRank(promotedRank);
    }
  }, [advanceKenteiRank, kenteiRank, promotedRank]);

  // Detects an actual advance in the committed kenteiRank (as opposed to the useEffect above,
  // which only requests it) by comparing against the previous render, using React's
  // adjust-state-while-rendering pattern instead of a setState-in-effect. Seeding
  // `previousKenteiRank` from the first render's value — whatever that is, including an
  // already-hydrated high rank — is what keeps hydration of an already-advanced profile from
  // firing the celebration: there's no "previous" render to differ from yet.
  const [previousKenteiRank, setPreviousKenteiRank] = useState(kenteiRank);
  const [celebratingRank, setCelebratingRank] = useState<number | undefined>(undefined);

  if (kenteiRank !== previousKenteiRank) {
    setPreviousKenteiRank(kenteiRank);
    if (
      previousKenteiRank !== undefined &&
      kenteiRank !== undefined &&
      kenteiRank > previousKenteiRank
    ) {
      setCelebratingRank(kenteiRank);
    }
  }

  return celebratingRank === undefined ? null : (
    <RankUpCelebrationModal rank={celebratingRank} onDismiss={() => setCelebratingRank(undefined)} />
  );
}
