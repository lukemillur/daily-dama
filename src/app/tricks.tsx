import { useMemo, useState } from 'react';
import { Pressable, ScrollView, TextInput } from 'react-native';
import { styled } from 'styled-components/native';

import { Button } from '@/components/ui/button';
import { Screen } from '@/components/ui/screen';
import { BodyText, DisplayTitle, Eyebrow } from '@/components/ui/typography';
import { AppColors, BottomTabInset } from '@/constants/theme';
import {
  type CustomTrick,
  type CustomTrickDraft,
  validateCustomTrickDraft,
} from '@/features/custom-tricks/model/custom-trick';
import {
  useCustomTrickActions,
  useCustomTricks,
} from '@/features/custom-tricks/state/custom-trick-provider';
import { useUserProfileActions } from '@/features/profile/state/user-profile-provider';

export default function TricksScreen() {
  const { tricks } = useCustomTricks();
  const [creationStep, setCreationStep] = useState<'list' | 'choose' | CustomTrick['kind']>('list');
  const [editingTrick, setEditingTrick] = useState<CustomTrick | undefined>(undefined);
  const [deletingTrick, setDeletingTrick] = useState<CustomTrick | undefined>(undefined);

  if (editingTrick) {
    return (
      <Screen edges={['top', 'left', 'right']}>
        <CustomTrickForm
          initialTrick={editingTrick}
          kind={editingTrick.kind}
          onCancel={() => setEditingTrick(undefined)}
          onSaved={() => setEditingTrick(undefined)}
        />
      </Screen>
    );
  }

  if (deletingTrick) {
    return (
      <Screen edges={['top', 'left', 'right']}>
        <DeleteConfirmation
          trick={deletingTrick}
          onCancel={() => setDeletingTrick(undefined)}
          onDeleted={() => setDeletingTrick(undefined)}
        />
      </Screen>
    );
  }

  if (creationStep === 'choose') {
    return (
      <Screen edges={['top', 'left', 'right']}>
        <ChoiceScreen
          onCancel={() => setCreationStep('list')}
          onChoose={setCreationStep}
        />
      </Screen>
    );
  }

  if (creationStep === 'standalone' || creationStep === 'sequence') {
    return (
      <Screen edges={['top', 'left', 'right']}>
        <CustomTrickForm
          kind={creationStep}
          onCancel={() => setCreationStep('list')}
          onSaved={() => setCreationStep('list')}
        />
      </Screen>
    );
  }

  return (
    <Screen edges={['top', 'left', 'right']}>
      <ScrollArea contentContainerStyle={{ paddingBottom: 120 + BottomTabInset }}>
        <Content>
          <Eyebrow>Your trick lab</Eyebrow>
          <PageTitle>Make the next{`\n`}move yours.</PageTitle>
          <Introduction>
            Define standalone tricks or build ordered sequences, then add them to your practice list.
          </Introduction>
          <DefineButton onPress={() => setCreationStep('choose')}>Define new trick</DefineButton>

          {tricks.length === 0 ? (
            <EmptyState />
          ) : (
            <CustomTrickList
              tricks={tricks}
              onDelete={setDeletingTrick}
              onEdit={setEditingTrick}
            />
          )}
        </Content>
      </ScrollArea>
    </Screen>
  );
}

function EmptyState() {
  return (
    <EmptyPanel>
      <EmptyMarker>01</EmptyMarker>
      <EmptyTitle>Your first original starts here.</EmptyTitle>
      <EmptyCopy>
        Give a trick a name, or connect a few movements into a sequence. It will stay alongside the Kentei library without pretending to be part of it.
      </EmptyCopy>
    </EmptyPanel>
  );
}

