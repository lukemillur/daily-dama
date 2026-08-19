import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Platform, Pressable, TextInput, useWindowDimensions } from 'react-native';
import { styled } from 'styled-components/native';

import { Button } from '@/components/ui/button';
import { BodyText, DisplayTitle, Eyebrow } from '@/components/ui/typography';
import { AppColors, Radii } from '@/constants/theme';
import { useCustomTricks } from '@/features/custom-tricks/state/custom-trick-provider';
import { useUserProfile } from '@/features/profile/state/user-profile-provider';
import { MultiTrickSesh } from '@/features/sesh/components/multi-trick-sesh';
import {
  createTimedSeshPlan,
  isValidTimedSeshMinutes,
  OPEN_ENDED_SESH_PLAN,
  selectSeshPracticeTricks,
  type SeshPlan,
} from '@/features/sesh/model/sesh';
import { TrickDirectory } from '@/features/tricks/components/trick-directory';
import { KENDAMA_KENTEI_TRICKS } from '@/features/tricks/data/kendama-kentei-tricks';
import {
  createProfileDirectoryTricks,
  selectAvailablePracticeTricks,
} from '@/features/tricks/model/trick-directory';
import type { PracticeTrick } from '@/features/tricks/model/trick';

type MultiTrickSeshEntryStep =
  | { readonly kind: 'choosingTricks' }
  | { readonly kind: 'configuringRun' }
  | { readonly kind: 'running'; readonly tricks: readonly PracticeTrick[]; readonly plan: SeshPlan };

/**
 * Entry point for a casual, ad hoc multi-trick practice run: the user picks
 * any set of tricks (no rank ordering, no assessment rules) and steps through
 * them one after another via T012's shared sequencing core (`MultiTrickSesh`).
 *
 * The selection here is deliberately local component state, not the
 * persisted "focused tricks" list on the user profile (`selectedTrickIds` /
 * `toggleSelectedTrick`) — that list drives the single-trick Sesh picker
 * elsewhere in the app, and reusing its actions here would silently mutate
 * the user's persistent practice list every time they build a one-off run.
 * The profile's focus list is still read (read-only) to section the picker,
 * matching the Tricks screen's "Focused" section — but it stays a distinct
 * input from this run's own in-progress selection, which is what drives the
 * checkbox state.
 */
