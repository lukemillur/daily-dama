import { Screen } from '@/components/ui/screen';
import { Sesh } from '@/features/sesh/components/sesh';
import { useUserProfile } from '@/features/profile/state/user-profile-provider';

export default function SeshScreen() {
  const { selectedTrickIds } = useUserProfile();

  return (
    <Screen edges={['top', 'left', 'right']}>
      <Sesh selectedTrickIds={selectedTrickIds} />
    </Screen>
  );
}
