import { useMemo } from 'react';
import { ScrollView } from 'react-native';
import { styled } from 'styled-components/native';

import { Button } from '@/components/ui/button';
import { BodyText, DisplayTitle, Eyebrow } from '@/components/ui/typography';
import { AppColors, BottomTabInset } from '@/constants/theme';
import { GoalRow } from '@/features/goals/components/trick-goals-screen';
import { selectGoalProgressByTrick } from '@/features/goals/model/goal';
import { useGoalActions, useGoals } from '@/features/goals/state/goal-provider';
import { usePracticeHistory } from '@/features/stats/state/practice-history-provider';

interface AllTrickGoalsScreenProps {
  readonly onClose: () => void;
}

export function AllTrickGoalsScreen({ onClose }: AllTrickGoalsScreenProps) {
  const { goals } = useGoals();
  const { deleteGoal } = useGoalActions();
  const { sessions } = usePracticeHistory();
  const groups = useMemo(() => selectGoalProgressByTrick(goals, sessions), [goals, sessions]);

  return (
    <Scroll contentContainerStyle={{ paddingBottom: 120 + BottomTabInset }}>
      <Content>
        <Eyebrow>Trick goals</Eyebrow>
        <PageTitle>Trick goals</PageTitle>
        <Introduction>
          {groups.length === 0
            ? "No goals yet. Set one from a trick's Goals action."
            : `${groups.length} ${groups.length === 1 ? 'trick' : 'tricks'} with goals set.`}
        </Introduction>

        <FormActions>
          <Button fill variant="secondary" onPress={onClose}>
            Close
          </Button>
        </FormActions>

        <Sections>
          {groups.map((group) => (
            <Section key={group.trickId}>
              <SectionHeader>
                <SectionTitle>{group.trickName}</SectionTitle>
              </SectionHeader>
              <GoalList>
                {group.progress.map((progress) => (
                  <GoalRow
                    key={progress.goal.id}
                    progress={progress}
                    onDelete={() => deleteGoal(progress.goal.id)}
                  />
                ))}
              </GoalList>
            </Section>
          ))}
        </Sections>
      </Content>
    </Scroll>
  );
}

const Scroll = styled(ScrollView)`flex: 1; width: 100%;`;
const Content = styled.View`width: 100%; max-width: 680px; align-self: center; padding: 38px 22px 0;`;
const PageTitle = styled(DisplayTitle)`margin-top: 12px;`;
const Introduction = styled(BodyText)`max-width: 580px; margin-top: 16px;`;
const FormActions = styled.View`gap: 10px; margin-top: 26px;`;
const Sections = styled.View`gap: 24px; margin-top: 30px;`;
const Section = styled.View`gap: 12px;`;
const SectionHeader = styled.View`flex-direction: row; align-items: baseline; justify-content: space-between; gap: 12px;`;
const SectionTitle = styled.Text`color: ${AppColors.ink}; font-size: 18px; font-weight: 900;`;
const GoalList = styled.View`gap: 12px;`;
