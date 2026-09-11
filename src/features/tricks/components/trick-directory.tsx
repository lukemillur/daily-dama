import { Link } from 'expo-router';
import { type ReactElement, useMemo, useState } from 'react';
import { Pressable, SectionList, type SectionListData } from 'react-native';
import { css, styled } from 'styled-components/native';

import { TextField } from '@/components/ui/text-field';
import {
  createTrickSections,
  type DirectoryTrick,
  isCustomDirectoryTrick,
  type TrickSection,
} from '@/features/tricks/model/trick-directory';

export interface TrickDirectoryProps {
  readonly tricks: readonly DirectoryTrick[];
  readonly selection?: {
    readonly selectedTrickIds: readonly string[];
    readonly onToggleTrick: (trickId: string) => void;
  };
  readonly header?: {
    readonly eyebrow: string;
    readonly title: string;
    readonly introduction: string;
  };
  readonly headerAction?: ReactElement;
  readonly search?: {
    readonly query: string;
    readonly onChangeText: (query: string) => void;
    readonly placeholder?: string;
  };
  readonly onActivate?: (trick: DirectoryTrick) => void;
  readonly customActions?: {
    readonly onEdit: (trickId: string) => void;
    readonly onDelete: (trickId: string) => void;
  };
  readonly notesAction?: {
    readonly onOpen: (trick: DirectoryTrick) => void;
  };
  readonly goalsAction?: {
    readonly onOpen: (trick: DirectoryTrick) => void;
  };
  readonly practiceAction?: true;
  readonly footer?: ReactElement;
  readonly fixedHeader?: boolean;
  readonly fixedFooter?: boolean;
  readonly showFocusedSection?: boolean;
  /**
   * The persisted profile focus list to section by when `showFocusedSection`
   * is set. Defaults to `selection.selectedTrickIds` so callers like the
   * Tricks screen — where the selection genuinely *is* the focus list — can
   * omit it. Callers whose `selection` represents a separate, transient pick
   * (e.g. an ad hoc multi-trick run) must pass this explicitly so sectioning
   * isn't driven by in-progress selection.
   */
  readonly focusedTrickIds?: readonly string[];
  readonly lacedCountByTrickId?: ReadonlyMap<string, number>;
  readonly noteCountByTrickId?: ReadonlyMap<string, number>;
  readonly goalCountByTrickId?: ReadonlyMap<string, number>;
  readonly unlockedTrickIds?: ReadonlySet<string>;
}

const DEFAULT_HEADER = {
  eyebrow: 'Trick library',
  title: 'Every trick.\nOne clear path.',
  introduction: (trickCount: number) =>
    `Browse all ${trickCount} Kendama Kentei challenges, ordered from foundational catches to master combinations.`,
};

const NO_SELECTED_TRICKS: readonly string[] = [];

// react-native-web implements `stickySectionHeadersEnabled` with CSS `position: sticky` applied to
// each section header individually, not to a wrapper spanning the whole section. A stuck header
// never truly hands off to the next one — it stays glued to the top and is simply painted over once
// a later header also becomes stuck — so a section's own trailing row can still be laid out in the
// same on-screen band its still-stuck header occupies. Right at a section boundary that can produce
// a visibly squeezed frame: the outgoing header covering the last row's text while the incoming
// header is already visible just below. This gap is intentionally kept shorter than a header
// (visual compactness over fully eliminating that scroll-transition overlap).
const SECTION_BOUNDARY_HEIGHT = 8;

