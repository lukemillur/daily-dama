import { styled } from 'styled-components/native';

export const Eyebrow = styled.Text`
  color: ${({ theme }) => theme.text};
  font-size: 13px;
  font-weight: 900;
  letter-spacing: 1.8px;
  text-transform: uppercase;
`;

export const DisplayTitle = styled.Text`
  color: ${({ theme }) => theme.text};
  font-size: 42px;
  font-weight: 900;
  line-height: 44px;
  letter-spacing: -1.5px;
`;

export const BodyText = styled.Text`
  color: ${({ theme }) => theme.text};
  font-size: 16px;
  line-height: 24px;
`;
