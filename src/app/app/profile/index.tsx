import { useRouter } from "expo-router";
import { useState } from "react";
import { Linking, ScrollView, TextInput } from "react-native";
import { styled } from "styled-components/native";

import { Button } from "@/components/ui/button";
import { Screen } from "@/components/ui/screen";
import { BodyText, DisplayTitle, Eyebrow } from "@/components/ui/typography";
import { AppColors, BottomTabInset } from "@/constants/theme";
import { AccountSection } from "@/features/auth/components/account-section";
import { GuestAccountSection } from "@/features/auth/components/guest-account-section";
import { GuestImportPreview } from "@/features/guest-import/components/guest-import-preview";
import { useRequireOnboarding } from "@/features/onboarding/state/require-onboarding";
import { RainbowThemePresets } from "@/features/profile/components/rainbow-theme-presets";
import { ThemeColorPicker } from "@/features/profile/components/theme-color-picker";
import {
  createStreakThresholdMs,
  DEFAULT_STREAK_THRESHOLD_MS,
  isValidStreakThresholdMinutes,
} from "@/features/profile/model/user-profile";
import {
  useUserProfile,
  useUserProfileActions,
} from "@/features/profile/state/user-profile-provider";

export default function ProfileScreen() {
  const isOnboardingComplete = useRequireOnboarding();
  const router = useRouter();
  const { kenteiRank, selectedTrickIds, streakThresholdMs } = useUserProfile();
  const { setStreakThresholdMs } = useUserProfileActions();

  if (!isOnboardingComplete || !kenteiRank) return null;

  return (
    <Screen edges={["top", "left", "right"]}>
      <ProfileScroll
        contentContainerStyle={{ paddingBottom: 120 + BottomTabInset }}
      >
        <Content>
          <Eyebrow>Your profile</Eyebrow>
          <RankLine>
            <RankNumber>{String(kenteiRank).padStart(2, "0")}</RankNumber>
            <RankIdentity>
              <RankLabel>Assessed Kentei rank</RankLabel>
              <RankContext>
                Your current frontier, with {selectedTrickIds.length}{" "}
                {selectedTrickIds.length === 1 ? "trick" : "tricks"} in
                rotation.
              </RankContext>
            </RankIdentity>
          </RankLine>
          <AccountSection />
          <GuestImportPreview />
          <GuestAccountSection />
          <Divider />
          <SectionLabel>Kentei assessment</SectionLabel>
          <Title>Put it to{`\n`}the test.</Title>
          <Copy>
            Run a real, timed assessment through your tricks. Every landing
            counts as practice history, so a full pass through a rank promotes
            you automatically.
          </Copy>
          <RetakeButton
            onPress={() => router.push("/app/profile/kentei-assessment")}
          >
            Start Kentei assessment
          </RetakeButton>
          <Divider />
          <RainbowThemePresets />
          <Divider />
          <ThemeColorPicker />
          <Divider />
          <StreakSettings
            streakThresholdMs={streakThresholdMs}
            onSave={setStreakThresholdMs}
          />
          <Divider />
          <SectionLabel>Feedback</SectionLabel>
          <Title>Something{`\n`}feel off?</Title>
          <Copy>
            Daily Dama is a work in progress. Bug reports, trick corrections,
            and feature requests all help.
          </Copy>
          <RetakeButton
            onPress={() =>
              Linking.openURL(
                "mailto:test@gmail.com?subject=Daily%20Dama%20feedback",
              )
            }
          >
            Send feedback
          </RetakeButton>
        </Content>
      </ProfileScroll>
    </Screen>
  );
}

function StreakSettings({
  streakThresholdMs,
  onSave,
}: {
  readonly streakThresholdMs?: number;
  readonly onSave: (thresholdMs: number) => void;
}) {
  const persistedMinutes =
    (streakThresholdMs ?? DEFAULT_STREAK_THRESHOLD_MS) / 60_000;
  const [minutesText, setMinutesText] = useState(String(persistedMinutes));
  const parsedMinutes = Number(minutesText);
  const hasValidMinutes = isValidStreakThresholdMinutes(parsedMinutes);
  const isDirty = hasValidMinutes && parsedMinutes !== persistedMinutes;

  return (
    <>
      <SectionLabel>Daily streak</SectionLabel>
      <Title>How much practice{`\n`}counts as a day?</Title>
      <Copy>
        Log at least this much sesh time in a day to keep your streak alive.
      </Copy>
      <DurationField>
        <DurationLabel>Minutes</DurationLabel>
        <DurationInput
          accessibilityLabel="Streak threshold in minutes"
          inputMode="numeric"
          keyboardType="number-pad"
          maxLength={2}
          onChangeText={setMinutesText}
          selectTextOnFocus
          value={minutesText}
        />
        <DurationHint $invalid={!hasValidMinutes}>
          {hasValidMinutes
            ? "Choose any whole minute from 1 to 60."
            : "Enter a whole number from 1 to 60."}
        </DurationHint>
      </DurationField>
      <SaveButton
        disabled={!isDirty}
        onPress={() =>
          hasValidMinutes && onSave(createStreakThresholdMs(parsedMinutes))
        }
      >
        Save
      </SaveButton>
    </>
  );
}

const ProfileScroll = styled(ScrollView)`
  flex: 1;
  width: 100%;
`;
const Content = styled.View`
  width: 100%;
  max-width: 760px;
  align-self: center;
  padding: 40px 22px 0;
`;
const RankLine = styled.View`
  flex-direction: row;
  align-items: center;
  gap: 22px;
  margin-top: 18px;
`;
const RankNumber = styled.Text`
  color: ${({ theme }) => theme.text};
  font-size: 78px;
  font-weight: 900;
  letter-spacing: -5px;
  line-height: 84px;
`;
const RankIdentity = styled.View`
  flex: 1;
`;
const RankLabel = styled.Text`
  color: ${({ theme }) => theme.text};
  font-size: 17px;
  font-weight: 900;
  text-transform: uppercase;
`;
const RankContext = styled(BodyText)`
  font-size: 14px;
  line-height: 20px;
  margin-top: 5px;
`;
const Divider = styled.View`
  height: 2px;
  background-color: ${AppColors.ink};
  margin: 28px 0 30px;
`;
const SectionLabel = styled(Eyebrow)`
  font-size: 11px;
`;
const Title = styled(DisplayTitle)`
  margin-top: 10px;
`;
const Copy = styled(BodyText)`
  max-width: 500px;
  margin-top: 16px;
`;
const RetakeButton = styled(Button).attrs({
  variant: "secondary",
  size: "medium",
})`
  align-self: flex-start;
  margin-top: 26px;
`;
const DurationField = styled.View`
  margin-top: 22px;
`;
const DurationLabel = styled.Text`
  color: ${({ theme }) => theme.text};
  font-size: 12px;
  font-weight: 900;
  margin-bottom: 6px;
  text-transform: uppercase;
`;
const DurationInput = styled(TextInput)`
  height: 54px;
  width: 110px;
  background-color: ${AppColors.paper};
  border: 2px solid ${AppColors.ink};
  color: ${AppColors.ink};
  font-size: 24px;
  font-weight: 900;
  padding: 8px 12px;
`;
const DurationHint = styled.Text<{ $invalid: boolean }>`
  color: ${({ $invalid, theme }) => ($invalid ? AppColors.red : theme.text)};
  font-size: 12px;
  font-weight: 700;
  margin-top: 7px;
`;
const SaveButton = styled(Button).attrs({ size: "medium" })`
  align-self: flex-start;
  margin-top: 20px;
`;
