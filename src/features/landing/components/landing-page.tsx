import { Image } from 'expo-image';
import { useEffect, useRef, useState, useSyncExternalStore, type ComponentRef } from 'react';
import { Platform, ScrollView, useWindowDimensions } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { styled } from 'styled-components/native';

import { Screen } from '@/components/ui/screen';
import { BodyText, DisplayTitle, Eyebrow } from '@/components/ui/typography';
import { AppColors, Radii } from '@/constants/theme';
import { LandingAuthCta } from '@/features/landing/components/landing-auth-cta';
import { LandingCta } from '@/features/landing/components/landing-cta';

interface Feature {
  readonly heading: string;
  readonly body: string;
}

const FEATURES: readonly Feature[] = [
  {
    heading: 'Level up faster',
    body: 'It’s easy to say “just whirlwind for 20 minutes” and drift back to what you already know. Daily Dama keeps your goal trick on screen so a sesh stays focused.',
  },
  {
    heading: 'Focus on growth, not failure',
    body: 'Ten minutes without a lace can feel like nothing is happening. Ten days without a lace can be demoralizing. Daily dama tracks time spent dedicated to landing a trick the first time and follows it up with time between laces once you’ve got it down.',
  },
  {
    heading: 'Challenge your personal bests',
    body: 'The first lace takes 30 minutes, the second takes 15, and the third takes 5. Before you know it you’re aiming to hit a new PB of 10 laces in five minutes.',
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
    title: 'Customize your sesh',
    caption:
      'Run the clock down, chase a lace count, or line up several tricks and work the whole set in one sesh.',
  },
  {
    title: 'Custom tricks',
    caption: 'Got a move that’s not in the standard Kentei set? Name it, rank it, and it joins your rotation.',
  },
  {
    title: 'Progress you can point to',
    caption: 'Improve your consistency - set a lace or time target per trick and watch your lace rate climb over time.',
  },
];

const MOBILE_SCREENSHOT_ASSETS: readonly PlatformScreenshotAsset[] = [
  {
    source: require('@/assets/images/landing/home-screen.png'),
    alt: 'Daily Dama home screen showing a practice streak, the last sesh, and the current practice queue',
    aspectRatio: 375 / 812,
  },
  {
    source: require('@/assets/images/landing/sesh-open-ended.png'),
    alt: 'Sesh setup screen with the open-ended format selected, a target lace count, and a focused-trick list spanning several Kentei ranks',
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
    source: require('@/assets/images/landing/sesh-open-ended-web.png'),
    alt: 'Sesh setup screen in the desktop web layout with the open-ended format selected, a target lace count, and a focused-trick list spanning several Kentei ranks',
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

const emptySubscribe = () => () => {};

export function LandingPage() {
  const { width } = useWindowDimensions();
  // In the static web export, the prerendered HTML is built by a Node process with no real
  // window, so `useWindowDimensions()` resolves some fallback width there -- different from
  // the browser's actual first-paint value. Deriving `isWebLayout` straight from `width` made
  // that mismatch a genuine hydration divergence: the mobile/desktop-conditional `max-width`
  // and `padding` baked into the prerendered `Content` markup could permanently stick at the
  // server's guess even once `width` itself read correctly on the very first client render,
  // because that render is a hydration *adoption* of the existing server DOM rather than an
  // ordinary patch. `hasHydrated` intentionally renders the server-matching (mobile, `false`)
  // layout through hydration and only switches once past that boundary -- the same
  // `useSyncExternalStore` gate `useCachedOnboardingStatus` and `useCachedGuestTheme` already
  // use for this identical prerender/first-paint mismatch, which resolves before the browser
  // paints so there is no visible flip (see use-cached-onboarding-status.ts).
  const hasHydrated = useSyncExternalStore(emptySubscribe, () => true, () => false);
  const isWebLayout = hasHydrated && Platform.OS === 'web' && width >= 768;
  const screenshots = isWebLayout ? WEB_SCREENSHOTS : MOBILE_SCREENSHOTS;

  return (
    <Screen background={AppColors.paper} includeWebHeaderInset={false}>
      <LandingScroll contentContainerStyle={{ paddingBottom: 80 }}>
        <LandingAuthCta />
        <Content testID="landing-content" $isWebLayout={isWebLayout}>
          {/* <LandingHero /> */}
          <Eyebrow>Why Daily Dama</Eyebrow>
          <Headline>Play with intention.</Headline>
          <Lede>
            There’s nothing better than a great kendama flow. The problem, however, is that the
            flow state lends itself to landing the tricks you already know rather than learning
            tricks you have yet to land. Daily Dama is here to help you along the new trick
            grind. Define a goal, hold your focus, and watch yourself improve.
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

          <ScreenshotSection testID="screenshot-section">
            <ScreenshotHeading>See it in action</ScreenshotHeading>
            {screenshots.map((screenshot, index) => (
              <ScreenshotEntry
                key={screenshot.alt}
                screenshot={screenshot}
                index={index}
                isWebLayout={isWebLayout}
              />
            ))}
          </ScreenshotSection>

          <Closing>
            Kendama is one of the best ways to get away from screens. Daily Dama isn’t here to
            ruin that - it’s here for the times where you want to grind new tricks and collect
            the effort you’ve put forth while doing so.
          </Closing>
        </Content>
      </LandingScroll>
    </Screen>
  );
}

function useHasEnteredViewport(
  ref: { current: ComponentRef<typeof Animated.View> | null },
  skipObserver: boolean,
) {
  const isWeb = Platform.OS === 'web' && typeof IntersectionObserver !== 'undefined';
  const [hasEntered, setHasEntered] = useState(() => !isWeb);

  useEffect(() => {
    if (hasEntered) return;

    // The first screenshot plays its entrance animation unconditionally rather than waiting
    // on the observer: it is the section's lead-in and should never depend on the visitor
    // already having it in view (or scrolling to it) the way later screenshots do. Deferring
    // that trigger to a rAF tick (rather than setting it synchronously during the initial
    // render) matters on web: the static export's window-dimension read can still be settling
    // into its real desktop/mobile value on first paint, and starting the entrance animation
    // before that settles bakes the wrong (often near-collapsed) layout into the animated
    // element permanently.
    if (skipObserver) {
      const frame = requestAnimationFrame(() => setHasEntered(true));
      return () => cancelAnimationFrame(frame);
    }

    const node = ref.current;
    if (!node) return;

    // Shrinking the bottom edge of the (default, root: null) viewport by one-third makes the
    // *effective* observed region the top two-thirds of the viewport, so `isIntersecting` only
    // flips true once the element scrolls into that band. Computed once at observer-creation
    // time from window.innerHeight (not a CSS percentage rootMargin, which is less consistently
    // supported against the implicit root) -- this is a one-shot trigger, not a live breakpoint,
    // so no resize listener keeps it current.
    const bottomMargin = Math.round(window.innerHeight / 4);
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry && entry.isIntersecting) {
          setHasEntered(true);
        }
      },
      { rootMargin: `0px 0px -${bottomMargin}px 0px`, threshold: 0 },
    );
    observer.observe(node as unknown as Element);
    return () => observer.disconnect();
  }, [hasEntered, ref, skipObserver]);

  return hasEntered;
}

