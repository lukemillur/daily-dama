import { useEffect, useMemo } from 'react';

import { useUserProfile, useUserProfileActions } from '@/features/profile/state/user-profile-provider';
import { usePracticeHistory } from '@/features/stats/state/practice-history-provider';
import { KENDAMA_KENTEI_TRICKS } from '@/features/tricks/data/kendama-kentei-tricks';
import { selectLacedCountByTrickId, selectPromotedKenteiRank } from '@/features/tricks/model/trick-directory';

// Non-rendering wiring: reacts to practice-history changes and silently advances the profile's
// assessed Kentei rank whenever every standard trick in the current rank has been laced. Must
// render as a child of both UserProfileProvider and PracticeHistoryProvider since it bridges
// the two otherwise-independent persistence domains.
export function KenteiRankAutoPromotion() {
  const { kenteiRank } = useUserProfile();
  const { advanceKenteiRank } = useUserProfileActions();
  const { sessions } = usePracticeHistory();

  const lacedCountByTrickId = useMemo(() => selectLacedCountByTrickId(sessions), [sessions]);

  useEffect(() => {
    if (kenteiRank === undefined) return;

    const promotedRank = selectPromotedKenteiRank(
      kenteiRank,
      KENDAMA_KENTEI_TRICKS,
      lacedCountByTrickId,
    );

    if (promotedRank !== kenteiRank) advanceKenteiRank(promotedRank);
  }, [advanceKenteiRank, kenteiRank, lacedCountByTrickId]);

  return null;
}
