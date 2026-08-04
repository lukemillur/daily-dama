import { useMemo } from 'react';
import { SectionList, type SectionListData } from 'react-native';
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
}

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

export function TrickDirectory({ tricks }: TrickDirectoryProps) {
  const sections = useMemo(() => createTrickSections(tricks), [tricks]);

  return (
    <SectionList
      sections={sections}
      keyExtractor={(trick) => trick.id}
      stickySectionHeadersEnabled
      contentContainerStyle={{ paddingBottom: 140 }}
      ListHeaderComponent={
        <DirectoryHeader>
          <Eyebrow>Trick library</Eyebrow>
          <Title>Every trick.{`\n`}One clear path.</Title>
          <Introduction>
            Browse all {tricks.length} Kendama Kentei challenges, ordered from foundational catches
            to master combinations.
          </Introduction>
        </DirectoryHeader>
      }
      renderSectionHeader={({ section }) => <SectionHeader section={section} />}
      renderItem={({ item, index }) => <TrickRow trick={item} position={index + 1} />}
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

function TrickRow({ trick, position }: { readonly trick: TrickSummary; readonly position: number }) {
  return (
    <TrickRowContainer accessibilityLabel={`${position}. ${trick.name}`}>
      <Position>{String(position).padStart(2, '0')}</Position>
      <TrickName>{trick.name}</TrickName>
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

const ItemSeparator = styled.View`
  height: 1px;
  margin-left: 66px;
  background-color: #d8cfb7;
`;

const SectionSeparator = styled.View`
  height: 18px;
  background-color: #efe5ca;
`;
