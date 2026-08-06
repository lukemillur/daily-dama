import { useRouter } from 'expo-router';
import { useReducer } from 'react';

import { INITIAL_KENTEI_ASSESSMENT, kenteiAssessmentReducer } from '@/features/onboarding/model/kentei-assessment';
import { useUserProfileActions } from '@/features/profile/state/user-profile-provider';
import { OnboardingAssessmentStep } from '@/features/onboarding/components/onboarding-assessment-step';
import { OnboardingIntroStep } from '@/features/onboarding/components/onboarding-intro-step';
import { OnboardingLevelStep } from '@/features/onboarding/components/onboarding-level-step';
import { OnboardingRankRevealStep } from '@/features/onboarding/components/onboarding-rank-reveal-step';
import { OnboardingSelectionStep } from '@/features/onboarding/components/onboarding-selection-step';

export function KenteiOnboarding() {
  const router = useRouter();
  const [state, dispatch] = useReducer(kenteiAssessmentReducer, INITIAL_KENTEI_ASSESSMENT);
  const { completeOnboarding } = useUserProfileActions();

  switch (state.status) {
    case 'intro':
      return <OnboardingIntroStep onContinue={() => dispatch({ type: 'introContinued' })} />;
    case 'levelSelect':
      return (
        <OnboardingLevelStep onSelect={(level) => dispatch({ type: 'levelSelected', level })} />
      );
    case 'assessing':
      return (
        <OnboardingAssessmentStep
          rank={state.rank}
          trickIndex={state.trickIndex}
          onLanded={() => dispatch({ type: 'trickLanded' })}
          onNotLanded={() => dispatch({ type: 'trickNotLanded' })}
        />
      );
    case 'rankReveal':
      return (
        <OnboardingRankRevealStep
          rank={state.rank}
          onContinue={() => dispatch({ type: 'rankRevealContinued' })}
        />
      );
    case 'selecting':
      return (
        <OnboardingSelectionStep
          rank={state.rank}
          selectedTrickIds={state.selectedTrickIds}
          onToggleTrick={(trickId) => dispatch({ type: 'practiceTrickToggled', trickId })}
          onFinish={() => {
            if (state.selectedTrickIds.length === 0) return;
            completeOnboarding(state.rank, state.selectedTrickIds);
            router.replace('/sesh');
          }}
        />
      );
  }
}
