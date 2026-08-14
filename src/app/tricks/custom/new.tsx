import { useRouter } from 'expo-router';
import { useState } from 'react';

import { Screen } from '@/components/ui/screen';
import { CustomTrickForm, ChoiceScreen } from '@/app/tricks';
import type { CustomTrick } from '@/features/custom-tricks/model/custom-trick';
import { useRequireOnboarding } from '@/features/onboarding/state/require-onboarding';

export default function NewCustomTrickRoute() {
  const isOnboardingComplete = useRequireOnboarding();
  const router = useRouter();
  const [step, setStep] = useState<'choose' | CustomTrick['kind']>('choose');
  if (!isOnboardingComplete) return null;
  return <Screen edges={['top', 'left', 'right']}>
    {step === 'choose' ? <ChoiceScreen onCancel={() => router.replace('/tricks')} onChoose={setStep} /> : <CustomTrickForm kind={step} onCancel={() => router.replace('/tricks')} onSaved={() => router.replace('/tricks')} />}
  </Screen>;
}
