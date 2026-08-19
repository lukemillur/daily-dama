import { Circle, Line, Path, Rect, Svg } from 'react-native-svg';
import { styled } from 'styled-components/native';

import { AppColors, Radii } from '@/constants/theme';

/**
 * A hand-drawn, sticker-style kendama silhouette rendered as a fixed-viewBox SVG that scales
 * responsively via the wrapper's `style={{ width: '100%', aspectRatio }}`, matching how the
 * screenshot images already scale in `landing-page.tsx`. Built from primitives (circles,
 * rects, a curved path) rather than freehand path coordinates, per the plan.
 */
export function LandingHero() {
  return (
    <HeroPanel testID="landing-hero" style={{ boxShadow: `8px 8px 0 ${AppColors.ink}` }}>
      <Svg
        viewBox="0 0 240 200"
        style={{ width: '100%', aspectRatio: 240 / 200 }}
        accessibilityRole="image"
        accessibilityLabel="Illustration of a kendama, showing the ball, string, and handle"
      >
        <Path
          d="M 120 92 C 100 115, 100 140, 118 158"
          stroke={AppColors.ink}
          strokeWidth={4}
          strokeLinecap="round"
          fill="none"
        />
        <Rect x={58} y={148} width={64} height={30} rx={12} fill={AppColors.red} stroke={AppColors.ink} strokeWidth={6} />
        <Circle cx={90} cy={155} r={9} fill={AppColors.paperStrong} stroke={AppColors.ink} strokeWidth={4} />
        <Rect x={80} y={178} width={20} height={20} rx={6} fill={AppColors.sage} stroke={AppColors.ink} strokeWidth={5} />
        <Rect x={44} y={140} width={92} height={14} rx={7} fill={AppColors.sage} stroke={AppColors.ink} strokeWidth={5} />
        <Line x1={118} y1={140} x2={118} y2={158} stroke={AppColors.ink} strokeWidth={6} strokeLinecap="round" />
        <Circle cx={130} cy={64} r={52} fill={AppColors.yellow} stroke={AppColors.ink} strokeWidth={6} />
        <Circle cx={120} cy={92} r={10} fill={AppColors.paperStrong} stroke={AppColors.ink} strokeWidth={4} />
        <Circle cx={110} cy={46} r={12} fill={AppColors.cream} opacity={0.55} />
      </Svg>
    </HeroPanel>
  );
}

const HeroPanel = styled.View`
  margin-top: 4px;
  padding: 18px;
  align-items: center;
  justify-content: center;
  max-width: 280px;
  align-self: center;
  background-color: ${AppColors.paperStrong};
  border: 2px solid ${AppColors.ink};
  border-radius: ${Radii.panel}px;
`;
