import { Image } from 'expo-image';
import { styled } from 'styled-components/native';

import { AppColors, Radii } from '@/constants/theme';

// Public domain (Wikimedia Commons, "Green Kendama for game.JPG",
// https://commons.wikimedia.org/wiki/File:Green_Kendama_for_game.JPG) — no attribution
// required.
const PHOTO_ASPECT_RATIO = 675 / 900;

/**
 * A real photo of a physical kendama, placed as a second "grounding" visual moment near the
 * bottom of the page (the SVG hero is the first, at the top). Mirrors `LandingHero`'s
 * sticker-panel treatment but uses `expo-image` rather than `react-native-svg`, since this is
 * a raster photo rather than an illustration.
 */
export function LandingPhoto() {
  return (
    <PhotoPanel testID="landing-photo" style={{ boxShadow: `8px 8px 0 ${AppColors.ink}` }}>
      <Image
        source={require('@/assets/images/landing/kendama-photo.jpg')}
        accessibilityLabel="A green kendama, the wooden cup-and-ball toy Daily Dama is built around"
        alt="A green kendama, the wooden cup-and-ball toy Daily Dama is built around"
        contentFit="cover"
        style={{ width: '100%', aspectRatio: PHOTO_ASPECT_RATIO, borderRadius: Radii.panel }}
      />
    </PhotoPanel>
  );
}

const PhotoPanel = styled.View`
  margin-top: 40px;
  max-width: 260px;
  align-self: center;
  padding: 10px;
  background-color: ${AppColors.paperStrong};
  border: 2px solid ${AppColors.ink};
  border-radius: ${Radii.panel}px;
`;
