import { useMemo } from 'react';
import { Pressable, SectionList, type SectionListData } from 'react-native';
import { styled } from 'styled-components/native';

import type { TrickSummary } from '@/features/tricks/model/trick';

interface TrickSection {
  readonly rank: number;
  readonly level: TrickSummary['kenteiLevel'];
  readonly className: TrickSummary['kenteiClass'];
  readonly data: TrickSummary[];
}

export interface TrickDirectoryProps {
  readonly tricks: readonly TrickSummary[];
  readonly selection?: {
    readonly selectedTrickIds: readonly string[];
    readonly onToggleTrick: (trickId: string) => void;
  };
  readonly header?: {
    readonly eyebrow: string;
    readonly title: string;
    readonly introduction: string;
  };
}

const DEFAULT_HEADER = {
  eyebrow: 'Trick library',
  title: 'Every trick.\nOne clear path.',
  introduction: (trickCount: number) =>
    `Browse all ${trickCount} Kendama Kentei challenges, ordered from foundational catches to master combinations.`,
};

const NO_SELECTED_TRICKS: readonly string[] = [];

export function createTrickSections(tricks: readonly TrickSummary[]): TrickSection[] {
  const sectionsByRank = new Map<number, TrickSection>();

  for (const trick of tricks) {
    const existingSection = sectionsByRank.get(trick.kenteiRank);

    if (existingSection) {
      existingSection.data.push(trick);
      continue;
    }

    sectionsByRank.set(trick.kenteiRank, {
      rank: trick.kenteiRank,
      level: trick.kenteiLevel,
      className: trick.kenteiClass,
      data: [trick],
    });
  }

  return [...sectionsByRank.values()].sort((first, second) => first.rank - second.rank);
}

export function TrickDirectory({ tricks, selection, header }: TrickDirectoryProps) {
  const sections = useMemo(() => createTrickSections(tricks), [tricks]);
  const selectedTrickIds = selection?.selectedTrickIds ?? NO_SELECTED_TRICKS;
  const selectedTrickIdSet = useMemo(() => new Set(selectedTrickIds), [selectedTrickIds]);

  return (
    <SectionList
      sections={sections}
      extraData={selectedTrickIds}
      keyExtractor={(trick) => trick.id}
      stickySectionHeadersEnabled
      contentContainerStyle={{ paddingBottom: 140 }}
      ListHeaderComponent={
        <DirectoryHeader>
          <Eyebrow>{header?.eyebrow ?? DEFAULT_HEADER.eyebrow}</Eyebrow>
          <Title>{header?.title ?? DEFAULT_HEADER.title}</Title>
          <Introduction>{header?.introduction ?? DEFAULT_HEADER.introduction(tricks.length)}</Introduction>
        </DirectoryHeader>
      }
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
}

function SectionHeader({ section }: { readonly section: SectionListData<TrickSummary, TrickSection> }) {
  return (
    <SectionHeaderContainer>
      <RankLabel>Rank {section.rank}</RankLabel>
      <LevelLabel>
        {section.level} · {section.className}
      </LevelLabel>
    </SectionHeaderContainer>
  );
}

interface TrickRowProps {
  readonly trick: TrickSummary;
  readonly position: number;
  readonly isSelected: boolean;
  readonly onToggle?: () => void;
}

function TrickRow({ trick, position, isSelected, onToggle }: TrickRowProps) {
  const contents = (
    <>
      <Position>{String(position).padStart(2, '0')}</Position>
      <TrickName>{trick.name}</TrickName>
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

const DirectoryHeader = styled.View`
  gap: 14px;
  padding: 122px 22px 48px;
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

const SectionHeaderContainer = styled.View`
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 14px 22px;
  background-color: #f4c94d;
  border-top-width: 2px;
  border-bottom-width: 2px;
  border-color: #18382e;
`;

const RankLabel = styled.Text`
  color: #18382e;
  font-size: 20px;
  font-weight: 900;
  letter-spacing: -0.4px;
`;

const LevelLabel = styled.Text`
  flex-shrink: 1;
  color: #274137;
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

const TrickName = styled.Text`
  flex: 1;
  color: #18382e;
  font-size: 18px;
  font-weight: 750;
  line-height: 24px;
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
