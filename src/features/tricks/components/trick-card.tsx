import { styled } from 'styled-components/native';

import type { TrickSummary } from '@/features/tricks/model/trick';

interface TrickCardProps {
  readonly trick: TrickSummary;
  readonly eyebrow: string;
  readonly footer: string;
}

export function TrickCard({ trick, eyebrow, footer }: TrickCardProps) {
  return (
    <Container>
      <Eyebrow>{eyebrow}</Eyebrow>
      <Card>
        <RankWatermark aria-hidden>{trick.kenteiRank}</RankWatermark>
        <MetadataRow>
          <RankBadge>Rank {trick.kenteiRank}</RankBadge>
          <LevelLabel>{trick.kenteiLevel} · {trick.kenteiClass}</LevelLabel>
        </MetadataRow>
        <TrickName accessibilityRole="header">{trick.name}</TrickName>
        <ProgressLabel>{footer}</ProgressLabel>
      </Card>
    </Container>
  );
}

const Container = styled.View`width: 100%; gap: 18px;`;
const Eyebrow = styled.Text`color: #274137; font-size: 13px; font-weight: 800; letter-spacing: 2px; text-transform: uppercase;`;
const Card = styled.View`min-height: 360px; overflow: hidden; justify-content: space-between; padding: 28px; background-color: #f6efd9; border: 2px solid #18382e; border-radius: 6px; box-shadow: 8px 8px 0 #18382e;`;
const RankWatermark = styled.Text`position: absolute; right: -14px; bottom: -55px; color: #e9d8ac; font-size: 240px; font-weight: 900; letter-spacing: -20px;`;
const MetadataRow = styled.View`flex-direction: row; align-items: center; justify-content: space-between; gap: 16px;`;
const RankBadge = styled.Text`overflow: hidden; padding: 7px 11px; color: #fffaf0; background-color: #de4b2a; border-radius: 3px; font-size: 13px; font-weight: 800; letter-spacing: 0.8px; text-transform: uppercase;`;
const LevelLabel = styled.Text`flex-shrink: 1; color: #274137; font-size: 14px; font-weight: 700; text-align: right;`;
const TrickName = styled.Text`max-width: 570px; color: #142f27; font-size: 46px; font-weight: 900; letter-spacing: -1.6px; line-height: 52px;`;
const ProgressLabel = styled.Text`color: #53675f; font-size: 13px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase;`;
