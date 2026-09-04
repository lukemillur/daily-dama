import type { AuthErrorCategory } from "@/features/auth/model/auth-errors";

// Only offline and unknown are realistically reachable here per the signOut({ scope: local })
// SDK trace in T154.2s plans (an already-expired/invalid session signs out silently, never
// surfacing as an error) -- the rest are filled with the same generic fallback for type
// completeness, mirroring SUBMIT_ERROR_COPYs shape in sign-in-screen.tsx.
export const LOG_OUT_ERROR_COPY: Record<AuthErrorCategory, string> = {
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