export function TrickDirectory({
  tricks,
  selection,
  header,
  headerAction,
  search,
  onActivate,
  customActions,
  notesAction,
  goalsAction,
  practiceAction,
  footer,
  fixedHeader = false,
  fixedFooter = false,
  showFocusedSection = false,
  focusedTrickIds,
  lacedCountByTrickId,
  noteCountByTrickId,
  goalCountByTrickId,
  unlockedTrickIds,
}: TrickDirectoryProps) {
  const selectedTrickIds = selection?.selectedTrickIds ?? NO_SELECTED_TRICKS;
  const sectioningTrickIds = focusedTrickIds ?? selectedTrickIds;
  const sections = useMemo(
    () => {
      const normalizedQuery = search?.query.trim().toLowerCase() ?? '';
      const visibleTricks = normalizedQuery.length === 0
        ? tricks
        : tricks.filter((trick) => trick.name.toLowerCase().includes(normalizedQuery));
      const shouldSectionByFocus = showFocusedSection && normalizedQuery.length === 0;
      return createTrickSections(visibleTricks, shouldSectionByFocus ? sectioningTrickIds : undefined);
    },
    [tricks, search?.query, showFocusedSection, sectioningTrickIds],
  );
  const selectedTrickIdSet = useMemo(() => new Set(selectedTrickIds), [selectedTrickIds]);
  const directoryHeader = (
    <DirectoryHeader $compact={fixedHeader}>
      <Eyebrow>{header?.eyebrow ?? DEFAULT_HEADER.eyebrow}</Eyebrow>
      <Title>{header?.title ?? DEFAULT_HEADER.title}</Title>
      <Introduction>{header?.introduction ?? DEFAULT_HEADER.introduction(tricks.length)}</Introduction>
      {headerAction}
      {search ? (
        <TextField
          accessibilityLabel="Search tricks"
          label="Search"
          onChangeText={search.onChangeText}
          placeholder={search.placeholder ?? 'Search tricks'}
          value={search.query}
        />
      ) : null}
    </DirectoryHeader>
  );

  const directoryList = (
    <SectionList
      sections={sections}
      extraData={{
        selectedTrickIds,
        lacedCountByTrickId,
        noteCountByTrickId,
        goalCountByTrickId,
        unlockedTrickIds,
        notesAction,
        goalsAction,
        practiceAction,
      }}
      keyExtractor={(trick) => trick.id}
      stickySectionHeadersEnabled
      // Always hidden. On web react-native-web turns `showsVerticalScrollIndicator={false}`
      // into a real CSS hide on the scrolling element (`scrollbar-width: none` plus
      // `::-webkit-scrollbar { display: none }`), so no extra web-only CSS is needed here.
      // The list still scrolls by wheel, trackpad, touch drag, and keyboard.
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ paddingBottom: fixedFooter ? 0 : 24 }}
      ListHeaderComponent={fixedHeader ? undefined : directoryHeader}
      ListFooterComponent={fixedFooter ? undefined : footer}
      renderSectionHeader={({ section }) => <SectionHeader section={section} />}
      renderSectionFooter={({ section }) =>
        section.kind === 'focused' && section.data.length === 0 ? <FocusedEmptyState /> : null
      }
      renderItem={({ item, index }) => (
        <TrickRow
          trick={item}
          position={index + 1}
          isSelected={selectedTrickIdSet.has(item.id)}
          onToggle={selection ? () => selection.onToggleTrick(item.id) : undefined}
          onEdit={isCustomDirectoryTrick(item) && customActions ? () => customActions.onEdit(item.id) : undefined}
          onDelete={isCustomDirectoryTrick(item) && customActions ? () => customActions.onDelete(item.id) : undefined}
          onOpenNotes={notesAction ? () => notesAction.onOpen(item) : undefined}
          onOpenGoals={goalsAction ? () => goalsAction.onOpen(item) : undefined}
          onActivate={onActivate ? () => onActivate(item) : undefined}
          showPracticeAction={Boolean(practiceAction)}
          lacedCount={lacedCountByTrickId?.get(item.id) ?? 0}
          noteCount={noteCountByTrickId?.get(item.id) ?? 0}
          goalCount={goalCountByTrickId?.get(item.id) ?? 0}
          isLaced={unlockedTrickIds?.has(item.id) ?? false}
        />
      )}
      ListEmptyComponent={search?.query.trim() ? <SearchEmptyState>No tricks match your search.</SearchEmptyState> : null}
      ItemSeparatorComponent={ItemSeparator}
      SectionSeparatorComponent={SectionSeparator}
    />
  );

  return fixedHeader || fixedFooter ? (
    <DirectoryLayout>
      {fixedHeader ? directoryHeader : null}
      <ListContainer>{directoryList}</ListContainer>
      {fixedFooter && footer ? <FixedFooter>{footer}</FixedFooter> : null}
    </DirectoryLayout>
  ) : (
    directoryList
  );
}