export function MultiTrickSeshEntry() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const shouldPinSelectionChrome = Platform.OS === 'web' && width >= 768;
  const { tricks: customTricks } = useCustomTricks();
  const { selectedTrickIds: focusedTrickIds } = useUserProfile();
  const [step, setStep] = useState<MultiTrickSeshEntryStep>({ kind: 'choosingTricks' });
  const [selectedTrickIds, setSelectedTrickIds] = useState<string[]>([]);
  const [advanceOnFirstLace, setAdvanceOnFirstLace] = useState(false);
  const [perTrickDurationMinutes, setPerTrickDurationMinutes] = useState('');

  const hasPerTrickDuration = perTrickDurationMinutes.trim().length > 0;
  const parsedPerTrickDurationMinutes = Number(perTrickDurationMinutes);
  const hasValidPerTrickDuration =
    !hasPerTrickDuration || isValidTimedSeshMinutes(parsedPerTrickDurationMinutes);
  const plan: SeshPlan =
    hasPerTrickDuration && hasValidPerTrickDuration
      ? createTimedSeshPlan(parsedPerTrickDurationMinutes)
      : OPEN_ENDED_SESH_PLAN;

  const handleToggleTrick = (trickId: string) => {
    setSelectedTrickIds((current) =>
      current.includes(trickId) ? current.filter((id) => id !== trickId) : [...current, trickId],
    );
  };

  const handleStart = () => {
    const tricks = selectSeshPracticeTricks(
      selectAvailablePracticeTricks(KENDAMA_KENTEI_TRICKS, customTricks),
      selectedTrickIds,
    );
    setStep({ kind: 'running', tricks, plan });
  };

  const handleFinished = () => {
    router.replace('/app/sesh');
  };

  if (step.kind === 'running') {
    return (
      <MultiTrickSesh
        tricks={step.tricks}
        plan={step.plan}
        advanceOnFirstLace={advanceOnFirstLace}
        pauseAfterLace={advanceOnFirstLace}
        onFinished={handleFinished}
        onCancelRun={handleFinished}
      />
    );
  }

  const selectedCount = selectedTrickIds.length;

  if (step.kind === 'configuringRun') {
    return (
      <Content>
        <Eyebrow>Multi-trick sesh</Eyebrow>
        <Title>Set your{`\n`}timing.</Title>
        <Copy>
          {selectedCount} {selectedCount === 1 ? 'trick' : 'tricks'} selected.
        </Copy>
        <PerTrickDurationField>
          <PerTrickDurationLabel>Time per trick, minutes (optional)</PerTrickDurationLabel>
          <PerTrickDurationInput
            accessibilityLabel="Time per trick in minutes"
            inputMode="numeric"
            keyboardType="number-pad"
            maxLength={2}
            onChangeText={setPerTrickDurationMinutes}
            placeholder="—"
            selectTextOnFocus
            value={perTrickDurationMinutes}
          />
          <PerTrickDurationHint $invalid={!hasValidPerTrickDuration}>
            {hasValidPerTrickDuration
              ? 'Leave blank to move on only when you end each trick yourself.'
              : 'Enter a whole number from 1 to 60, or leave it blank.'}
          </PerTrickDurationHint>
        </PerTrickDurationField>
        <AdvanceOnFirstLaceRow
          accessibilityLabel={`Advance after one lace, ${advanceOnFirstLace ? 'checked' : 'unchecked'}`}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: advanceOnFirstLace }}
          onPress={() => setAdvanceOnFirstLace((current) => !current)}>
          <AdvanceOnFirstLaceIndicator $checked={advanceOnFirstLace}>
            <AdvanceOnFirstLaceMark>{advanceOnFirstLace ? '✓' : ''}</AdvanceOnFirstLaceMark>
          </AdvanceOnFirstLaceIndicator>
          <AdvanceOnFirstLaceLabel>Advance after one lace</AdvanceOnFirstLaceLabel>
        </AdvanceOnFirstLaceRow>
        <FinishButton
          accessibilityLabel="Start sesh"
          disabled={selectedCount === 0 || (hasPerTrickDuration && !hasValidPerTrickDuration)}
          onPress={handleStart}>
          Start sesh
        </FinishButton>
        <BackButton
          accessibilityLabel="Back to trick selection"
          variant="secondary"
          onPress={() => setStep({ kind: 'choosingTricks' })}>
          Back
        </BackButton>
      </Content>
    );
  }

  return (
    <SelectionContent>
      <TrickDirectory
        tricks={createProfileDirectoryTricks(KENDAMA_KENTEI_TRICKS, customTricks)}
        fixedHeader={shouldPinSelectionChrome}
        fixedFooter={shouldPinSelectionChrome}
        hideScrollIndicator
        showFocusedSection
        focusedTrickIds={focusedTrickIds}
        selection={{ selectedTrickIds, onToggleTrick: handleToggleTrick }}
        header={{
          eyebrow: 'Multi-trick sesh',
          title: 'Pick your\nlineup.',
          introduction: 'Select any tricks you want to work through, one after another, in one sesh.',
        }}
        headerAction={
          <CompactBackLink
            accessibilityLabel="Back to Sesh"
            accessibilityRole="link"
            onPress={() => router.replace('/app/sesh')}>
            ← Back to Sesh
          </CompactBackLink>
        }
        footer={
          <FinishBackdrop $pinned={shouldPinSelectionChrome}>
            <FinishArea $pinned={shouldPinSelectionChrome}>
              <SelectionCount>
                {selectedCount === 0
                  ? 'Select at least one trick to continue.'
                  : `${selectedCount} ${selectedCount === 1 ? 'trick' : 'tricks'} selected.`}
              </SelectionCount>
              <ContinueButton
                accessibilityLabel="Continue to timing setup"
                disabled={selectedCount === 0}
                onPress={() => setStep({ kind: 'configuringRun' })}>
                Continue
              </ContinueButton>
            </FinishArea>
          </FinishBackdrop>
        }
      />
    </SelectionContent>
  );
}

