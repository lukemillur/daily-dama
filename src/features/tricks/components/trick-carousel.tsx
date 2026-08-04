import { Pressable } from 'react-native';
import { styled } from 'styled-components/native';

import type { TrickSummary } from '@/features/tricks/model/trick';

export interface TrickCarouselProps {
  readonly trick: TrickSummary;
  readonly currentIndex: number;
  readonly totalTricks: number;
  readonly onPrevious: () => void;
  readonly onNext: () => void;
  readonly canGoPrevious?: boolean;
  readonly canGoNext?: boolean;
}

export function TrickCarousel({
  trick,
  currentIndex,
  totalTricks,
  onPrevious,
  onNext,
  canGoPrevious = true,
  canGoNext = true,
}: TrickCarouselProps) {
  return (
    <Container>
      <Eyebrow>Today&apos;s practice</Eyebrow>

      <Card>
        <RankWatermark aria-hidden>{trick.kenteiRank}</RankWatermark>
        <MetadataRow>
          <RankBadge>Rank {trick.kenteiRank}</RankBadge>
          <LevelLabel>
            {trick.kenteiLevel} · {trick.kenteiClass}
          </LevelLabel>
        </MetadataRow>

        <TrickName accessibilityRole="header">{trick.name}</TrickName>

        <ProgressLabel>
          Trick {currentIndex + 1} of {totalTricks}
        </ProgressLabel>
      </Card>

      <Controls>
        <NavigationButton
          accessibilityLabel="Show previous trick"
          accessibilityRole="button"
          disabled={!canGoPrevious}
          onPress={onPrevious}
        >
          <ButtonArrow>←</ButtonArrow>
          <ButtonLabel>Previous</ButtonLabel>
        </NavigationButton>

        <NavigationButton
          accessibilityLabel="Show next trick"
          accessibilityRole="button"
          disabled={!canGoNext}
          onPress={onNext}
        >
          <ButtonLabel>Next</ButtonLabel>
          <ButtonArrow>→</ButtonArrow>
        </NavigationButton>
      </Controls>
    </Container>
  );
}

const Container = styled.View`
  width: 100%;
  max-width: 720px;
  gap: 18px;
`;

const Eyebrow = styled.Text`
  color: #274137;
  font-size: 13px;
  font-weight: 800;
  letter-spacing: 2px;
  text-transform: uppercase;
`;

const Card = styled.View`
  min-height: 360px;
  overflow: hidden;
  justify-content: space-between;
  padding: 28px;
  background-color: #f6efd9;
  border: 2px solid #18382e;
  border-radius: 6px;
  box-shadow: 8px 8px 0 #18382e;
`;

const RankWatermark = styled.Text`
  position: absolute;
  right: -14px;
  bottom: -55px;
  color: #e9d8ac;
  font-size: 240px;
  font-weight: 900;
  letter-spacing: -20px;
`;

const MetadataRow = styled.View`
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
`;

const RankBadge = styled.Text`
  overflow: hidden;
  padding: 7px 11px;
  color: #fffaf0;
  background-color: #de4b2a;
  border-radius: 3px;
  font-size: 13px;
  font-weight: 800;
  letter-spacing: 0.8px;
  text-transform: uppercase;
`;

const LevelLabel = styled.Text`
  flex-shrink: 1;
  color: #274137;
  font-size: 14px;
  font-weight: 700;
  text-align: right;
`;

const TrickName = styled.Text`
  max-width: 570px;
  color: #142f27;
  font-size: 46px;
  font-weight: 900;
  letter-spacing: -1.6px;
  line-height: 52px;
`;

const ProgressLabel = styled.Text`
  color: #53675f;
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 1px;
  text-transform: uppercase;
`;

const Controls = styled.View`
  flex-direction: row;
  justify-content: space-between;
  gap: 14px;
`;

const NavigationButton = styled(Pressable)`
  min-height: 52px;
  flex: 1;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  gap: 9px;
  padding: 12px 18px;
  background-color: #18382e;
  border: 2px solid #18382e;
  border-radius: 4px;
  opacity: ${({ disabled }) => (disabled ? 0.35 : 1)};
`;

const ButtonLabel = styled.Text`
  color: #fffaf0;
  font-size: 16px;
  font-weight: 800;
`;

const ButtonArrow = styled.Text`
  color: #f5c84c;
  font-size: 21px;
  font-weight: 700;
`;
