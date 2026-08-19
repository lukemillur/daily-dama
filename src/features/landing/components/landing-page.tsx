import { Link } from 'expo-router';
import { ScrollView } from 'react-native';
import { styled } from 'styled-components/native';

import { Button } from '@/components/ui/button';
import { Screen } from '@/components/ui/screen';
import { BodyText, DisplayTitle, Eyebrow } from '@/components/ui/typography';
import { AppColors } from '@/constants/theme';

interface Feature {
  readonly heading: string;
  readonly body: string;
}

const FEATURES: readonly Feature[] = [
  {
    heading: 'Pick one trick and stick to it',
    body: 'It’s easy to say “just whirlwind for 20 minutes” and drift back to what you already know. Daily Dama keeps your goal trick on screen so a sesh stays a sesh.',
  },
  {
    heading: 'See the grind, not just the miss',
    body: 'Five minutes without a lace can feel like nothing is happening. Daily Dama logs the time between lands, so a rough sesh today reads next to the three hours it took last time.',
  },
  {
    heading: 'Climb the Kentei ladder on purpose',
    body: 'A quick skill check places you on the ladder, and every sesh points you at the next rung instead of leaving you to guess what to work on.',
  },
];

export function LandingPage() {
  return (
    <Screen background={AppColors.paper}>
      <LandingScroll contentContainerStyle={{ paddingBottom: 80 }}>
        <Content>
          <Eyebrow>Why Daily Dama</Eyebrow>
          <Headline>Play with{`\n`}intention.</Headline>
          <Lede>
            Kendama is a flow toy — most of the time, that’s the whole point. But flow is great
            for enjoying the tricks you already know, and rough for landing the ones you don’t.
            Daily Dama is the deliberate-practice half of your play: a place to bring a goal
            trick, hold your focus on it, and see the work add up.
          </Lede>

          <FeatureList>
            {FEATURES.map((feature) => (
              <FeatureItem key={feature.heading}>
                <FeatureHeading>{feature.heading}</FeatureHeading>
                <FeatureBody>{feature.body}</FeatureBody>
              </FeatureItem>
            ))}
          </FeatureList>

          <Closing>
            Kendama is also one of the best excuses to put your phone down. Daily Dama isn’t
            trying to take that away — it’s here for the seshes where you already decided to
            get better, not the ones where you just want to play.
          </Closing>

          <Link href="/app/home" asChild>
            <CtaButton accessibilityRole="link">Start your first Sesh</CtaButton>
          </Link>
        </Content>
      </LandingScroll>
    </Screen>
  );
}

const LandingScroll = styled(ScrollView)`
  flex: 1;
  width: 100%;
`;

const Content = styled.View`
  width: 100%;
  max-width: 620px;
  align-self: center;
  padding: 40px 22px 80px;
`;

const Headline = styled(DisplayTitle)`
  margin-top: 10px;
`;

const Lede = styled(BodyText)`
  max-width: 520px;
  margin-top: 18px;
  color: ${AppColors.textMuted};
`;

const FeatureList = styled.View`
  margin-top: 36px;
  gap: 22px;
`;

const FeatureItem = styled.View`
  gap: 6px;
`;

const FeatureHeading = styled.Text`
  color: ${AppColors.ink};
  font-size: 17px;
  font-weight: 900;
`;

const FeatureBody = styled(BodyText)`
  color: ${AppColors.textMuted};
`;

const Closing = styled(BodyText)`
  max-width: 520px;
  margin-top: 32px;
  color: ${AppColors.textSubtle};
`;

const CtaButton = styled(Button)`
  align-self: flex-start;
  margin-top: 30px;
`;