function CustomTrickList({
  tricks,
  onDelete,
  onEdit,
}: {
  readonly tricks: readonly CustomTrick[];
  readonly onDelete: (trick: CustomTrick) => void;
  readonly onEdit: (trick: CustomTrick) => void;
}) {
  return (
    <ListSection>
      <SectionTitle>Defined by you</SectionTitle>
      <Cards>
        {tricks.map((trick, index) => (
          <CustomCard key={trick.id}>
            <CardNumber>{String(index + 1).padStart(2, '0')}</CardNumber>
            <CardContent>
              <CardMeta>
                {trick.kind === 'sequence' ? 'Sequence' : 'Standalone'} ·{' '}
                {trick.kenteiRank === undefined ? 'Unranked' : `Perceived rank ${trick.kenteiRank}`}
              </CardMeta>
              <CardName>{trick.name}</CardName>
              {trick.kind === 'sequence' ? (
                <StepPreview>{trick.steps.join('  →  ')}</StepPreview>
              ) : null}
              <CardActions>
                <CardAction
                  accessibilityLabel={`Edit ${trick.name}`}
                  accessibilityRole="button"
                  onPress={() => onEdit(trick)}>
                  <CardActionText>Edit</CardActionText>
                </CardAction>
                <CardAction
                  accessibilityLabel={`Delete ${trick.name}`}
                  accessibilityRole="button"
                  onPress={() => onDelete(trick)}>
                  <DeleteActionText>Delete</DeleteActionText>
                </CardAction>
              </CardActions>
            </CardContent>
          </CustomCard>
        ))}
      </Cards>
    </ListSection>
  );
}

function ChoiceScreen({
  onCancel,
  onChoose,
}: {
  readonly onCancel: () => void;
  readonly onChoose: (kind: CustomTrick['kind']) => void;
}) {
  return (
    <CenteredContent>
      <Eyebrow>Define new trick</Eyebrow>
      <CenteredTitle>What are you{`\n`}building?</CenteredTitle>
      <CenteredCopy>Choose the shape first. You can add an optional perceived Kentei rank next.</CenteredCopy>
      <TypeChoices>
        <TypeChoice accessibilityRole="button" onPress={() => onChoose('standalone')}>
          <TypeNumber>01</TypeNumber>
          <TypeTitle>Standalone trick</TypeTitle>
          <TypeCopy>One original movement or landing with its own name.</TypeCopy>
          <TypeArrow>→</TypeArrow>
        </TypeChoice>
        <TypeChoice accessibilityRole="button" onPress={() => onChoose('sequence')}>
          <TypeNumber>02</TypeNumber>
          <TypeTitle>Sequence</TypeTitle>
          <TypeCopy>Two or more ordered, free-text movements practiced as one line.</TypeCopy>
          <TypeArrow>→</TypeArrow>
        </TypeChoice>
      </TypeChoices>
      <CancelButton variant="secondary" size="medium" onPress={onCancel}>Cancel</CancelButton>
    </CenteredContent>
  );
}

