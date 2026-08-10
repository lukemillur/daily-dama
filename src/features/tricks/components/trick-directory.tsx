import { Link } from 'expo-router';
import { type ReactElement, useMemo } from 'react';
import { Pressable, SectionList, type SectionListData } from 'react-native';
import { styled } from 'styled-components/native';

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
  readonly customActions?: {
    readonly onEdit: (trickId: string) => void;
    readonly onDelete: (trickId: string) => void;
  };
  readonly footer?: ReactElement;
  readonly fixedHeader?: boolean;
  readonly fixedFooter?: boolean;
  readonly hideScrollIndicator?: boolean;
  readonly showFocusedSection?: boolean;
  readonly lacedCountByTrickId?: ReadonlyMap<string, number>;
  readonly unlockedTrickIds?: ReadonlySet<string>;
}

const DEFAULT_HEADER = {
  eyebrow: 'Trick library',
  title: 'Every trick.\nOne clear path.',
  introduction: (trickCount: number) =>
    `Browse all ${trickCount} Kendama Kentei challenges, ordered from foundational catches to master combinations.`,
};

const NO_SELECTED_TRICKS: readonly string[] = [];

export function TrickDirectory({
  tricks,
  selection,
  header,
  headerAction,
  customActions,
  footer,
  fixedHeader = false,
  fixedFooter = false,
  hideScrollIndicator = false,
  showFocusedSection = false,
  lacedCountByTrickId,
  unlockedTrickIds,
}: TrickDirectoryProps) {
  const selectedTrickIds = selection?.selectedTrickIds ?? NO_SELECTED_TRICKS;
  const sections = useMemo(
    () => createTrickSections(tricks, showFocusedSection ? selectedTrickIds : undefined),
    [tricks, showFocusedSection, selectedTrickIds],
  );
  const selectedTrickIdSet = useMemo(() => new Set(selectedTrickIds), [selectedTrickIds]);
  const directoryHeader = (
    <DirectoryHeader $compact={fixedHeader}>
      <Eyebrow>{header?.eyebrow ?? DEFAULT_HEADER.eyebrow}</Eyebrow>
      <Title>{header?.title ?? DEFAULT_HEADER.title}</Title>
      <Introduction>{header?.introduction ?? DEFAULT_HEADER.introduction(tricks.length)}</Introduction>
      {headerAction}
    </DirectoryHeader>
  );

  const directoryList = (
    <SectionList
      sections={sections}
      extraData={{ selectedTrickIds, lacedCountByTrickId, unlockedTrickIds }}
      keyExtractor={(trick) => trick.id}
      stickySectionHeadersEnabled
      showsVerticalScrollIndicator={!hideScrollIndicator}
      contentContainerStyle={{ paddingBottom: fixedFooter ? 0 : 140 }}
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
          showLacedCount={lacedCountByTrickId !== undefined}
          lacedCount={lacedCountByTrickId?.get(item.id) ?? 0}
          showUnlockedStatus={unlockedTrickIds !== undefined}
          isUnlocked={unlockedTrickIds?.has(item.id) ?? false}
        />
      )}
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

function SectionHeader({ section }: { readonly section: SectionListData<DirectoryTrick, TrickSection> }) {
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
  readonly showLacedCount?: boolean;
  readonly lacedCount?: number;
  readonly showUnlockedStatus?: boolean;
  readonly isUnlocked?: boolean;
}

