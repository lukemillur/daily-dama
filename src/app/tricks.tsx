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
  type SequenceStep,
  selectSequenceStepCandidates,
  validateCustomTrickDraft,
} from '@/features/custom-tricks/model/custom-trick';
import {
  useCustomTrickActions,
  useCustomTricks,
} from '@/features/custom-tricks/state/custom-trick-provider';
import { TrickGoalsScreen } from '@/features/goals/components/trick-goals-screen';
import { TrickNotesScreen } from '@/features/notes/components/trick-notes-screen';
import { useRequireOnboarding } from '@/features/onboarding/state/require-onboarding';
import {
  useUserProfile,
  useUserProfileActions,
} from '@/features/profile/state/user-profile-provider';
import { usePracticeHistory } from '@/features/stats/state/practice-history-provider';
import { LacedTricksScreen } from '@/features/tricks/components/laced-tricks-screen';
import { TrickDirectory } from '@/features/tricks/components/trick-directory';
import { KENDAMA_KENTEI_TRICKS } from '@/features/tricks/data/kendama-kentei-tricks';
import {
  createProfileDirectoryTricks,
  type DirectoryTrick,
  selectEffectiveUnlockedTrickIds,
  selectLacedCountByTrickId,
  selectUnlockedTrickIds,
} from '@/features/tricks/model/trick-directory';
import type { PracticeTrick } from '@/features/tricks/model/trick';

