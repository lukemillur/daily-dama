import { useState } from 'react';
import { Platform, useWindowDimensions } from 'react-native';
import { styled } from 'styled-components/native';

import { Button } from '@/components/ui/button';
import { AppColors, Radii } from '@/constants/theme';
import { useCustomTricks } from '@/features/custom-tricks/state/custom-trick-provider';
import { MultiTrickSesh } from '@/features/sesh/components/multi-trick-sesh';
import { OPEN_ENDED_SESH_PLAN, selectSeshPracticeTricks } from '@/features/sesh/model/sesh';
import { TrickDirectory } from '@/features/tricks/components/trick-directory';
import { KENDAMA_KENTEI_TRICKS } from '@/features/tricks/data/kendama-kentei-tricks';
import {
  createProfileDirectoryTricks,
  selectAvailablePracticeTricks,
} from '@/features/tricks/model/trick-directory';
import type { PracticeTrick } from '@/features/tricks/model/trick';

type MultiTrickSeshEntryStep =
  | { readonly kind: 'choosingTricks' }
  | { readonly kind: 'running'; readonly tricks: readonly PracticeTrick[] };

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
 */
export function MultiTrickSeshEntry() {
  const { width } = useWindowDimensions();
  const shouldPinSelectionChrome = Platform.OS === 'web' && width >= 768;
  const { tricks: customTricks } = useCustomTricks();
  const [step, setStep] = useState<MultiTrickSeshEntryStep>({ kind: 'choosingTricks' });
  const [selectedTrickIds, setSelectedTrickIds] = useState<string[]>([]);

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
    setStep({ kind: 'running', tricks });
  };

  const handleFinished = () => {
    setStep({ kind: 'choosingTricks' });
    setSelectedTrickIds([]);
  };

  if (step.kind === 'running') {
    return <MultiTrickSesh tricks={step.tricks} plan={OPEN_ENDED_SESH_PLAN} onFinished={handleFinished} />;
  }

  const selectedCount = selectedTrickIds.length;

  return (
    <SelectionContent>
      <TrickDirectory
        tricks={createProfileDirectoryTricks(KENDAMA_KENTEI_TRICKS, customTricks)}
        fixedHeader={shouldPinSelectionChrome}
        fixedFooter={shouldPinSelectionChrome}
        hideScrollIndicator
        selection={{ selectedTrickIds, onToggleTrick: handleToggleTrick }}
        header={{
          eyebrow: 'Multi-trick sesh',
          title: 'Pick your\nlineup.',
          introduction: 'Select any tricks you want to work through, one after another, in one sesh.',
        }}
        footer={
          <FinishBackdrop $pinned={shouldPinSelectionChrome}>
            <FinishArea $pinned={shouldPinSelectionChrome}>
              <SelectionCount>
                {selectedCount === 0
                  ? 'Select at least one trick to continue.'
                  : `${selectedCount} ${selectedCount === 1 ? 'trick' : 'tricks'} selected.`}
              </SelectionCount>
              <FinishButton disabled={selectedCount === 0} onPress={handleStart}>
                Start sesh
              </FinishButton>
            </FinishArea>
          </FinishBackdrop>
        }
      />
    </SelectionContent>
  );
}

const SelectionContent = styled.View`width: 100%; max-width: 760px; max-height: 864px; flex: 1; align-self: center; overflow: hidden; background-color: ${AppColors.paper}; border-radius: ${Radii.panel}px;`;
const FinishBackdrop = styled.View<{ readonly $pinned: boolean }>`background-color: ${({ $pinned }) => $pinned ? AppColors.yellow : AppColors.paper};`;
const FinishArea = styled.View<{ readonly $pinned: boolean }>`align-items: center; margin-top: ${({ $pinned }) => $pinned ? 54 : 0}px; padding: 20px 22px 22px; background-color: ${AppColors.paper}; border-top-width: 1px; border-top-color: ${AppColors.borderMuted};`;
const SelectionCount = styled.Text`color: ${AppColors.textMuted}; font-size: 14px; font-weight: 700; margin-bottom: 12px;`;
const FinishButton = styled(Button).attrs({ fill: true })`min-height: 54px;`;
