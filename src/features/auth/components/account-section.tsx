import { useRouter } from "expo-router";
import { useEffect, useRef } from "react";
import { styled } from "styled-components/native";

import { Button } from "@/components/ui/button";
import { BodyText, DisplayTitle } from "@/components/ui/typography";
import { AppColors } from "@/constants/theme";
import { LOG_OUT_ERROR_COPY } from "@/features/auth/model/log-out-error-copy";
import { useAuthState } from "@/features/auth/state/auth-provider";
import { useLogoutGuard } from "@/features/auth/state/use-logout-guard";
import { LogoutPrompt } from "@/features/auth/components/logout-prompt";

export function AccountSection() {
  const authState = useAuthState();
  const router = useRouter();
  const { state, pendingCount, handleLogOutPress, handleRetry, handleDiscard, handleCancel } = useLogoutGuard();

  // T175: useLogoutGuard is deliberately UI-agnostic (see its own comments), so
  // the completed-sign-out -> "/" redirect lives here instead. Watch for the
  // signingOut -> idle transition with no error, which only happens once
  // signOut() itself has actually succeeded (a failed signOut also returns to
  // idle, but carries an errorCategory and must leave the user in place to see
  // it and retry).
  const previousStatusRef = useRef(state.status);
  useEffect(() => {
    const previousStatus = previousStatusRef.current;
    previousStatusRef.current = state.status;
    if (previousStatus === "signingOut" && state.status === "idle" && state.errorCategory === undefined) {
      router.replace("/");
    }
  }, [state.status, state.errorCategory, router]);

  if (authState.status !== "authenticated") return null;

  const isSubmitting = state.status !== "idle";
  const showPrompt = state.status === "prompt" || state.status === "retrying" || state.status === "discarding";

  return (
    <Section>
      <Divider />
      <Title>Account</Title>
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

// Local copies of Profiles own section chrome (Divider/Title) rather than importing
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
const Title = styled(DisplayTitle)`
  margin-top: 10px;
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
