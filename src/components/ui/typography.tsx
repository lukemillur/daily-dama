import { styled } from 'styled-components/native';

export const Eyebrow = styled.Text`
  color: ${({ theme }) => theme.textMuted};
  font-size: 13px;
  font-weight: 900;
  letter-spacing: 1.8px;
  text-transform: uppercase;
`;

// Display-sized type is capped rather than reflowed: at the largest accessibility sizes a single
// word such as "What" at 42-48px would otherwise exceed a 375pt screen and break mid-word. 1.3
// keeps the longest headline word on one line there; body text, inputs and controls stay uncapped.
export const DISPLAY_MAX_FONT_SIZE_MULTIPLIER = 1.3;

export const DisplayText = styled.Text.attrs({
  maxFontSizeMultiplier: DISPLAY_MAX_FONT_SIZE_MULTIPLIER,
})``;

export const DisplayTitle = styled(DisplayText)`
  color: ${({ theme }) => theme.text};
  font-size: 42px;
  font-weight: 900;
  line-height: 44px;
  letter-spacing: -1.5px;
`;

export const BodyText = styled.Text`
  color: ${({ theme }) => theme.textMuted};
  font-size: 16px;
  line-height: 24px;
`;
