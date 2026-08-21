import { Link } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, TextInput } from 'react-native';
import { styled } from 'styled-components/native';

import { Button } from '@/components/ui/button';
import { BodyText, DisplayTitle, Eyebrow } from '@/components/ui/typography';
import { AppColors, BottomTabInset, Radii } from '@/constants/theme';
import {
  selectGoalProgress,
  selectGoalsForTrick,
  validateGoalCreation,
  type Goal,
  type GoalCreationInput,
  type GoalProgress,
} from '@/features/goals/model/goal';
import { useGoalActions, useGoals } from '@/features/goals/state/goal-provider';
import { formatDuration } from '@/features/sesh/model/sesh';
import { usePracticeHistory } from '@/features/stats/state/practice-history-provider';

interface TrickGoalsScreenProps {
  readonly trickId: string;
  readonly trickName: string;
  readonly onBack: () => void;
}

type ScreenStep = { readonly kind: 'list' } | { readonly kind: 'add' };

export function TrickGoalsScreen({ trickId, trickName, onBack }: TrickGoalsScreenProps) {
  const { goals } = useGoals();
  const { addGoal, deleteGoal } = useGoalActions();
  const { sessions } = usePracticeHistory();
  const [step, setStep] = useState<ScreenStep>({ kind: 'list' });
  const trickGoals = useMemo(() => selectGoalsForTrick(goals, trickId), [goals, trickId]);
  const goalProgressList = useMemo(
    () => trickGoals.map((goal) => selectGoalProgress(goal, sessions)),
    [trickGoals, sessions],
  );

  if (step.kind === 'add') {
    return (
      <GoalForm
        onCancel={() => setStep({ kind: 'list' })}
        onSave={(input) => {
          const result = addGoal(input);
          if (result.status === 'saved') setStep({ kind: 'list' });
        }}
        trickId={trickId}
        trickName={trickName}
      />
    );
  }

  return (
    <Scroll keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 120 + BottomTabInset }}>
      <Content>
        <Eyebrow>Goals</Eyebrow>
        <PageTitle>{trickName}</PageTitle>
        <Introduction>
          {trickGoals.length === 0
            ? 'No goals yet. Set a target to work toward.'
            : `${trickGoals.length} ${trickGoals.length === 1 ? 'goal' : 'goals'} for this trick.`}
        </Introduction>

        <AddButton size="medium" onPress={() => setStep({ kind: 'add' })}>
          Add goal
        </AddButton>

        <GoalList>
          {goalProgressList.map((progress) => (
            <GoalRow key={progress.goal.id} progress={progress} onDelete={() => deleteGoal(progress.goal.id)} />
          ))}
        </GoalList>

        <FormActions>
          <Button accessibilityLabel="Back to Tricks" fill variant="secondary" onPress={onBack}>
            Back to Tricks
          </Button>
        </FormActions>
      </Content>
    </Scroll>
  );
}

export function formatGoalTarget(goal: Goal) {
  return goal.kind === 'count'
    ? `${goal.targetCount} ${goal.targetCount === 1 ? 'lace' : 'laces'}`
    : formatDuration(goal.targetMs);
}

export function formatGoalProgress(progress: GoalProgress) {
  return progress.goal.kind === 'count'
    ? `${progress.current} / ${progress.target} ${progress.target === 1 ? 'lace' : 'laces'}`
    : `${formatDuration(progress.current)} / ${formatDuration(progress.target)}`;
}