function CustomTrickForm({
  initialTrick,
  kind,
  onCancel,
  onSaved,
}: {
  readonly initialTrick?: CustomTrick;
  readonly kind: CustomTrick['kind'];
  readonly onCancel: () => void;
  readonly onSaved: () => void;
}) {
  const { addCustomTrick, updateCustomTrick } = useCustomTrickActions();
  const [name, setName] = useState(initialTrick?.name ?? '');
  const [kenteiRank, setKenteiRank] = useState(
    initialTrick?.kenteiRank === undefined ? '' : String(initialTrick.kenteiRank),
  );
  const [steps, setSteps] = useState(
    initialTrick?.kind === 'sequence' ? [...initialTrick.steps] : ['', ''],
  );
  const draft = useMemo<CustomTrickDraft>(
    () =>
      kind === 'sequence'
        ? { kind, name, kenteiRank, steps }
        : { kind, name, kenteiRank },
    [kenteiRank, kind, name, steps],
  );
  const validation = validateCustomTrickDraft(draft);
  const errors = validation.status === 'invalid' ? validation.errors : {};

  const updateStep = (index: number, value: string) => {
    setSteps((current) => current.map((step, stepIndex) => stepIndex === index ? value : step));
  };

  const moveStep = (index: number, direction: -1 | 1) => {
    const destination = index + direction;
    if (destination < 0 || destination >= steps.length) return;
    setSteps((current) => {
      const reordered = [...current];
      [reordered[index], reordered[destination]] = [reordered[destination], reordered[index]];
      return reordered;
    });
  };

  const removeStep = (index: number) => {
    setSteps((current) => current.filter((_, stepIndex) => stepIndex !== index));
  };

  const save = () => {
    const result = initialTrick
      ? updateCustomTrick(initialTrick.id, draft)
      : addCustomTrick(draft);
    if (result.status === 'saved') onSaved();
  };

  return (
    <FormScroll keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 120 + BottomTabInset }}>
      <FormContent>
        <Eyebrow>{initialTrick ? 'Edit' : 'New'} {kind === 'sequence' ? 'sequence' : 'standalone trick'}</Eyebrow>
        <PageTitle>{initialTrick ? 'Refine the work.' : 'Name the work.'}</PageTitle>
        <Introduction>
          {kind === 'sequence'
            ? 'Build the line in the exact order you want to practice it.'
            : 'Give this movement a clear name you will recognize during a sesh.'}
        </Introduction>

        <Field>
          <FieldLabel>{kind === 'sequence' ? 'Sequence name' : 'Trick name'}</FieldLabel>
          <FieldInput
            accessibilityLabel={kind === 'sequence' ? 'Sequence name' : 'Trick name'}
            autoCapitalize="sentences"
            maxLength={80}
            onChangeText={setName}
            placeholder={kind === 'sequence' ? 'e.g. Morning line' : 'e.g. Stilt flip'}
            placeholderTextColor={AppColors.textSubtle}
            value={name}
          />
          {errors.name ? <ErrorText>{errors.name}</ErrorText> : null}
        </Field>

        {kind === 'sequence' ? (
          <Field>
            <FieldLabel>Ordered steps</FieldLabel>
            <FieldHint>Use at least two named movements. Reorder them before saving.</FieldHint>
            <Steps>
              {steps.map((step, index) => (
                <StepRow key={index}>
                  <StepNumber>{String(index + 1).padStart(2, '0')}</StepNumber>
                  <StepInput
                    accessibilityLabel={`Sequence step ${index + 1}`}
                    maxLength={80}
                    onChangeText={(value) => updateStep(index, value)}
                    placeholder="Movement or trick"
                    placeholderTextColor={AppColors.textSubtle}
                    value={step}
                  />
                  <StepActions>
                    <StepAction
                      accessibilityLabel={`Move step ${index + 1} up`}
                      accessibilityRole="button"
                      disabled={index === 0}
                      onPress={() => moveStep(index, -1)}>
                      <StepActionText>↑</StepActionText>
                    </StepAction>
                    <StepAction
                      accessibilityLabel={`Move step ${index + 1} down`}
                      accessibilityRole="button"
                      disabled={index === steps.length - 1}
                      onPress={() => moveStep(index, 1)}>
                      <StepActionText>↓</StepActionText>
                    </StepAction>
                    <StepAction
                      accessibilityLabel={`Remove step ${index + 1}`}
                      accessibilityRole="button"
                      onPress={() => removeStep(index)}>
                      <RemoveText>×</RemoveText>
                    </StepAction>
                  </StepActions>
                </StepRow>
              ))}
            </Steps>
            <AddStepButton variant="secondary" size="medium" onPress={() => setSteps((current) => [...current, ''])}>
              Add step
            </AddStepButton>
            {errors.steps ? <ErrorText>{errors.steps}</ErrorText> : null}
          </Field>
        ) : null}

        <Field>
          <FieldLabel>Perceived Kentei rank · optional</FieldLabel>
          <FieldHint>Enter a whole rank from 1 to 12, or leave this trick in the Custom section.</FieldHint>
          <RankInput
            accessibilityLabel="Perceived Kentei rank"
            inputMode="numeric"
            keyboardType="number-pad"
            maxLength={2}
            onChangeText={setKenteiRank}
            placeholder="—"
            placeholderTextColor={AppColors.textSubtle}
            value={kenteiRank}
          />
          {errors.kenteiRank ? <ErrorText>{errors.kenteiRank}</ErrorText> : null}
        </Field>

        <FormActions>
          <Button fill disabled={validation.status === 'invalid'} onPress={save}>
            {initialTrick ? 'Save changes' : 'Save custom trick'}
          </Button>
          <Button fill variant="secondary" onPress={onCancel}>Cancel</Button>
        </FormActions>
      </FormContent>
    </FormScroll>
  );
}

