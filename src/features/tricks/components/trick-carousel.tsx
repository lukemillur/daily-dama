import { Pressable } from 'react-native';
import { styled } from 'styled-components/native';

import { TrickCard } from '@/features/tricks/components/trick-card';
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
      <TrickCard
        trick={trick}
        eyebrow="Today's practice"
        footer={`Trick ${currentIndex + 1} of ${totalTricks}`}
      />

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
