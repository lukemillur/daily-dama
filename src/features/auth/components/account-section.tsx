import { useRouter } from "expo-router";
import { styled } from "styled-components/native";

import { Button } from "@/components/ui/button";
import { BodyText } from "@/components/ui/typography";
import { AppColors } from "@/constants/theme";
import type { AuthErrorCategory } from "@/features/auth/model/auth-errors";
import { useAuthState } from "@/features/auth/state/auth-provider";
import { useLogoutGuard } from "@/features/auth/state/use-logout-guard";
import { LogoutPrompt } from "@/features/auth/components/logout-prompt";

// Only offline and unknown are realistically reachable here per the signOut({ scope: local })
// SDK trace in T154.2s plans (an already-expired/invalid session signs out silently, never
// surfacing as an error) -- the rest are filled with the same generic fallback for type
// completeness, mirroring SUBMIT_ERROR_COPYs shape in sign-in-screen.tsx.
const LOG_OUT_ERROR_COPY: Record<AuthErrorCategory, string> = {
  invalidCredentials: "Something went wrong. Please try again.",
  unverifiedEmail: "Something went wrong. Please try again.",
  accountAlreadyExists: "Something went wrong. Please try again.",
  weakPassword: "Something went wrong. Please try again.",
  expiredOrInvalidLink: "Something went wrong. Please try again.",
  missingVerifier: "Something went wrong. Please try again.",
  rateLimited: "Something went wrong. Please try again.",
  offline: "You are offline. Check your connection and try again.",
  unknown: "Something went wrong. Please try again.",
};

export function AccountSection() {
  const authState = useAuthState();
  const router = useRouter();
  const { state, pendingCount, handleLogOutPress, handleRetry, handleDiscard, handleCancel } = useLogoutGuard();

  if (authState.status !== "authenticated") return null;

  const isSubmitting = state.status !== "idle";
  const showPrompt = state.status === "prompt" || state.status === "retrying" || state.status === "discarding";

  return (
    <Section>
      <Divider />
      <SectionLabel>Account</SectionLabel>
      <AccountEmail>{authState.session.user.email ?? "Your account"}</AccountEmail>
      <SecurityLinkButton
        accessibilityLabel="Manage account security"
        onPress={() => router.push("/app/profile/account/security")}
        variant="secondary">
        Manage account security
      </SecurityLinkButton>
      {state.errorCategory ? <ErrorText>{LOG_OUT_ERROR_COPY[state.errorCategory]}</ErrorText> : null}
      <LogOutButton
        accessibilityLabel="Log out"
        disabled={isSubmitting}
        onPress={handleLogOutPress}
        variant="secondary">
        {isSubmitting ? "Logging out..." : "Log out"}
      </LogOutButton>
      {showPrompt ? (
        <LogoutPrompt
          state={state}
          pendingCount={pendingCount}
          onRetry={handleRetry}
          onDiscard={handleDiscard}
          onCancel={handleCancel}
        />
      ) : null}
    </Section>
  );
}

// Local copies of Profiles own section chrome (Divider/SectionLabel) rather than importing
// from src/app/app/profile/index.tsx, which does not export them -- this keeps AccountSection
// self-contained, matching sign-in-screen.tsxs precedent of owning its own styles.
const Section = styled.View`
  width: 100%;
`;
const Divider = styled.View`
  height: 2px;
  background-color: ${AppColors.ink};
  margin: 28px 0 30px;
`;
const SectionLabel = styled.Text`
  color: ${({ theme }) => theme.text};
  font-size: 11px;
  font-weight: 900;
  letter-spacing: 1px;
  text-transform: uppercase;
`;
const AccountEmail = styled(BodyText)`
  margin-top: 10px;
`;
const ErrorText = styled.Text`
  color: ${AppColors.red};
  font-size: 12px;
  font-weight: 800;
  margin-top: 10px;
`;
const SecurityLinkButton = styled(Button).attrs({ size: "medium" })`
  align-self: flex-start;
  margin-top: 18px;
`;
const LogOutButton = styled(Button).attrs({ size: "medium" })`
  align-self: flex-start;
  margin-top: 18px;
`;
