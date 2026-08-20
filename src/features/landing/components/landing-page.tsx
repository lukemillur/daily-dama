import { Image } from 'expo-image';
import { Platform, ScrollView, useWindowDimensions } from 'react-native';
import { styled } from 'styled-components/native';

import { Screen } from '@/components/ui/screen';
import { BodyText, DisplayTitle, Eyebrow } from '@/components/ui/typography';
import { AppColors, Radii } from '@/constants/theme';
import { LandingHero } from '@/features/landing/components/landing-hero';
import { LandingPhoto } from '@/features/landing/components/landing-photo';
import { LandingCta } from '@/features/landing/components/landing-cta';

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

interface ScreenshotContent {
  readonly title: string;
  readonly caption: string;
}

interface PlatformScreenshotAsset {
  readonly source: number;
  readonly alt: string;
  readonly aspectRatio: number;
}

type Screenshot = ScreenshotContent & PlatformScreenshotAsset;

const SCREENSHOT_CONTENT: readonly ScreenshotContent[] = [
  {
    title: 'Your practice loop, at a glance',
    caption: 'Open the app and the loop is right there: what you last practiced, what’s next, and how the streak is going.',
  },
  {
    title: 'First lace, first cheer',
    caption: 'The moment a trick actually lands for the first time, Daily Dama says so.',
  },
  {
    title: 'Your move, your rank',
    caption: 'Got a move that’s not in the standard Kentei set? Name it, rank it, and it joins your rotation.',
  },
  {
    title: 'Progress you can point to',
    caption: 'Climb the ladder on purpose — set a target per trick and watch the progress add up.',
  },
];

const MOBILE_SCREENSHOT_ASSETS: readonly PlatformScreenshotAsset[] = [
  {
    source: require('@/assets/images/landing/home-screen.png'),
    alt: 'Daily Dama home screen showing a practice streak, the last sesh, and the current practice queue',
    aspectRatio: 375 / 812,
  },
  {
    source: require('@/assets/images/landing/sesh-first-lace.png'),
    alt: 'Sesh screen celebrating the first-ever lace on a trick mid-session',
    aspectRatio: 375 / 812,
  },
  {
    source: require('@/assets/images/landing/custom-trick-form.png'),
    alt: 'Custom trick form with a trick name and Kentei rank filled in',
    aspectRatio: 375 / 812,
  },
  {
    source: require('@/assets/images/landing/trick-goals.png'),
    alt: 'Trick goals screen showing progress bars for multiple in-progress goals',
    aspectRatio: 375 / 812,
  },
];

const WEB_SCREENSHOT_ASSETS: readonly PlatformScreenshotAsset[] = [
  {
    source: require('@/assets/images/landing/home-screen-web.png'),
    alt: 'Daily Dama home screen in the desktop web layout, showing a practice streak, the last sesh, and the current practice queue',
    aspectRatio: 1280 / 900,
  },
  {
    source: require('@/assets/images/landing/sesh-first-lace-web.png'),
    alt: 'Sesh screen in the desktop web layout celebrating the first-ever lace on a trick mid-session',
    aspectRatio: 1280 / 900,
  },
  {
    source: require('@/assets/images/landing/custom-trick-form-web.png'),
    alt: 'Custom trick form in the desktop web layout with a trick name and Kentei rank filled in',
    aspectRatio: 1280 / 900,
  },
  {
    source: require('@/assets/images/landing/trick-goals-web.png'),
    alt: 'Trick goals screen in the desktop web layout showing progress bars for multiple in-progress goals',
    aspectRatio: 1280 / 900,
  },
];

export const MOBILE_SCREENSHOTS: readonly Screenshot[] = SCREENSHOT_CONTENT.map((content, index) => ({
  ...content,
  ...MOBILE_SCREENSHOT_ASSETS[index],
}));

export const WEB_SCREENSHOTS: readonly Screenshot[] = SCREENSHOT_CONTENT.map((content, index) => ({
  ...content,
  ...WEB_SCREENSHOT_ASSETS[index],
}));

export function LandingPage() {
  const { width } = useWindowDimensions();
  const isWebLayout = Platform.OS === 'web' && width >= 768;
  const screenshots = isWebLayout ? WEB_SCREENSHOTS : MOBILE_SCREENSHOTS;

  return (
    <Screen background={AppColors.paper}>
      <LandingScroll contentContainerStyle={{ paddingBottom: 80 }}>
        <Content>
          <LandingHero />
          <Eyebrow>Why Daily Dama</Eyebrow>
          <Headline>Play with{`\n`}intention.</Headline>
          <Lede>
            Kendama is a flow toy — most of the time, that’s the whole point. But flow is great
            for enjoying the tricks you already know, and rough for landing the ones you don’t.
            Daily Dama is the deliberate-practice half of your play: a place to bring a goal
            trick, hold your focus on it, and see the work add up.
          </Lede>

          <LandingCta />

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
            {screenshots.map((screenshot) => (
              <ScreenshotItem
                key={screenshot.alt}
                testID="screenshot-item"
                $isWebLayout={isWebLayout}
                style={{ boxShadow: `8px 8px 0 ${AppColors.ink}` }}
              >
                <Image
                  source={screenshot.source}
                  accessibilityLabel={screenshot.alt}
                  alt={screenshot.alt}
                  contentFit="contain"
                  style={{ width: '100%', aspectRatio: screenshot.aspectRatio }}
                />
                <ScreenshotTitle $isWebLayout={isWebLayout}>{screenshot.title}</ScreenshotTitle>
                <ScreenshotCaption $isWebLayout={isWebLayout}>{screenshot.caption}</ScreenshotCaption>
              </ScreenshotItem>
            ))}
          </ScreenshotSection>

          <LandingPhoto />

          <Closing>
            Kendama is also one of the best excuses to put your phone down. Daily Dama isn’t
            trying to take that away — it’s here for the seshes where you already decided to
            get better, not the ones where you just want to play.
          </Closing>
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

// `boxShadow` is passed as an explicit `style` prop at the JSX call site (not baked into
// `.attrs`) -- see landing-cta.tsx's `CtaPanel` for the full explanation of why
// styled-components/native's `.attrs({ style: {...} })` config alone would be inert here.
const ScreenshotItem = styled.View<{ readonly $isWebLayout: boolean }>`
  gap: 10px;
  align-items: center;
  width: 100%;
  max-width: ${({ $isWebLayout }) => ($isWebLayout ? 560 : 360)}px;
  padding: ${({ $isWebLayout }) => ($isWebLayout ? '26px 26px 30px' : '18px 16px 22px')};
  background-color: ${AppColors.cream};
  border: 2px solid ${AppColors.ink};
  border-radius: ${Radii.panel}px;
`;

const ScreenshotTitle = styled.Text<{ readonly $isWebLayout: boolean }>`
  color: ${AppColors.ink};
  font-size: ${({ $isWebLayout }) => ($isWebLayout ? 24 : 19)}px;
  font-weight: 900;
  letter-spacing: -0.3px;
  text-align: center;
`;

const ScreenshotCaption = styled(BodyText)<{ readonly $isWebLayout: boolean }>`
  max-width: ${({ $isWebLayout }) => ($isWebLayout ? 480 : 340)}px;
  font-size: ${({ $isWebLayout }) => ($isWebLayout ? 18 : 16)}px;
  line-height: ${({ $isWebLayout }) => ($isWebLayout ? 26 : 24)}px;
  text-align: center;
  color: ${AppColors.textMuted};
`;

const Closing = styled(BodyText)`
  max-width: 520px;
  margin-top: 32px;
  color: ${AppColors.textSubtle};
`;