function SectionHeader({
  section,
}: {
  readonly section: SectionListData<DirectoryTrick, TrickSection>;
}) {
  const isCustom = section.kind === 'custom';
  return (
    <SectionHeaderContainer $custom={isCustom}>
      <RankLabel $custom={isCustom}>
        {section.kind === 'custom' ? 'Custom' : section.kind === 'focused' ? 'Focused tricks' : `Rank ${section.rank}`}
      </RankLabel>
      <LevelLabel $custom={isCustom}>
        {section.kind === 'custom'
          ? 'Your own progression'
          : section.kind === 'focused'
            ? `${section.data.length} in rotation`
            : `${section.level} · ${section.className}`}
      </LevelLabel>
    </SectionHeaderContainer>
  );
}

function FocusedEmptyState() {
  return (
    <FocusedEmptyContainer>
      <FocusedEmptyText>
        No focused tricks yet. Tap a trick below to add it to your practice list.
      </FocusedEmptyText>
    </FocusedEmptyContainer>
  );
}

interface TrickRowProps {
  readonly trick: DirectoryTrick;
  readonly position: number;
  readonly isSelected: boolean;
  readonly onToggle?: () => void;
  readonly onEdit?: () => void;
  readonly onDelete?: () => void;
  readonly onOpenNotes?: () => void;
  readonly onOpenGoals?: () => void;
  readonly onActivate?: () => void;
  readonly showPracticeAction?: boolean;
  readonly lacedCount?: number;
  readonly noteCount?: number;
  readonly goalCount?: number;
  readonly isLaced?: boolean;
}

function TrickRow({
  trick,
  position,
  isSelected,
  onToggle,
  onEdit,
  onDelete,
  onOpenNotes,
  onOpenGoals,
  onActivate,
  showPracticeAction = false,
  lacedCount = 0,
  noteCount = 0,
  goalCount = 0,
  isLaced = false,
}: TrickRowProps) {
  const [pressed, setPressed] = useState(false);
  const customDescription = isCustomDirectoryTrick(trick)
    ? trick.customKind === 'sequence'
      ? 'custom sequence'
      : 'custom trick'
    : undefined;
  const identity = (
    <>
      <Position $laced={isLaced}>{isLaced ? '✓' : String(position).padStart(2, '0')}</Position>
      <TrickIdentity>
        <TrickNameRow>
          <TrickName>{trick.name}</TrickName>
        </TrickNameRow>
        {isCustomDirectoryTrick(trick) || lacedCount > 0 ? (
          <TrickMetaRow>
            {isCustomDirectoryTrick(trick) ? (
              <CustomLabel>{trick.customKind === 'sequence' ? 'Custom sequence' : 'Custom trick'}</CustomLabel>
            ) : null}
            {isCustomDirectoryTrick(trick) && lacedCount > 0 ? <MetaDivider>·</MetaDivider> : null}
            {lacedCount > 0 ? (
              <LacedCountLabel>
                {lacedCount} {lacedCount === 1 ? 'lace' : 'laces'}
              </LacedCountLabel>
            ) : null}
          </TrickMetaRow>
        ) : null}
      </TrickIdentity>
    </>
  );

  const identityElement = onToggle ? (
    <SelectableIdentity
      accessibilityLabel={[trick.name, customDescription, isSelected ? 'selected' : 'not selected']
        .filter(Boolean)
        .join(', ')}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: isSelected }}
      onPress={(event) => {
        event?.stopPropagation?.();
        onToggle();
      }}>
      {identity}
    </SelectableIdentity>
  ) : (
    <IdentityContainer>{identity}</IdentityContainer>
  );

  const selectionIndicatorElement = onToggle ? (
    <SelectionIndicatorButton
      accessibilityLabel={`${isSelected ? 'Deselect' : 'Select'} ${trick.name}`}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: isSelected }}
      onPress={(event) => {
        event?.stopPropagation?.();
        onToggle();
      }}>
      <SelectionIndicator $selected={isSelected}>
        <SelectionMark>{isSelected ? '✓' : ''}</SelectionMark>
      </SelectionIndicator>
    </SelectionIndicatorButton>
  ) : null;

  const hasRowActions = Boolean(onEdit && onDelete) || Boolean(onOpenNotes) || Boolean(onOpenGoals) || showPracticeAction;

  const rowActionsElement = (
    <RowActions>
      {onEdit && onDelete ? (
        <>
          <RowAction
            accessibilityLabel={`Edit ${trick.name}`}
            accessibilityRole="button"
            onPress={(event) => {
              event?.stopPropagation?.();
              onEdit();
            }}>
            <RowActionText>Edit</RowActionText>
          </RowAction>
          <RowAction
            accessibilityLabel={`Delete ${trick.name}`}
            accessibilityRole="button"
            onPress={(event) => {
              event?.stopPropagation?.();
              onDelete();
            }}>
            <DeleteActionText>Delete</DeleteActionText>
          </RowAction>
        </>
      ) : null}
      {onOpenNotes ? (
        <RowAction
          accessibilityLabel={`Notes for ${trick.name}`}
          accessibilityRole="button"
          onPress={(event) => {
            event?.stopPropagation?.();
            onOpenNotes();
          }}>
          <RowActionText>{noteCount > 0 ? `Notes — ${noteCount}` : 'Notes'}</RowActionText>
        </RowAction>
      ) : null}
      {onOpenGoals ? (
        <RowAction
          accessibilityLabel={`Goals for ${trick.name}`}
          accessibilityRole="button"
          onPress={(event) => {
            event?.stopPropagation?.();
            onOpenGoals();
          }}>
          <RowActionText>{goalCount > 0 ? `Goals — ${goalCount}` : 'Goals'}</RowActionText>
        </RowAction>
      ) : null}
      {showPracticeAction ? (
        // `Link asChild` injects its own `onPress` into the child `RowAction`, so there is no
        // clean seam here to intercept it with `stopPropagation`. `practiceAction` (Tricks-screen
        // only) and `onActivate` (goal-picker only) never coexist at any current call site, so
        // this is an accepted, documented gap. If a future call site ever combines them, this
        // seam needs revisiting.
        <Link asChild href={{ pathname: '/app/sesh', params: { trickId: trick.id, mode: 'practice' } }}>
          <RowAction accessibilityLabel={`Practice ${trick.name}`} accessibilityRole="button">
            <PracticeActionText>Practice</PracticeActionText>
          </RowAction>
        </Link>
      ) : null}
    </RowActions>
  );

  if (onActivate) {
    return (
      <ActivatableTrickRowContainer
        $selected={isSelected}
        $laced={isLaced}
        $pressed={pressed}
        accessibilityLabel={`Choose ${trick.name}`}
        accessibilityRole="button"
        onPress={onActivate}
        onPressIn={() => setPressed(true)}
        onPressOut={() => setPressed(false)}>
        {identityElement}
        {hasRowActions ? rowActionsElement : null}
        {selectionIndicatorElement}
      </ActivatableTrickRowContainer>
    );
  }

  return (
    <TrickRowContainer $selected={isSelected} $laced={isLaced}>
      {identityElement}
      {hasRowActions ? rowActionsElement : null}
      {selectionIndicatorElement}
    </TrickRowContainer>
  );
}

