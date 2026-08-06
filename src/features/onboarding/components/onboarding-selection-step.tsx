import { Platform, useWindowDimensions } from 'react-native';
import { styled } from 'styled-components/native';

import { Button } from '@/components/ui/button';
import { AppColors, Radii } from '@/constants/theme';
import { getTricksForRank } from '@/features/onboarding/model/kentei-assessment';
import { TrickDirectory } from '@/features/tricks/components/trick-directory';

export function OnboardingSelectionStep({
  rank,
  selectedTrickIds,
  onToggleTrick,
  onFinish,
}: {
  readonly rank: number;
  readonly selectedTrickIds: readonly string[];
  readonly onToggleTrick: (trickId: string) => void;
  readonly onFinish: () => void;
}) {
  const { width } = useWindowDimensions();
  const shouldPinSelectionChrome = Platform.OS === 'web' && width >= 768;
  const rankTricks = getTricksForRank(rank);
  const selectedCount = selectedTrickIds.length;

  return (
    <SelectionContent>
      <TrickDirectory
        tricks={rankTricks}
        fixedHeader={shouldPinSelectionChrome}
        fixedFooter={shouldPinSelectionChrome}
        hideScrollIndicator
        selection={{ selectedTrickIds, onToggleTrick }}
        header={{
          eyebrow: `Your practice frontier · Rank ${rank}`,
          title: 'Choose what to\nwork on first.',
          introduction: `Select one or more Rank ${rank} tricks. These will become your initial Sesh practice list.`,
        }}
        footer={
          <FinishBackdrop $pinned={shouldPinSelectionChrome}>
            <FinishArea $pinned={shouldPinSelectionChrome}>
              <SelectionCount>
                {selectedCount === 0
                  ? 'Select at least one trick to continue.'
                  : `${selectedCount} ${selectedCount === 1 ? 'trick' : 'tricks'} selected.`}
              </SelectionCount>
              <FinishButton disabled={selectedCount === 0} onPress={onFinish}>
                Start practicing
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
