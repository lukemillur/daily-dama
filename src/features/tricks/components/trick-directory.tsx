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
  readonly footer?: ReactElement;
  readonly fixedHeader?: boolean;
  readonly fixedFooter?: boolean;
  readonly hideScrollIndicator?: boolean;
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
  footer,
  fixedHeader = false,
  fixedFooter = false,
  hideScrollIndicator = false,
}: TrickDirectoryProps) {
  const sections = useMemo(() => createTrickSections(tricks), [tricks]);
  const selectedTrickIds = selection?.selectedTrickIds ?? NO_SELECTED_TRICKS;
  const selectedTrickIdSet = useMemo(() => new Set(selectedTrickIds), [selectedTrickIds]);
  const directoryHeader = (
    <DirectoryHeader $compact={fixedHeader}>
      <Eyebrow>{header?.eyebrow ?? DEFAULT_HEADER.eyebrow}</Eyebrow>
      <Title>{header?.title ?? DEFAULT_HEADER.title}</Title>
      <Introduction>{header?.introduction ?? DEFAULT_HEADER.introduction(tricks.length)}</Introduction>
    </DirectoryHeader>
  );

  const directoryList = (
    <SectionList
      sections={sections}
      extraData={selectedTrickIds}
      keyExtractor={(trick) => trick.id}
      stickySectionHeadersEnabled
      showsVerticalScrollIndicator={!hideScrollIndicator}
      contentContainerStyle={{ paddingBottom: fixedFooter ? 0 : 140 }}
      ListHeaderComponent={fixedHeader ? undefined : directoryHeader}
      ListFooterComponent={fixedFooter ? undefined : footer}
      renderSectionHeader={({ section }) => <SectionHeader section={section} />}
      renderItem={({ item, index }) => (
        <TrickRow
          trick={item}
          position={index + 1}
          isSelected={selectedTrickIdSet.has(item.id)}
          onToggle={selection ? () => selection.onToggleTrick(item.id) : undefined}
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
  return (
    <SectionHeaderContainer $custom={section.kind === 'custom'}>
      <RankLabel $custom={section.kind === 'custom'}>{section.kind === 'custom' ? 'Custom' : `Rank ${section.rank}`}</RankLabel>
      <LevelLabel $custom={section.kind === 'custom'}>
        {section.kind === 'custom' ? 'Your own progression' : `${section.level} · ${section.className}`}
      </LevelLabel>
    </SectionHeaderContainer>
  );
}

interface TrickRowProps {
  readonly trick: DirectoryTrick;
  readonly position: number;
  readonly isSelected: boolean;
  readonly onToggle?: () => void;
}

function TrickRow({ trick, position, isSelected, onToggle }: TrickRowProps) {
  const contents = (
    <>
      <Position>{String(position).padStart(2, '0')}</Position>
      <TrickIdentity>
        <TrickName>{trick.name}</TrickName>
        {isCustomDirectoryTrick(trick) ? (
          <CustomLabel>{trick.customKind === 'sequence' ? 'Custom sequence' : 'Custom trick'}</CustomLabel>
        ) : null}
      </TrickIdentity>
      {onToggle && (
        <SelectionIndicator $selected={isSelected}>
          <SelectionMark>{isSelected ? '✓' : ''}</SelectionMark>
        </SelectionIndicator>
      )}
    </>
  );

  if (onToggle) {
    return (
      <SelectableTrickRow
        $selected={isSelected}
        accessibilityLabel={`${trick.name}, ${isSelected ? 'selected' : 'not selected'}`}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: isSelected }}
        onPress={onToggle}
      >
        {contents}
      </SelectableTrickRow>
    );
  }

  return (
    <TrickRowContainer accessibilityLabel={`${position}. ${trick.name}`}>
      {contents}
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

const TrickRowContainer = styled.View`
  min-height: 66px;
  flex-direction: row;
  align-items: center;
  gap: 18px;
  padding: 15px 22px;
  background-color: #f8f1dd;
`;

const SelectableTrickRow = styled(Pressable)<{ readonly $selected: boolean }>`
  min-height: 66px;
  flex-direction: row;
  align-items: center;
  gap: 18px;
  padding: 15px 22px;
  background-color: ${({ $selected }) => ($selected ? '#e5edcf' : '#f8f1dd')};
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

const TrickName = styled.Text`
  color: #18382e;
  font-size: 18px;
  font-weight: 750;
  line-height: 24px;
`;

const CustomLabel = styled.Text`
  color: #d84929;
  font-size: 10px;
  font-weight: 900;
  letter-spacing: 1px;
  text-transform: uppercase;
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

const ItemSeparator = styled.View`
  height: 1px;
  margin-left: 66px;
  background-color: #d8cfb7;
`;

const SectionSeparator = styled.View`
  height: 18px;
  background-color: #efe5ca;
`;
