import { useMemo, useState } from 'react';
import { ScrollView } from 'react-native';
import { styled } from 'styled-components/native';

import { Button } from '@/components/ui/button';
import { BodyText, DisplayTitle, Eyebrow } from '@/components/ui/typography';
import { AppColors } from '@/constants/theme';
import {
  GoalForm,
  GoalRow,
} from '@/features/goals/components/trick-goals-screen';
import { selectGoalProgressByTrick } from '@/features/goals/model/goal';
import { useGoalActions, useGoals } from '@/features/goals/state/goal-provider';
import { usePracticeHistory } from '@/features/stats/state/practice-history-provider';
import { TrickDirectory } from '@/features/tricks/components/trick-directory';
import { TrickDirectoryColumn } from '@/features/tricks/components/trick-directory-column';
import type { DirectoryTrick } from '@/features/tricks/model/trick-directory';

interface AllTrickGoalsScreenProps {
  readonly tricks: readonly DirectoryTrick[];
  readonly onBack: () => void;
  readonly focusedTrickIds?: readonly string[];
}

type ScreenStep =
  | { readonly kind: 'list' }
  | { readonly kind: 'select-trick' }
  | {
      readonly kind: 'add';
      readonly trickId: string;
      readonly trickName: string;
    };

export function AllTrickGoalsScreen({
  tricks,
  onBack,
  focusedTrickIds = [],
}: AllTrickGoalsScreenProps) {
  const { goals } = useGoals();
  const { addGoal, deleteGoal } = useGoalActions();
  const { sessions } = usePracticeHistory();
  const [step, setStep] = useState<ScreenStep>({ kind: 'list' });
  const groups = useMemo(
    () => selectGoalProgressByTrick(goals, sessions),
    [goals, sessions],
  );

  if (step.kind === 'select-trick') {
    return (
      <GoalTrickPicker
        tricks={tricks}
        focusedTrickIds={focusedTrickIds}
        onCancel={() => setStep({ kind: 'list' })}
        onSelect={(trick) => setStep({ kind: 'add', trickId: trick.id, trickName: trick.name })}
      />
    );
  }

  if (step.kind === 'add') {
    return (
      <GoalForm
        onCancel={() => setStep({ kind: 'list' })}
        onSave={(input) => {
          const result = addGoal(input);
          if (result.status === 'saved') setStep({ kind: 'list' });
        }}
        trickId={step.trickId}
        trickName={step.trickName}
      />
    );
  }

  return (
    <Scroll contentContainerStyle={{ paddingBottom: 24 }}>
      <Content>
        <Eyebrow>Trick goals</Eyebrow>
        <PageTitle>Trick goals</PageTitle>
        <Introduction>
          {groups.length === 0
            ? "No goals yet. Set one from a trick's Goals action, or add one below."
            : `${groups.length} ${groups.length === 1 ? 'trick' : 'tricks'} with goals set.`}
        </Introduction>

        <AddButton
          accessibilityLabel="Add goal"
          size="medium"
          onPress={() => setStep({ kind: 'select-trick' })}
        >
          Add goal
        </AddButton>

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

        <FormActions>
          <Button accessibilityLabel="Back to Tricks" fill variant="secondary" onPress={onBack}>
            Back to Tricks
          </Button>
        </FormActions>
      </Content>
    </Scroll>
  );
}

function GoalTrickPicker({
  tricks,
  focusedTrickIds,
  onCancel,
  onSelect,
}: {
  readonly tricks: readonly DirectoryTrick[];
  readonly onCancel: () => void;
  readonly onSelect: (trick: DirectoryTrick) => void;
  readonly focusedTrickIds: readonly string[];
}) {
  const [query, setQuery] = useState('');

  return (
    <TrickDirectoryColumn>
      <TrickDirectory
        tricks={tricks}
        focusedTrickIds={focusedTrickIds}
        showFocusedSection
        search={{ query, onChangeText: setQuery }}
        onActivate={onSelect}
        header={{ eyebrow: 'New goal', title: 'Choose a trick.', introduction: 'Pick the trick you want to set a goal for.' }}
        footer={<FormActions><Button fill variant="secondary" onPress={onCancel}>Cancel</Button></FormActions>}
        fixedHeader
        fixedFooter
      />
    </TrickDirectoryColumn>
  );
}

const Scroll = styled(ScrollView)`
  flex: 1;
  width: 100%;
`;
const Content = styled.View`
  width: 100%;
  max-width: 680px;
  align-self: center;
  padding: 38px 22px 0;
`;
const PageTitle = styled(DisplayTitle)`
  margin-top: 12px;
`;
const Introduction = styled(BodyText)`
  max-width: 580px;
  margin-top: 16px;
`;
const AddButton = styled(Button)`
  align-self: flex-start;
  margin-top: 26px;
`;
const FormActions = styled.View`
  gap: 10px;
  margin-top: 26px;
`;
const Sections = styled.View`
  gap: 24px;
  margin-top: 30px;
`;
const Section = styled.View`
  gap: 12px;
`;
const SectionHeader = styled.View`
  flex-direction: row;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
`;
const SectionTitle = styled.Text`
  color: ${AppColors.ink};
  font-size: 18px;
  font-weight: 900;
`;
const GoalList = styled.View`
  gap: 12px;
`;
