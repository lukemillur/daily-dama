import { useMemo, useState } from 'react';
import { Pressable, ScrollView, TextInput } from 'react-native';
import { styled } from 'styled-components/native';

import { Button } from '@/components/ui/button';
import { BodyText, DisplayTitle, Eyebrow } from '@/components/ui/typography';
import { AppColors, BottomTabInset } from '@/constants/theme';
import {
  GoalForm,
  GoalRow,
} from '@/features/goals/components/trick-goals-screen';
import { selectGoalProgressByTrick } from '@/features/goals/model/goal';
import { useGoalActions, useGoals } from '@/features/goals/state/goal-provider';
import { usePracticeHistory } from '@/features/stats/state/practice-history-provider';
import type { DirectoryTrick } from '@/features/tricks/model/trick-directory';

interface AllTrickGoalsScreenProps {
  readonly tricks: readonly DirectoryTrick[];
  readonly onClose: () => void;
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
  onClose,
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
      <TrickPicker
        tricks={tricks}
        onCancel={() => setStep({ kind: 'list' })}
        onSelect={(trick) =>
          setStep({ kind: 'add', trickId: trick.id, trickName: trick.name })
        }
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
    <Scroll contentContainerStyle={{ paddingBottom: 120 + BottomTabInset }}>
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
          <Button fill variant="secondary" onPress={onClose}>
            Close
          </Button>
        </FormActions>
      </Content>
    </Scroll>
  );
}

function TrickPicker({
  tricks,
  onCancel,
  onSelect,
}: {
  readonly tricks: readonly DirectoryTrick[];
  readonly onCancel: () => void;
  readonly onSelect: (trick: DirectoryTrick) => void;
}) {
  const [query, setQuery] = useState('');
  const filteredTricks = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const sorted = [...tricks].sort((a, b) => a.name.localeCompare(b.name));
    if (normalizedQuery.length === 0) return sorted;
    return sorted.filter((trick) =>
      trick.name.toLowerCase().includes(normalizedQuery),
    );
  }, [query, tricks]);

  return (
    <Scroll
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ paddingBottom: 120 + BottomTabInset }}
    >
      <Content>
        <Eyebrow>New goal</Eyebrow>
        <PageTitle>Choose a trick.</PageTitle>
        <Introduction>Pick the trick you want to set a goal for.</Introduction>

        <SearchField
          accessibilityLabel="Search tricks"
          onChangeText={setQuery}
          placeholder="Search tricks"
          placeholderTextColor={AppColors.textSubtle}
          value={query}
        />

        <TrickList>
          {filteredTricks.map((trick) => (
            <TrickOption
              accessibilityLabel={`Choose ${trick.name}`}
              accessibilityRole="button"
              key={trick.id}
              onPress={() => onSelect(trick)}
            >
              <TrickOptionText>{trick.name}</TrickOptionText>
            </TrickOption>
          ))}
          {filteredTricks.length === 0 ? (
            <EmptyResultText>No tricks match your search.</EmptyResultText>
          ) : null}
        </TrickList>

        <FormActions>
          <Button fill variant="secondary" onPress={onCancel}>
            Cancel
          </Button>
        </FormActions>
      </Content>
    </Scroll>
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
const SearchField = styled(TextInput)`
  min-height: 52px;
  background-color: ${AppColors.paper};
  border: 2px solid ${AppColors.ink};
  color: ${AppColors.ink};
  font-size: 16px;
  font-weight: 700;
  margin-top: 22px;
  padding: 12px 14px;
`;
const TrickList = styled.View`
  gap: 8px;
  margin-top: 20px;
`;
const TrickOption = styled(Pressable)`
  min-height: 48px;
  justify-content: center;
  background-color: ${AppColors.paper};
  border: 2px solid ${AppColors.ink};
  padding: 10px 14px;
`;
const TrickOptionText = styled.Text`
  color: ${AppColors.ink};
  font-size: 15px;
  font-weight: 800;
`;
const EmptyResultText = styled(BodyText)`
  margin-top: 4px;
`;