interface ScreenshotEntryProps {
  readonly screenshot: Screenshot;
  readonly index: number;
  readonly isWebLayout: boolean;
}

function ScreenshotEntry({ screenshot, index, isWebLayout }: ScreenshotEntryProps) {
  const itemRef = useRef<ComponentRef<typeof Animated.View>>(null);
  const hasEntered = useHasEnteredViewport(itemRef, index === 0);

  return (
    <ScreenshotItem
      key={hasEntered ? 'entered' : 'pending'}
      ref={itemRef}
      testID="screenshot-item"
      $isWebLayout={isWebLayout}
      entering={hasEntered ? FadeInUp.duration(1200).springify().delay(index * 100) : undefined}
      style={hasEntered ? { boxShadow: `8px 8px 0 ${AppColors.ink}` } : { boxShadow: `8px 8px 0 ${AppColors.ink}`, opacity: 0 }}
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
  );
}

const LandingScroll = styled(ScrollView)`
  flex: 1;
  width: 100%;
`;

// Shared with `ScreenshotItem` so the showcase's desktop width always matches the page's
// text column instead of duplicating the literal in two places.
const DESKTOP_CONTENT_MAX_WIDTH = 1200;

const Content = styled.View<{ readonly $isWebLayout: boolean }>`
  width: 100%;
  max-width: ${({ $isWebLayout }) => ($isWebLayout ? DESKTOP_CONTENT_MAX_WIDTH : 620)}px;
  align-self: center;
  padding: ${({ $isWebLayout }) => ($isWebLayout ? '40px 48px 80px' : '40px 22px 80px')};
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
  align-items: center;
`;

const ScreenshotHeading = styled.Text`
  color: ${AppColors.ink};
  font-size: 28px;
  font-weight: 900;
  letter-spacing: -0.6px;
`;

// `boxShadow` is passed as an explicit `style` prop at the JSX call site (not baked into
// `.attrs`) -- see landing-cta.tsx's `CtaPanel` for the full explanation of why
// styled-components/native's `.attrs({ style: {...} })` config alone would be inert here.
const ScreenshotItem = styled(Animated.View)<{ readonly $isWebLayout: boolean }>`
  gap: 10px;
  align-items: center;
  width: 100%;
  max-width: ${({ $isWebLayout }) => ($isWebLayout ? DESKTOP_CONTENT_MAX_WIDTH : 360)}px;
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