const SelectionContent = styled.View`width: 100%; max-width: 760px; max-height: 864px; flex: 1; align-self: center; overflow: hidden; background-color: ${AppColors.paper}; border-radius: ${Radii.panel}px;`;
const FinishBackdrop = styled.View<{ readonly $pinned: boolean }>`background-color: ${({ $pinned, theme }) => $pinned ? theme.accent : AppColors.paper};`;
const FinishArea = styled.View<{ readonly $pinned: boolean }>`align-items: center; margin-top: ${({ $pinned }) => $pinned ? 54 : 0}px; padding: 20px 22px 22px; background-color: ${AppColors.paper}; border-top-width: 1px; border-top-color: ${AppColors.borderMuted};`;
const SelectionCount = styled.Text`color: ${({ theme }) => theme.text}; font-size: 14px; font-weight: 700; margin-bottom: 12px;`;
const PerTrickDurationField = styled.View`align-self: stretch; margin-bottom: 12px;`;
const PerTrickDurationLabel = styled.Text`color: ${({ theme }) => theme.text}; font-size: 12px; font-weight: 900; margin-bottom: 6px; text-transform: uppercase;`;
const PerTrickDurationInput = styled(TextInput)`height: 54px; width: 110px; background-color: ${AppColors.paper}; border: 2px solid ${AppColors.ink}; color: ${AppColors.ink}; font-size: 24px; font-weight: 900; padding: 8px 12px; border-radius: ${Radii.control}px;`;
const PerTrickDurationHint = styled.Text<{ readonly $invalid: boolean }>`color: ${({ $invalid, theme }) => ($invalid ? AppColors.red : theme.text)}; font-size: 12px; font-weight: 700; margin-top: 7px;`;
const AdvanceOnFirstLaceRow = styled(Pressable)`flex-direction: row; align-items: center; gap: 12px; align-self: stretch; padding: 10px 2px; margin-bottom: 12px;`;
const AdvanceOnFirstLaceIndicator = styled.View<{ readonly $checked: boolean }>`
  width: 22px;
  height: 22px;
  align-items: center;
  justify-content: center;
  background-color: ${({ $checked }) => ($checked ? AppColors.ink : 'transparent')};
  border: 2px solid ${AppColors.ink};
  border-radius: ${Radii.control}px;
`;
const AdvanceOnFirstLaceMark = styled.Text`color: ${({ theme }) => theme.accent}; font-size: 14px; font-weight: 900;`;
const AdvanceOnFirstLaceLabel = styled.Text`color: ${({ theme }) => theme.text}; font-size: 14px; font-weight: 700;`;
const FinishButton = styled(Button).attrs({ fill: true })`min-height: 54px;`;
const ContinueButton = styled(Button).attrs({ fill: true })`min-height: 54px;`;
const Content = styled.View`
  width: 100%;
  max-width: 760px;
  flex: 1;
  justify-content: center;
  padding: 40px 22px 130px;
  align-self: center;
`;
const Title = styled(DisplayTitle)`
  margin-top: 10px;
`;
const Copy = styled(BodyText)`
  max-width: 500px;
  margin-top: 16px;
`;
const BackButton = styled(Button)`
  align-self: flex-start;
  margin-top: 30px;
`;
const CompactBackLink = styled.Text`
  align-self: flex-start;
  padding: 8px 0;
  color: ${AppColors.ink};
  font-size: 13px;
  font-weight: 900;
  margin-top: 16px;
  text-decoration-line: underline;
`;