const DirectoryLayout = styled.View`
  flex: 1;
`;

const ListContainer = styled.View`
  flex: 1;
  padding: 0 22px;
  overflow: hidden;
`;

const FixedFooter = styled.View`
  flex-shrink: 0;
`;

const DirectoryHeader = styled.View<{ readonly $compact: boolean }>`
  gap: 14px;
  padding: ${({ $compact }) => ($compact ? '28px 22px 32px' : '122px 22px 48px')};
`;

const Eyebrow = styled.Text`
  color: #274137;
  font-size: 13px;
  font-weight: 800;
  letter-spacing: 2px;
  text-transform: uppercase;
`;

const Title = styled.Text`
  max-width: 640px;
  color: #142f27;
  font-size: 48px;
  font-weight: 900;
  letter-spacing: -1.8px;
  line-height: 51px;
`;

const Introduction = styled.Text`
  max-width: 580px;
  color: #40574e;
  font-size: 16px;
  font-weight: 600;
  line-height: 24px;
`;

const SectionHeaderContainer = styled.View<{ readonly $custom: boolean }>`
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 14px 22px;
  background-color: ${({ $custom, theme }) => ($custom ? '#d84929' : theme.accent)};
  border-top-width: 2px;
  border-bottom-width: 2px;
  border-color: #18382e;
`;

const RankLabel = styled.Text<{ readonly $custom: boolean }>`
  color: ${({ $custom }) => ($custom ? '#fff8e5' : '#18382e')};
  font-size: 20px;
  font-weight: 900;
  letter-spacing: -0.4px;
`;

