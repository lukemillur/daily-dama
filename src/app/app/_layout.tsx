import AppTabs from '@/components/app-tabs';
import { CustomTrickProvider } from '@/features/custom-tricks/state/custom-trick-provider';
import { GoalProvider } from '@/features/goals/state/goal-provider';
import { NoteProvider } from '@/features/notes/state/note-provider';
import { AppThemeProvider } from '@/features/profile/components/app-theme-provider';
import { KenteiRankAutoPromotion } from '@/features/profile/state/kentei-rank-auto-promotion';
import { UserProfileProvider } from '@/features/profile/state/user-profile-provider';
import { PracticeHistoryProvider } from '@/features/stats/state/practice-history-provider';

export default function AppShellLayout() {
  return (
    <CustomTrickProvider>
      <UserProfileProvider>
        <PracticeHistoryProvider>
          <NoteProvider>
            <GoalProvider>
              <AppThemeProvider>
                <KenteiRankAutoPromotion />
                <AppTabs />
              </AppThemeProvider>
            </GoalProvider>
          </NoteProvider>
        </PracticeHistoryProvider>
      </UserProfileProvider>
    </CustomTrickProvider>
  );
}