function DeleteConfirmation({
  trick,
  onCancel,
  onDeleted,
}: {
  readonly trick: CustomTrick;
  readonly onCancel: () => void;
  readonly onDeleted: () => void;
}) {
  const { deleteCustomTrick } = useCustomTrickActions();
  const { removeSelectedTrick } = useUserProfileActions();

  const confirmDelete = () => {
    deleteCustomTrick(trick.id);
    removeSelectedTrick(trick.id);
    onDeleted();
  };

  return (
    <CenteredContent>
      <Eyebrow>Delete custom trick</Eyebrow>
      <CenteredTitle>Remove “{trick.name}”?</CenteredTitle>
      <CenteredCopy>
        It will leave your trick library and current practice list. Completed Sesh records and Stats history will stay intact.
      </CenteredCopy>
      <DeleteActions>
        <Button fill onPress={confirmDelete}>Delete custom trick</Button>
        <Button fill variant="secondary" onPress={onCancel}>Keep this trick</Button>
      </DeleteActions>
    </CenteredContent>
  );
}

const ScrollArea = styled(ScrollView)`flex: 1; width: 100%;`;
const Content = styled.View`width: 100%; max-width: 760px; align-self: center; padding: 38px 22px 0;`;
const PageTitle = styled(DisplayTitle)`margin-top: 12px;`;
const Introduction = styled(BodyText)`max-width: 580px; margin-top: 16px;`;
const DefineButton = styled(Button).attrs({ size: 'medium' })`align-self: flex-start; margin-top: 26px;`;
const EmptyPanel = styled.View`max-width: 600px; margin-top: 42px; background-color: ${AppColors.paper}; border-left-width: 6px; border-left-color: ${AppColors.red}; padding: 24px;`;
const EmptyMarker = styled.Text`color: ${AppColors.red}; font-size: 12px; font-weight: 900; letter-spacing: 1.5px;`;
const EmptyTitle = styled.Text`color: ${AppColors.ink}; font-size: 24px; font-weight: 900; margin-top: 8px;`;
const EmptyCopy = styled.Text`color: ${AppColors.textMuted}; font-size: 15px; font-weight: 600; line-height: 22px; margin-top: 10px;`;
const ListSection = styled.View`margin-top: 42px;`;
const SectionTitle = styled.Text`color: ${AppColors.red}; font-size: 13px; font-weight: 900; letter-spacing: 1.5px; text-transform: uppercase;`;
const Cards = styled.View`gap: 12px; margin-top: 12px;`;
const CustomCard = styled.View`flex-direction: row; gap: 16px; background-color: ${AppColors.paper}; border: 2px solid ${AppColors.ink}; padding: 18px;`;
const CardNumber = styled.Text`color: ${AppColors.red}; font-size: 12px; font-weight: 900; letter-spacing: 1px; margin-top: 4px;`;
const CardContent = styled.View`flex: 1;`;
const CardMeta = styled.Text`color: ${AppColors.red}; font-size: 10px; font-weight: 900; letter-spacing: 1px; text-transform: uppercase;`;
const CardName = styled.Text`color: ${AppColors.ink}; font-size: 22px; font-weight: 900; margin-top: 4px;`;
const StepPreview = styled.Text`color: ${AppColors.textMuted}; font-size: 13px; font-weight: 700; line-height: 19px; margin-top: 10px;`;
const CardActions = styled.View`flex-direction: row; gap: 16px; margin-top: 14px;`;
const CardAction = styled(Pressable)`min-height: 44px; align-items: center; justify-content: center; padding: 6px 0;`;
const CardActionText = styled.Text`color: ${AppColors.ink}; font-size: 12px; font-weight: 900; text-transform: uppercase;`;
const DeleteActionText = styled(CardActionText)`color: ${AppColors.red};`;
const CenteredContent = styled.View`flex: 1; width: 100%; max-width: 760px; align-self: center; align-items: center; justify-content: center; padding: 40px 22px 120px;`;
const CenteredTitle = styled(DisplayTitle)`margin-top: 12px; text-align: center;`;
const CenteredCopy = styled(BodyText)`max-width: 500px; margin-top: 16px; text-align: center;`;
const TypeChoices = styled.View`width: 100%; flex-direction: row; flex-wrap: wrap; gap: 12px; margin-top: 30px;`;
const TypeChoice = styled(Pressable)`min-width: 260px; flex: 1; min-height: 190px; background-color: ${AppColors.paper}; border: 2px solid ${AppColors.ink}; padding: 22px 56px 22px 22px; position: relative;`;
const TypeNumber = styled.Text`color: ${AppColors.red}; font-size: 12px; font-weight: 900; letter-spacing: 1.5px;`;
const TypeTitle = styled.Text`color: ${AppColors.ink}; font-size: 23px; font-weight: 900; margin-top: 14px;`;
const TypeCopy = styled.Text`color: ${AppColors.textMuted}; font-size: 14px; font-weight: 600; line-height: 21px; margin-top: 8px;`;
const TypeArrow = styled.Text`position: absolute; right: 20px; bottom: 18px; color: ${AppColors.ink}; font-size: 28px; font-weight: 900;`;
const CancelButton = styled(Button)`margin-top: 24px;`;
const FormScroll = styled(ScrollView)`flex: 1; width: 100%;`;
const FormContent = styled.View`width: 100%; max-width: 680px; align-self: center; padding: 38px 22px 0;`;
const Field = styled.View`margin-top: 28px;`;
const FieldLabel = styled.Text`color: ${AppColors.ink}; font-size: 13px; font-weight: 900; letter-spacing: 1px; text-transform: uppercase;`;
const FieldHint = styled.Text`color: ${AppColors.textMuted}; font-size: 12px; font-weight: 650; line-height: 18px; margin-top: 5px;`;
const FieldInput = styled(TextInput)`min-height: 56px; background-color: ${AppColors.paper}; border: 2px solid ${AppColors.ink}; color: ${AppColors.ink}; font-size: 18px; font-weight: 800; margin-top: 8px; padding: 12px 14px;`;
const RankInput = styled(FieldInput)`width: 100px; font-variant: tabular-nums;`;
const ErrorText = styled.Text`color: ${AppColors.red}; font-size: 12px; font-weight: 800; margin-top: 7px;`;
const Steps = styled.View`gap: 10px; margin-top: 10px;`;
const StepRow = styled.View`flex-direction: row; align-items: center; gap: 8px;`;
const StepNumber = styled.Text`width: 24px; color: ${AppColors.red}; font-size: 11px; font-weight: 900;`;
const StepInput = styled(TextInput)`min-width: 120px; flex: 1; min-height: 48px; background-color: ${AppColors.paper}; border: 2px solid ${AppColors.ink}; color: ${AppColors.ink}; font-size: 15px; font-weight: 750; padding: 9px 11px;`;
const StepActions = styled.View`flex-direction: row; gap: 4px;`;
const StepAction = styled(Pressable)`width: 34px; height: 40px; align-items: center; justify-content: center; border: 1px solid ${AppColors.ink}; opacity: ${({ disabled }) => disabled ? 0.3 : 1};`;
const StepActionText = styled.Text`color: ${AppColors.ink}; font-size: 17px; font-weight: 900;`;
const RemoveText = styled.Text`color: ${AppColors.red}; font-size: 22px; font-weight: 900;`;
const AddStepButton = styled(Button)`align-self: flex-start; margin-top: 12px;`;
const FormActions = styled.View`gap: 10px; margin-top: 36px;`;
const DeleteActions = styled.View`width: 100%; max-width: 420px; gap: 10px; margin-top: 30px;`;
