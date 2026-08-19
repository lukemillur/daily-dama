import { Image } from 'expo-image';
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

interface Screenshot {
  readonly source: number;
  readonly alt: string;
  readonly caption: string;
}

const SCREENSHOTS: readonly Screenshot[] = [
  {
    source: require('@/assets/images/landing/home-screen.png'),
    alt: 'Daily Dama home screen showing a practice streak, the last sesh, and the current practice queue',
    caption: 'Open the app and the loop is right there: what you last practiced, what’s next, and how the streak is going.',
  },
  {
    source: require('@/assets/images/landing/sesh-first-lace.png'),
    alt: 'Sesh screen celebrating the first-ever lace on a trick mid-session',
    caption: 'The moment a trick actually lands for the first time, Daily Dama says so.',
  },
  {
    source: require('@/assets/images/landing/custom-trick-form.png'),
    alt: 'Custom trick form with a trick name and Kentei rank filled in',
    caption: 'Got a move that’s not in the standard Kentei set? Name it, rank it, and it joins your rotation.',
  },
  {
    source: require('@/assets/images/landing/trick-goals.png'),
    alt: 'Trick goals screen showing progress bars for multiple in-progress goals',
    caption: 'Climb the ladder on purpose — set a target per trick and watch the progress add up.',
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

          <ScreenshotSection>
            <ScreenshotHeading>What you’re signing up for</ScreenshotHeading>
            {SCREENSHOTS.map((screenshot) => (
              <ScreenshotItem key={screenshot.alt}>
                <Image
                  source={screenshot.source}
                  accessibilityLabel={screenshot.alt}
                  alt={screenshot.alt}
                  contentFit="contain"
                  style={{ width: '100%', aspectRatio: 375 / 812 }}
                />
                <ScreenshotCaption>{screenshot.caption}</ScreenshotCaption>
              </ScreenshotItem>
            ))}
          </ScreenshotSection>

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

const ScreenshotSection = styled.View`
  margin-top: 40px;
  gap: 28px;
`;

const ScreenshotHeading = styled.Text`
  color: ${AppColors.ink};
  font-size: 17px;
  font-weight: 900;
`;

const ScreenshotItem = styled.View`
  gap: 10px;
  align-items: center;
  width: 100%;
  max-width: 360px;
`;

const ScreenshotCaption = styled(BodyText)`
  max-width: 340px;
  text-align: center;
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