export function GoalRow({
  progress,
  onDelete,
}: {
  readonly progress: GoalProgress;
  readonly onDelete: () => void;
}) {
  const { goal } = progress;
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  if (confirmingDelete) {
    return (
      <GoalCard style={{ boxShadow: `8px 8px 0 ${AppColors.ink}` }}>
        <GoalBody>Delete this goal? This cannot be undone.</GoalBody>
        <GoalActionsRow>
          <GoalAction
            accessibilityLabel="Confirm delete goal"
            accessibilityRole="button"
            onPress={() => {
              onDelete();
              setConfirmingDelete(false);
            }}>
            <DeleteActionText>Delete</DeleteActionText>
          </GoalAction>
          <GoalAction
            accessibilityLabel="Cancel delete goal"
            accessibilityRole="button"
            onPress={() => setConfirmingDelete(false)}>
            <GoalActionText>Cancel</GoalActionText>
          </GoalAction>
        </GoalActionsRow>
      </GoalCard>
    );
  }

  return (
    <GoalCard style={{ boxShadow: `8px 8px 0 ${AppColors.ink}` }}>
      <GoalMetaRow>
        <GoalMeta>{goal.kind === 'count' ? 'Lace count goal' : 'Practice time goal'}</GoalMeta>
        {progress.achieved ? <AchievedBadge>Achieved</AchievedBadge> : null}
      </GoalMetaRow>
      <GoalBody>{formatGoalTarget(goal)}</GoalBody>
      <ProgressText>{formatGoalProgress(progress)}</ProgressText>
      <GoalActionsRow>
        <Link asChild href={{ pathname: '/app/sesh', params: { trickId: goal.trickId, mode: 'practice' } }}>
          <GoalAction accessibilityLabel={`Practice ${goal.trickName}`} accessibilityRole="link">
            <GoalActionText>Practice toward this goal</GoalActionText>
          </GoalAction>
        </Link>
        <GoalAction
          accessibilityLabel="Delete goal"
          accessibilityRole="button"
          onPress={() => setConfirmingDelete(true)}>
          <DeleteActionText>Delete</DeleteActionText>
        </GoalAction>
      </GoalActionsRow>
    </GoalCard>
  );
}

export function GoalForm({
  onCancel,
  onSave,
  trickId,
  trickName,
}: {
  readonly onCancel: () => void;
  readonly onSave: (input: GoalCreationInput) => void;
  readonly trickId: string;
  readonly trickName: string;
}) {
  const [kind, setKind] = useState<'count' | 'time'>('count');
  const [targetText, setTargetText] = useState('');

  const input: GoalCreationInput = useMemo(() => {
    const targetValue = Number(targetText);
    return kind === 'count'
      ? { kind: 'count', trickId, trickName, targetCount: targetValue }
      : { kind: 'time', trickId, trickName, targetMinutes: targetValue };
  }, [kind, targetText, trickId, trickName]);

  const validation = validateGoalCreation(input);

  const save = () => {
    if (validation.status !== 'valid') return;
    onSave(input);
  };

  return (
    <Scroll keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 120 + BottomTabInset }}>
      <Content>
        <Eyebrow>New goal</Eyebrow>
        <PageTitle>Set a target.</PageTitle>

        <Field>
          <FieldLabel>Goal type</FieldLabel>
          <KindPicker accessibilityRole="radiogroup">
            <KindOption
              $selected={kind === 'count'}
              accessibilityLabel="Lace count goal"
              accessibilityRole="radio"
              accessibilityState={{ checked: kind === 'count' }}
              onPress={() => setKind('count')}>
              <KindMark $selected={kind === 'count'}>{kind === 'count' ? '✓' : '—'}</KindMark>
              <KindTitle $selected={kind === 'count'}>Lace count</KindTitle>
            </KindOption>
            <KindOption
              $selected={kind === 'time'}
              accessibilityLabel="Practice time goal"
              accessibilityRole="radio"
              accessibilityState={{ checked: kind === 'time' }}
              onPress={() => setKind('time')}>
              <KindMark $selected={kind === 'time'}>{kind === 'time' ? '✓' : '—'}</KindMark>
              <KindTitle $selected={kind === 'time'}>Practice time</KindTitle>
            </KindOption>
          </KindPicker>
        </Field>

        <Field>
          <FieldLabel>{kind === 'count' ? 'Target lace count' : 'Target minutes'}</FieldLabel>
          <FieldInput
            accessibilityLabel={kind === 'count' ? 'Target lace count' : 'Target minutes'}
            keyboardType="number-pad"
            onChangeText={setTargetText}
            placeholder={kind === 'count' ? 'e.g. 50' : 'e.g. 30'}
            placeholderTextColor={AppColors.textSubtle}
            value={targetText}
          />
          {validation.status === 'invalid' && validation.errors.target ? (
            <ErrorText>{validation.errors.target}</ErrorText>
          ) : null}
        </Field>

        <FormActions>
          <Button
            accessibilityLabel="Save goal"
            fill
            disabled={validation.status === 'invalid'}
            onPress={save}>
            Save goal
          </Button>
          <Button fill variant="secondary" onPress={onCancel}>
            Cancel
          </Button>
        </FormActions>
      </Content>
    </Scroll>
  );
}

