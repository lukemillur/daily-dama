import { useMemo } from 'react';
import { Pressable, ScrollView } from 'react-native';
import { styled } from 'styled-components/native';

import { Button } from '@/components/ui/button';
import { BodyText, DisplayTitle, Eyebrow } from '@/components/ui/typography';
import { AppColors, BottomTabInset } from '@/constants/theme';
import {
  createTrickSections,
  type DirectoryTrick,
  type TrickSection,
} from '@/features/tricks/model/trick-directory';

interface LacedTricksScreenProps {
  readonly tricks: readonly DirectoryTrick[];
  readonly unlockedTrickIds: ReadonlySet<string>;
  readonly onToggleTrick: (trickId: string) => void;
  readonly onBack: () => void;
}

export function LacedTricksScreen({
  tricks,
  unlockedTrickIds,
  onToggleTrick,
  onBack,
}: LacedTricksScreenProps) {
  const sections = useMemo(() => createTrickSections(tricks), [tricks]);

  return (
    <Scroll contentContainerStyle={{ paddingBottom: 120 + BottomTabInset }}>
      <Content>
        <Eyebrow>Laced tricks</Eyebrow>
        <PageTitle>Laced tricks</PageTitle>
        <Introduction>
          Tap a trick to mark it laced or unlaced. Tricks with practice history stay laced
          automatically.
        </Introduction>

        <FormActions>
          <Button accessibilityLabel="Back to Tricks" fill variant="secondary" onPress={onBack}>
            Back to Tricks
          </Button>
        </FormActions>

        <Sections>
          {sections.map((section) => (
            <SectionBlock
              key={sectionKey(section)}
              section={section}
              unlockedTrickIds={unlockedTrickIds}
              onToggleTrick={onToggleTrick}
            />
          ))}
        </Sections>
      </Content>
    </Scroll>
  );
}

function sectionKey(section: TrickSection) {
  return section.kind === 'ranked' ? `rank-${section.rank}` : section.kind;
}

function SectionBlock({
  section,
  unlockedTrickIds,
  onToggleTrick,
}: {
  readonly section: TrickSection;
  readonly unlockedTrickIds: ReadonlySet<string>;
  readonly onToggleTrick: (trickId: string) => void;
}) {
  if (section.data.length === 0) return null;

  return (
    <Section>
      <SectionHeader>
        <SectionTitle>{section.kind === 'ranked' ? `Rank ${section.rank}` : 'Custom'}</SectionTitle>
        <SectionSubtitle>
          {section.kind === 'ranked' ? `${section.level} · ${section.className}` : 'Your own progression'}
        </SectionSubtitle>
      </SectionHeader>
      <CardGrid>
        {section.data.map((trick) => (
          <TrickCard
            key={trick.id}
            trick={trick}
            isLaced={unlockedTrickIds.has(trick.id)}
            onPress={() => onToggleTrick(trick.id)}
          />
        ))}
      </CardGrid>
    </Section>
  );
}

function TrickCard({
  trick,
  isLaced,
  onPress,
}: {
  readonly trick: DirectoryTrick;
  readonly isLaced: boolean;
  readonly onPress: () => void;
}) {
  return (
    <Card
      $laced={isLaced}
      accessibilityLabel={`${trick.name}, ${isLaced ? 'laced' : 'unlaced'}`}
      accessibilityRole="button"
      accessibilityState={{ selected: isLaced }}
      onPress={onPress}>
      <CardName $laced={isLaced}>{trick.name}</CardName>
      <CardStatus $laced={isLaced}>{isLaced ? 'Laced' : 'Unlaced'}</CardStatus>
    </Card>
  );
}

const Scroll = styled(ScrollView)`flex: 1; width: 100%;`;
const Content = styled.View`width: 100%; max-width: 760px; align-self: center; padding: 38px 22px 0;`;
const PageTitle = styled(DisplayTitle)`margin-top: 12px;`;
const Introduction = styled(BodyText)`max-width: 580px; margin-top: 16px;`;
const FormActions = styled.View`gap: 10px; margin-top: 26px;`;
const Sections = styled.View`gap: 24px; margin-top: 30px;`;
const Section = styled.View`gap: 12px;`;
const SectionHeader = styled.View`flex-direction: row; align-items: baseline; justify-content: space-between; gap: 12px;`;
const SectionTitle = styled.Text`color: ${({ theme }) => theme.text}; font-size: 18px; font-weight: 900;`;
const SectionSubtitle = styled.Text`flex-shrink: 1; color: ${({ theme }) => theme.text}; font-size: 12px; font-weight: 800; text-align: right; text-transform: uppercase;`;
const CardGrid = styled.View`flex-direction: row; flex-wrap: wrap; gap: 10px;`;
const Card = styled(Pressable)<{ readonly $laced: boolean }>`
  min-width: 140px;
  padding: 14px 16px;
  background-color: ${({ $laced }) => ($laced ? '#e5edcf' : AppColors.paper)};
  border: 2px solid ${AppColors.ink};
  gap: 6px;
`;
const CardName = styled.Text<{ readonly $laced: boolean }>`
  color: ${AppColors.ink};
  font-size: 15px;
  font-weight: 800;
`;
const CardStatus = styled.Text<{ readonly $laced: boolean }>`
  color: ${({ $laced }) => ($laced ? '#274137' : '#8a7a52')};
  font-size: 10px;
  font-weight: 900;
  letter-spacing: 0.6px;
  text-transform: uppercase;
`;
