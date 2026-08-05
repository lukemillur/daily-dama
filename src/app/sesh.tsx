import { useMemo } from 'react';

import { Screen } from '@/components/ui/screen';
import { useCustomTricks } from '@/features/custom-tricks/state/custom-trick-provider';
import { Sesh } from '@/features/sesh/components/sesh';
import { useUserProfile } from '@/features/profile/state/user-profile-provider';
import { KENDAMA_KENTEI_TRICKS } from '@/features/tricks/data/kendama-kentei-tricks';
import { selectAvailablePracticeTricks } from '@/features/tricks/model/trick-directory';

export default function SeshScreen() {
  const { selectedTrickIds } = useUserProfile();
  const { tricks: customTricks } = useCustomTricks();
  const availableTricks = useMemo(
    () => selectAvailablePracticeTricks(KENDAMA_KENTEI_TRICKS, customTricks),
    [customTricks],
  );

  return (
    <Screen edges={['top', 'left', 'right']}>
      <Sesh availableTricks={availableTricks} selectedTrickIds={selectedTrickIds} />
    </Screen>
  );
}