const LevelLabel = styled.Text<{ readonly $custom: boolean }>`
  flex-shrink: 1;
  color: ${({ $custom }) => ($custom ? '#fff8e5' : '#274137')};
  font-size: 13px;
  font-weight: 800;
  text-align: right;
  text-transform: uppercase;
`;

const FocusedEmptyContainer = styled.View`
  padding: 18px 22px;
  background-color: #f8f1dd;
`;

const FocusedEmptyText = styled.Text`
  color: #53635d;
  font-size: 14px;
  font-weight: 650;
  line-height: 20px;
`;

const trickRowLayout = css<{ readonly $selected: boolean; readonly $laced: boolean }>`
  min-height: 66px;
  flex-direction: row;
  align-items: center;
  background-color: ${({ $selected, $laced }) => ($selected || $laced ? '#e5edcf' : '#f8f1dd')};
  border-left-width: ${({ $laced }) => ($laced ? '4px' : '0px')};
  border-left-color: ${({ $laced }) => ($laced ? '#274137' : 'transparent')};
`;

const TrickRowContainer = styled.View<{ readonly $selected: boolean; readonly $laced: boolean }>`
  ${trickRowLayout}
`;

const ActivatableTrickRowContainer = styled(Pressable)<{
  readonly $selected: boolean;
  readonly $laced: boolean;
  readonly $pressed: boolean;
}>`
  ${trickRowLayout}
  opacity: ${({ $pressed }) => ($pressed ? 0.7 : 1)};
`;

const identityLayout = css`
  min-width: 180px;
  flex: 1;
  flex-direction: row;
  align-items: center;
  gap: 18px;
  padding: 15px 22px;
`;

const IdentityContainer = styled.View`
  ${identityLayout}
`;

const SelectableIdentity = styled(Pressable)`
  ${identityLayout}
`;

const Position = styled.Text<{ readonly $laced: boolean }>`
  width: 26px;
  color: ${({ $laced }) => ($laced ? '#274137' : '#d84929')};
  font-size: 13px;
  font-weight: 900;
  letter-spacing: 1px;
`;

const TrickIdentity = styled.View`
  flex: 1;
  gap: 3px;
`;

const TrickNameRow = styled.View`
  flex-direction: row;
  align-items: center;
  gap: 8px;
`;

const TrickName = styled.Text`
  color: #18382e;
  font-size: 18px;
  font-weight: 750;
  line-height: 24px;
`;

const TrickMetaRow = styled.View`
  flex-direction: row;
  align-items: center;
  gap: 5px;
`;

const CustomLabel = styled.Text`
  color: #d84929;
  font-size: 10px;
  font-weight: 900;
  letter-spacing: 1px;
  text-transform: uppercase;
`;

const MetaDivider = styled.Text`
  color: #53635d;
  font-size: 10px;
  font-weight: 900;
`;

const LacedCountLabel = styled.Text`
  color: #53635d;
  font-size: 11px;
  font-weight: 700;
`;

const SelectionIndicatorButton = styled(Pressable)`
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  padding: 12px 22px 12px 8px;
`;

const SelectionIndicator = styled.View<{ readonly $selected: boolean }>`
  width: 25px;
  height: 25px;
  align-items: center;
  justify-content: center;
  background-color: ${({ $selected }) => ($selected ? '#18382e' : 'transparent')};
  border: 2px solid #18382e;
  border-radius: 4px;
`;

const SelectionMark = styled.Text`
  color: #f4c94d;
  font-size: 16px;
  font-weight: 900;
`;

const RowActions = styled.View`flex-direction: row; align-self: stretch; align-items: center; gap: 4px; padding-right: 12px;`;
const RowAction = styled(Pressable)`min-width: 48px; min-height: 44px; align-items: center; justify-content: center; padding: 6px;`;
const RowActionText = styled.Text`color: #18382e; font-size: 10px; font-weight: 900; text-transform: uppercase;`;
const DeleteActionText = styled(RowActionText)`color: #d84929;`;
const PracticeActionText = styled(RowActionText)`color: #274137;`;
const SearchEmptyState = styled.Text`
  padding: 22px;
  color: #53635d;
  font-size: 15px;
  font-weight: 650;
`;

const ItemSeparator = styled.View`
  height: 1px;
  margin-left: 66px;
  background-color: #d8cfb7;
`;

const SectionSeparator = styled.View`
  height: ${SECTION_BOUNDARY_HEIGHT}px;
  background-color: #f8f1dd;
`;
