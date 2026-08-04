import { useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { styled } from 'styled-components/native';

import { TrickCarousel } from '@/features/tricks/components/trick-carousel';
import { KENDAMA_KENTEI_TRICKS } from '@/features/tricks/data/kendama-kentei-tricks';

export default function HomeScreen() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const currentTrick = KENDAMA_KENTEI_TRICKS[currentIndex];

  const showPreviousTrick = () => {
    setCurrentIndex((index) => Math.max(0, index - 1));
  };

  const showNextTrick = () => {
    setCurrentIndex((index) => Math.min(KENDAMA_KENTEI_TRICKS.length - 1, index + 1));
  };

  return (
    <Screen>
      <SafeContent edges={['top', 'left', 'right']}>
        <TrickCarousel
          trick={currentTrick}
          currentIndex={currentIndex}
          totalTricks={KENDAMA_KENTEI_TRICKS.length}
          canGoPrevious={currentIndex > 0}
          canGoNext={currentIndex < KENDAMA_KENTEI_TRICKS.length - 1}
          onPrevious={showPreviousTrick}
          onNext={showNextTrick}
        />
      </SafeContent>
    </Screen>
  );
}

const Screen = styled.View`
  flex: 1;
  width: 100%;
  background-color: #f4c94d;
`;

const SafeContent = styled(SafeAreaView)`
  flex: 1;
  width: 100%;
  align-items: center;
  justify-content: center;
  gap: 34px;
  padding: 28px 22px 116px;
`;