function TrickRow({
  trick,
  position,
  isSelected,
  onToggle,
  onEdit,
  onDelete,
  showLacedCount = false,
  lacedCount = 0,
  showUnlockedStatus = false,
  isUnlocked = false,
}: TrickRowProps) {
  const customDescription = isCustomDirectoryTrick(trick)
    ? trick.customKind === 'sequence'
      ? 'custom sequence'
      : 'custom trick'
    : undefined;
  const identity = (
    <>
      <Position>{String(position).padStart(2, '0')}</Position>
      <TrickIdentity>
        <TrickNameRow>
          <TrickName>{trick.name}</TrickName>
          {showUnlockedStatus ? (
            <UnlockBadge
              $unlocked={isUnlocked}
              accessibilityLabel={isUnlocked ? 'Unlocked' : 'Locked'}>
              {isUnlocked ? 'Unlocked' : 'Locked'}
            </UnlockBadge>
          ) : null}
        </TrickNameRow>
        {isCustomDirectoryTrick(trick) || showLacedCount ? (
          <TrickMetaRow>
            {isCustomDirectoryTrick(trick) ? (
              <CustomLabel>{trick.customKind === 'sequence' ? 'Custom sequence' : 'Custom trick'}</CustomLabel>
            ) : null}
            {isCustomDirectoryTrick(trick) && showLacedCount ? <MetaDivider>·</MetaDivider> : null}
            {showLacedCount ? (
              <LacedCountLabel>
                {lacedCount} {lacedCount === 1 ? 'lace' : 'laces'}
              </LacedCountLabel>
            ) : null}
          </TrickMetaRow>
        ) : null}
      </TrickIdentity>
    </>
  );

  return (
    <TrickRowContainer $selected={isSelected}>
      {onToggle ? (
        <SelectableIdentity
          accessibilityLabel={[trick.name, customDescription, isSelected ? 'selected' : 'not selected']
            .filter(Boolean)
            .join(', ')}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: isSelected }}
          onPress={onToggle}>
          {identity}
          <SelectionIndicator $selected={isSelected}>
            <SelectionMark>{isSelected ? '✓' : ''}</SelectionMark>
          </SelectionIndicator>
        </SelectableIdentity>
      ) : identity}
      <RowActions>
        {onEdit && onDelete ? (
          <>
            <RowAction accessibilityLabel={`Edit ${trick.name}`} accessibilityRole="button" onPress={onEdit}>
              <RowActionText>Edit</RowActionText>
            </RowAction>
            <RowAction accessibilityLabel={`Delete ${trick.name}`} accessibilityRole="button" onPress={onDelete}>
              <DeleteActionText>Delete</DeleteActionText>
            </RowAction>
          </>
        ) : null}
        <Link asChild href={{ pathname: '/sesh', params: { trickId: trick.id } }}>
          <RowAction accessibilityLabel={`Practice ${trick.name}`} accessibilityRole="button">
            <PracticeActionText>Practice</PracticeActionText>
          </RowAction>
        </Link>
      </RowActions>
    </TrickRowContainer>
  );
}

const DirectoryLayout = styled.View`
  flex: 1;
`;

const ListContainer = styled.View`
  flex: 1;
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
  background-color: ${({ $custom }) => ($custom ? '#d84929' : '#f4c94d')};
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

const TrickRowContainer = styled.View<{ readonly $selected: boolean }>`
  min-height: 66px;
  flex-direction: row;
  align-items: center;
  background-color: ${({ $selected }) => ($selected ? '#e5edcf' : '#f8f1dd')};
`;

const SelectableIdentity = styled(Pressable)`
  min-width: 180px;
  flex: 1;
  flex-direction: row;
  align-items: center;
  gap: 18px;
  padding: 15px 22px;
`;

const Position = styled.Text`
  width: 26px;
  color: #d84929;
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

const UnlockBadge = styled.Text<{ readonly $unlocked: boolean }>`
  overflow: hidden;
  padding: 2px 7px;
  color: ${({ $unlocked }) => ($unlocked ? '#274137' : '#8a7a52')};
  background-color: ${({ $unlocked }) => ($unlocked ? '#d5e2b8' : '#efe2b8')};
  border-radius: 3px;
  font-size: 9px;
  font-weight: 900;
  letter-spacing: 0.6px;
  text-transform: uppercase;
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

const ItemSeparator = styled.View`
  height: 1px;
  margin-left: 66px;
  background-color: #d8cfb7;
`;

const SectionSeparator = styled.View`
  height: 18px;
  background-color: #efe5ca;
`;