export default function TricksScreen() {
  const isOnboardingComplete = useRequireOnboarding();
  const { tricks } = useCustomTricks();
  const { selectedTrickIds, manuallyUnlockedTrickIds = [] } = useUserProfile();
  const { toggleSelectedTrick, toggleManualUnlock } = useUserProfileActions();
  const { sessions } = usePracticeHistory();
  const [creationStep, setCreationStep] = useState<'list' | 'choose' | CustomTrick['kind']>('list');
  const [editingTrick, setEditingTrick] = useState<CustomTrick | undefined>(undefined);
  const [deletingTrick, setDeletingTrick] = useState<CustomTrick | undefined>(undefined);
  const [notesTrick, setNotesTrick] = useState<DirectoryTrick | undefined>(undefined);
  const [goalsTrick, setGoalsTrick] = useState<DirectoryTrick | undefined>(undefined);
  const [showLacedTricks, setShowLacedTricks] = useState(false);
  const directoryTricks = useMemo(
    () => createProfileDirectoryTricks(KENDAMA_KENTEI_TRICKS, tricks),
    [tricks],
  );
  const lacedCountByTrickId = useMemo(() => selectLacedCountByTrickId(sessions), [sessions]);
  const lacedUnlockedTrickIds = useMemo(() => selectUnlockedTrickIds(sessions), [sessions]);
  const unlockedTrickIds = useMemo(
    () => selectEffectiveUnlockedTrickIds(lacedUnlockedTrickIds, manuallyUnlockedTrickIds),
    [lacedUnlockedTrickIds, manuallyUnlockedTrickIds],
  );

  if (!isOnboardingComplete) return null;

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

  if (notesTrick) {
    return (
      <Screen edges={['top', 'left', 'right']}>
        <TrickNotesScreen
          trickId={notesTrick.id}
          trickName={notesTrick.name}
          onClose={() => setNotesTrick(undefined)}
        />
      </Screen>
    );
  }

  if (goalsTrick) {
    return (
      <Screen edges={['top', 'left', 'right']}>
        <TrickGoalsScreen
          trickId={goalsTrick.id}
          trickName={goalsTrick.name}
          onClose={() => setGoalsTrick(undefined)}
        />
      </Screen>
    );
  }

  if (showLacedTricks) {
    return (
      <Screen edges={['top', 'left', 'right']}>
        <LacedTricksScreen
          tricks={directoryTricks}
          unlockedTrickIds={unlockedTrickIds}
          onToggleTrick={toggleManualUnlock}
          onClose={() => setShowLacedTricks(false)}
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
    <Screen align="center" edges={['left', 'right']} includeWebHeaderInset={false}>
      <DirectoryContent>
        <TrickDirectory
          tricks={directoryTricks}
          hideScrollIndicator
          showFocusedSection
          lacedCountByTrickId={lacedCountByTrickId}
          unlockedTrickIds={unlockedTrickIds}
          manualUnlock={{ manuallyUnlockedTrickIds, onToggle: toggleManualUnlock }}
          selection={{ selectedTrickIds, onToggleTrick: toggleSelectedTrick }}
          customActions={{
            onEdit: (trickId) => setEditingTrick(tricks.find((trick) => trick.id === trickId)),
            onDelete: (trickId) => setDeletingTrick(tricks.find((trick) => trick.id === trickId)),
          }}
          notesAction={{ onOpen: setNotesTrick }}
          goalsAction={{ onOpen: setGoalsTrick }}
          practiceAction
          header={{
            eyebrow: 'Your trick lab',
            title: 'Choose the next\nmove.',
            introduction:
              selectedTrickIds.length === 0
                ? 'Build your practice list from the Kentei library or define something entirely your own.'
                : `${selectedTrickIds.length} ${selectedTrickIds.length === 1 ? 'trick' : 'tricks'} ready for focused practice.`,
          }}
          headerAction={
            <HeaderActions>
              <DefineButton onPress={() => setCreationStep('choose')}>Define new trick</DefineButton>
              <LacedTricksButton variant="secondary" onPress={() => setShowLacedTricks(true)}>
                Laced tricks
              </LacedTricksButton>
            </HeaderActions>
          }
        />
      </DirectoryContent>
    </Screen>
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
  const { tricks: customTricks } = useCustomTricks();
  const { selectedTrickIds } = useUserProfile();
  const { toggleSelectedTrick, removeSelectedTrick } = useUserProfileActions();
  const [name, setName] = useState(initialTrick?.name ?? '');
  const [kenteiRank, setKenteiRank] = useState<number | undefined>(initialTrick?.kenteiRank);
  const [addToFocusedTricks, setAddToFocusedTricks] = useState(
    initialTrick ? selectedTrickIds.includes(initialTrick.id) : true,
  );
  const [steps, setSteps] = useState(
    initialTrick?.kind === 'sequence'
      ? [...initialTrick.steps]
      : [
          { kind: 'customText', name: '' } as const,
          { kind: 'customText', name: '' } as const,
        ],
  );
  const [trickSearch, setTrickSearch] = useState('');
  const selectableTricks = useMemo(
    () => selectSequenceStepCandidates(KENDAMA_KENTEI_TRICKS, customTricks),
    [customTricks],
  );
  const filteredSelectableTricks = useMemo(() => {
    const query = trickSearch.trim().toLocaleLowerCase();
    return query.length === 0
      ? selectableTricks.slice(0, 8)
      : selectableTricks
          .filter((trick) => trick.name.toLocaleLowerCase().includes(query))
          .slice(0, 12);
  }, [selectableTricks, trickSearch]);
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
    setSteps((current) => current.map((step, stepIndex) =>
      stepIndex === index && step.kind === 'customText' ? { ...step, name: value } : step,
    ));
  };

  const addExistingStep = (trick: PracticeTrick) => {
    const step: SequenceStep = {
      kind: 'existingTrick',
      sourceTrickId: trick.id,
      name: trick.name,
    };
    setSteps((current) => [...current, step]);
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
    if (result.status !== 'saved') return;

    const isCurrentlyFocused = selectedTrickIds.includes(result.trick.id);
    if (addToFocusedTricks && !isCurrentlyFocused) toggleSelectedTrick(result.trick.id);
    else if (!addToFocusedTricks && isCurrentlyFocused) removeSelectedTrick(result.trick.id);

    onSaved();
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
            <FieldHint>Mix saved tricks with your own movements. Use at least two steps.</FieldHint>
            <Steps>
              {steps.map((step, index) => (
                <StepRow key={`${step.kind}-${index}`}>
                  <StepNumber>{String(index + 1).padStart(2, '0')}</StepNumber>
                  {step.kind === 'customText' ? (
                    <StepInput
                      accessibilityLabel={`Custom sequence step ${index + 1}`}
                      maxLength={80}
                      onChangeText={(value) => updateStep(index, value)}
                      placeholder="Custom movement"
                      placeholderTextColor={AppColors.textSubtle}
                      value={step.name}
                    />
                  ) : (
                    <ReferencedStep>
                      <ReferencedMeta>Saved trick</ReferencedMeta>
                      <ReferencedName>{step.name}</ReferencedName>
                    </ReferencedStep>
                  )}
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
            <AddStepButton variant="secondary" size="medium" onPress={() => setSteps((current) => [...current, { kind: 'customText', name: '' }])}>
              Add custom step
            </AddStepButton>
            {errors.steps ? <ErrorText>{errors.steps}</ErrorText> : null}

            <ExistingPicker>
              <FieldLabel>Choose an existing trick</FieldLabel>
              <FieldHint>Standard tricks and standalone custom tricks are available. Sequences cannot be nested.</FieldHint>
              <SearchInput
                accessibilityLabel="Search existing tricks"
                onChangeText={setTrickSearch}
                placeholder="Search the trick library"
                placeholderTextColor={AppColors.textSubtle}
                value={trickSearch}
              />
              <SearchResults>
                {filteredSelectableTricks.map((trick) => (
                  <SearchResult
                    key={trick.id}
                    accessibilityLabel={`Add ${trick.name} to sequence`}
                    accessibilityRole="button"
                    onPress={() => addExistingStep(trick)}>
                    <SearchResultIdentity>
                      <SearchResultName>{trick.name}</SearchResultName>
                      <SearchResultMeta>{'kind' in trick ? 'Custom trick' : `Rank ${trick.kenteiRank}`}</SearchResultMeta>
                    </SearchResultIdentity>
                    <SearchResultAdd>Add +</SearchResultAdd>
                  </SearchResult>
                ))}
              </SearchResults>
            </ExistingPicker>
          </Field>
        ) : null}

        <Field>
          <FieldLabel>Perceived Kentei rank · optional</FieldLabel>
          <FieldHint>Place it where it feels right today, or keep it unranked in your Custom section.</FieldHint>
          <KenteiRankPicker selectedRank={kenteiRank} onSelect={setKenteiRank} />
          {errors.kenteiRank ? <ErrorText>{errors.kenteiRank}</ErrorText> : null}
        </Field>

        <Field>
          <FieldLabel>Focused tricks</FieldLabel>
          <FieldHint>Focused tricks appear in your Sesh practice list.</FieldHint>
          <FocusedTrickToggle
            addToFocusedTricks={addToFocusedTricks}
            onToggle={() => setAddToFocusedTricks((current) => !current)}
          />
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

const RANK_GROUPS = [
  { label: 'Basic', ranks: [1, 2, 3], colors: ['#dce7a6', '#d5df8c', '#ced775'] },
  { label: 'Advanced', ranks: [4, 5, 6], colors: ['#eccd65', '#e9bd55', '#e5aa48'] },
  { label: 'Expert', ranks: [7, 8, 9], colors: ['#df923e', '#da7836', '#d46030'] },
  { label: 'Master', ranks: [10, 11, 12], colors: ['#c94d2d', '#b93d2d', '#a92f2c'] },
] as const;

function KenteiRankPicker({
  selectedRank,
  onSelect,
}: {
  readonly selectedRank?: number;
  readonly onSelect: (rank: number | undefined) => void;
}) {
  return (
    <RankPicker accessibilityRole="radiogroup">
      <ToggleRow
        $selected={selectedRank === undefined}
        accessibilityLabel="Unranked, place in the Custom section"
        accessibilityRole="radio"
        accessibilityState={{ checked: selectedRank === undefined }}
        onPress={() => onSelect(undefined)}>
        <ToggleMark $selected={selectedRank === undefined}>
          {selectedRank === undefined ? '✓' : '—'}
        </ToggleMark>
        <ToggleIdentity>
          <ToggleTitle $selected={selectedRank === undefined}>Unranked</ToggleTitle>
          <ToggleCopy $selected={selectedRank === undefined}>Keep it in your own progression</ToggleCopy>
        </ToggleIdentity>
      </ToggleRow>
      <RankGroups>
        {RANK_GROUPS.map((group) => (
          <RankGroup key={group.label}>
            <RankGroupLabel>{group.label}</RankGroupLabel>
            <RankChoices>
              {group.ranks.map((rank, index) => {
                const selected = selectedRank === rank;
                const standardTrick = KENDAMA_KENTEI_TRICKS.find(
                  (trick) => trick.kenteiRank === rank,
                );
                const descriptor = standardTrick
                  ? `${standardTrick.kenteiLevel}, ${standardTrick.kenteiClass}`
                  : group.label;
                return (
                  <RankChoice
                    key={rank}
                    $color={group.colors[index]}
                    $selected={selected}
                    accessibilityLabel={`Kentei rank ${rank}, ${descriptor}`}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: selected }}
                    onPress={() => onSelect(rank)}>
                    <RankNumber $darkText={rank < 10}>{rank}</RankNumber>
                    <RankCheck $darkText={rank < 10}>{selected ? '✓' : ''}</RankCheck>
                  </RankChoice>
                );
              })}
            </RankChoices>
          </RankGroup>
        ))}
      </RankGroups>
    </RankPicker>
  );
}

function FocusedTrickToggle({
  addToFocusedTricks,
  onToggle,
}: {
  readonly addToFocusedTricks: boolean;
  readonly onToggle: () => void;
}) {
  return (
    <FocusedToggleRow
      $selected={addToFocusedTricks}
      accessibilityLabel={
        addToFocusedTricks
          ? 'Added to focused tricks. Double tap to remove.'
          : 'Not added to focused tricks. Double tap to add.'
      }
      accessibilityRole="switch"
      accessibilityState={{ checked: addToFocusedTricks }}
      onPress={onToggle}>
      <ToggleMark $selected={addToFocusedTricks}>{addToFocusedTricks ? '✓' : '—'}</ToggleMark>
      <ToggleIdentity>
        <ToggleTitle $selected={addToFocusedTricks}>
          {addToFocusedTricks ? 'Added to focused tricks' : 'Not in focused tricks'}
        </ToggleTitle>
        <ToggleCopy $selected={addToFocusedTricks}>
          {addToFocusedTricks
            ? 'It will show up in your Sesh practice list.'
            : 'Keep it in your library without queuing it for practice.'}
        </ToggleCopy>
      </ToggleIdentity>
    </FocusedToggleRow>
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
  const { removeSelectedTrick, removeManualUnlock } = useUserProfileActions();

  const confirmDelete = () => {
    deleteCustomTrick(trick.id);
    removeSelectedTrick(trick.id);
    removeManualUnlock(trick.id);
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

const DirectoryContent = styled.View`width: 100%; max-width: 760px; flex: 1; overflow: hidden; background-color: ${AppColors.paper};`;
const PageTitle = styled(DisplayTitle)`margin-top: 12px;`;
const Introduction = styled(BodyText)`max-width: 580px; margin-top: 16px;`;
const HeaderActions = styled.View`flex-direction: row; flex-wrap: wrap; gap: 10px; margin-top: 26px;`;
const DefineButton = styled(Button).attrs({ size: 'medium' })`align-self: flex-start;`;
const LacedTricksButton = styled(Button).attrs({ size: 'medium' })`align-self: flex-start;`;
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
const ErrorText = styled.Text`color: ${AppColors.red}; font-size: 12px; font-weight: 800; margin-top: 7px;`;
const RankPicker = styled.View`gap: 14px; margin-top: 12px;`;
const ToggleRow = styled(Pressable)<{ readonly $selected: boolean }>`min-height: 58px; flex-direction: row; align-items: center; gap: 12px; background-color: ${({ $selected }) => $selected ? AppColors.ink : AppColors.paper}; border: 2px solid ${AppColors.ink}; padding: 10px 13px;`;
const FocusedToggleRow = styled(ToggleRow)`margin-top: 12px;`;
const ToggleMark = styled.Text<{ readonly $selected: boolean }>`width: 24px; color: ${({ $selected }) => $selected ? AppColors.yellow : AppColors.red}; font-size: 18px; font-weight: 900; text-align: center;`;
const ToggleIdentity = styled.View`flex: 1;`;
const ToggleTitle = styled.Text<{ readonly $selected: boolean }>`color: ${({ $selected }) => $selected ? AppColors.cream : AppColors.ink}; font-size: 15px; font-weight: 900;`;
const ToggleCopy = styled.Text<{ readonly $selected: boolean }>`color: ${({ $selected }) => $selected ? '#d8dfcb' : AppColors.textMuted}; font-size: 11px; font-weight: 700; margin-top: 2px;`;
const RankGroups = styled.View`flex-direction: row; flex-wrap: wrap; gap: 10px;`;
const RankGroup = styled.View`min-width: 140px; flex: 1;`;
const RankGroupLabel = styled.Text`color: ${AppColors.ink}; font-size: 10px; font-weight: 900; letter-spacing: 1px; margin-bottom: 5px; text-transform: uppercase;`;
const RankChoices = styled.View`flex-direction: row; gap: 4px;`;
const RankChoice = styled(Pressable)<{ readonly $color: string; readonly $selected: boolean }>`min-width: 42px; flex: 1; height: 52px; flex-direction: row; align-items: center; justify-content: center; background-color: ${({ $color }) => $color}; border: ${({ $selected }) => $selected ? '4px' : '1px'} solid ${AppColors.ink}; position: relative;`;
const RankNumber = styled.Text<{ readonly $darkText: boolean }>`color: ${({ $darkText }) => $darkText ? AppColors.ink : AppColors.cream}; font-size: 17px; font-weight: 900;`;
const RankCheck = styled.Text<{ readonly $darkText: boolean }>`position: absolute; right: 2px; top: 0; color: ${({ $darkText }) => $darkText ? AppColors.ink : AppColors.cream}; font-size: 9px; font-weight: 900;`;
const Steps = styled.View`gap: 10px; margin-top: 10px;`;
const StepRow = styled.View`flex-direction: row; align-items: center; gap: 8px;`;
const StepNumber = styled.Text`width: 24px; color: ${AppColors.red}; font-size: 11px; font-weight: 900;`;
const StepInput = styled(TextInput)`min-width: 120px; flex: 1; min-height: 48px; background-color: ${AppColors.paper}; border: 2px solid ${AppColors.ink}; color: ${AppColors.ink}; font-size: 15px; font-weight: 750; padding: 9px 11px;`;
const ReferencedStep = styled.View`min-width: 120px; flex: 1; min-height: 48px; justify-content: center; background-color: #e5edcf; border: 2px solid ${AppColors.ink}; padding: 7px 11px;`;
const ReferencedMeta = styled.Text`color: ${AppColors.red}; font-size: 9px; font-weight: 900; letter-spacing: 0.8px; text-transform: uppercase;`;
const ReferencedName = styled.Text`color: ${AppColors.ink}; font-size: 15px; font-weight: 800; margin-top: 2px;`;
const StepActions = styled.View`flex-direction: row; gap: 4px;`;
const StepAction = styled(Pressable)`width: 34px; height: 40px; align-items: center; justify-content: center; border: 1px solid ${AppColors.ink}; opacity: ${({ disabled }) => disabled ? 0.3 : 1};`;
const StepActionText = styled.Text`color: ${AppColors.ink}; font-size: 17px; font-weight: 900;`;
const RemoveText = styled.Text`color: ${AppColors.red}; font-size: 22px; font-weight: 900;`;
const AddStepButton = styled(Button)`align-self: flex-start; margin-top: 12px;`;
const ExistingPicker = styled.View`margin-top: 26px;`;
const SearchInput = styled(FieldInput)`min-height: 50px; font-size: 15px;`;
const SearchResults = styled.View`gap: 6px; margin-top: 8px;`;
const SearchResult = styled(Pressable)`min-height: 50px; flex-direction: row; align-items: center; gap: 12px; background-color: ${AppColors.paper}; border: 1px solid ${AppColors.ink}; padding: 9px 12px;`;
const SearchResultIdentity = styled.View`flex: 1;`;
const SearchResultName = styled.Text`color: ${AppColors.ink}; font-size: 14px; font-weight: 800;`;
const SearchResultMeta = styled.Text`color: ${AppColors.textMuted}; font-size: 10px; font-weight: 800; margin-top: 2px; text-transform: uppercase;`;
const SearchResultAdd = styled.Text`color: ${AppColors.red}; font-size: 12px; font-weight: 900; text-transform: uppercase;`;
const FormActions = styled.View`gap: 10px; margin-top: 36px;`;
const DeleteActions = styled.View`width: 100%; max-width: 420px; gap: 10px; margin-top: 30px;`;