const Scroll = styled(ScrollView)`flex: 1; width: 100%;`;
const Content = styled.View`width: 100%; max-width: 680px; align-self: center; padding: 38px 22px 0;`;
const PageTitle = styled(DisplayTitle)`margin-top: 12px;`;
const Introduction = styled(BodyText)`max-width: 580px; margin-top: 16px;`;
const AddButton = styled(Button)`align-self: flex-start; margin-top: 26px;`;
const GoalList = styled.View`gap: 12px; margin-top: 28px;`;
// `boxShadow` is passed as an explicit `style` prop at each JSX call site (not baked into
// `.attrs`) -- see landing-cta.tsx's CtaPanel comment: styled-components/native's
// `.attrs({ style: {...} })` config is not concatenated into the final rendered style
// unless the caller also passes its own `style` prop.
const GoalCard = styled.View`
  background-color: ${AppColors.paper};
  border: 2px solid ${AppColors.ink};
  border-radius: ${Radii.panel}px;
  padding: 16px;
`;
const GoalMetaRow = styled.View`flex-direction: row; align-items: center; justify-content: space-between; gap: 10px;`;
const GoalMeta = styled.Text`color: ${AppColors.red}; font-size: 11px; font-weight: 900; letter-spacing: 0.8px; text-transform: uppercase;`;
const AchievedBadge = styled.Text`overflow: hidden; padding: 4px 8px; color: ${AppColors.paper}; background-color: ${AppColors.ink}; border-radius: 3px; font-size: 10px; font-weight: 900; letter-spacing: 0.8px; text-transform: uppercase;`;
const GoalBody = styled.Text`color: ${AppColors.ink}; font-size: 16px; font-weight: 650; line-height: 23px; margin-top: 8px;`;
const ProgressText = styled.Text`color: ${AppColors.inkSoft}; font-size: 13px; font-weight: 700; margin-top: 6px;`;
const GoalActionsRow = styled.View`flex-direction: row; gap: 14px; margin-top: 12px;`;
const GoalAction = styled(Pressable)`min-height: 36px; justify-content: center;`;
const GoalActionText = styled.Text`color: ${AppColors.ink}; font-size: 12px; font-weight: 900; text-transform: uppercase;`;
const DeleteActionText = styled(GoalActionText)`color: ${AppColors.red};`;
const Field = styled.View`margin-top: 28px;`;
const FieldLabel = styled.Text`color: ${AppColors.ink}; font-size: 13px; font-weight: 900; letter-spacing: 1px; text-transform: uppercase;`;
const FieldInput = styled(TextInput)`min-height: 56px; background-color: ${AppColors.paper}; border: 2px solid ${AppColors.ink}; color: ${AppColors.ink}; font-size: 18px; font-weight: 800; margin-top: 8px; padding: 12px 14px;`;
const ErrorText = styled.Text`color: ${AppColors.red}; font-size: 12px; font-weight: 800; margin-top: 7px;`;
const KindPicker = styled.View`flex-direction: row; gap: 10px; margin-top: 8px;`;
const KindOption = styled(Pressable)<{ readonly $selected: boolean }>`min-width: 140px; flex: 1; min-height: 54px; flex-direction: row; align-items: center; gap: 10px; background-color: ${({ $selected }) => ($selected ? AppColors.ink : AppColors.paper)}; border: 2px solid ${AppColors.ink}; padding: 10px 13px;`;
const KindMark = styled.Text<{ readonly $selected: boolean }>`width: 18px; color: ${({ $selected, theme }) => ($selected ? theme.accent : AppColors.red)}; font-size: 16px; font-weight: 900; text-align: center;`;
const KindTitle = styled.Text<{ readonly $selected: boolean }>`color: ${({ $selected }) => ($selected ? AppColors.cream : AppColors.ink)}; font-size: 14px; font-weight: 900;`;
const FormActions = styled.View`gap: 10px; margin-top: 36px;`;
