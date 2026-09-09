import type { ErrorBoundaryProps } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { AppColors, Spacing } from "@/constants/theme";

/**
 * Branded, route-level recovery surface for fatal render errors caught by Expo Router's
 * `ErrorBoundary` convention (see `src/app/_layout.tsx`, which re-exports this as the app's
 * single top-level `ErrorBoundary`). Expo Router mounts this component's tree *above* every
 * context provider the rest of the app relies on (styled-components `ThemeProvider`,
 * `AppThemeProvider`, `AuthProvider`) -- it must stay dependency-free RN primitives only.
 * Deliberately distinct in copy from both expo-router's own default fallback ("Something went
 * wrong") and the app's expected-failure UI (auth/submission "Something went wrong. Please try
 * again."), so a genuinely unexpected render crash is visibly different from either.
 */
export function FatalErrorFallback({ error, retry }: ErrorBoundaryProps) {
  return (
    <View style={styles.container}>
      <Text accessibilityRole="header" style={styles.heading}>
        Daily Dama hit a snag
      </Text>
      <Text style={styles.body}>
        Something unexpected happened on this screen. Your practice data already saved on this
        device is not affected.
      </Text>
      {__DEV__ ? <Text style={styles.devDetail}>{error.message}</Text> : null}
      <Pressable
        accessibilityRole="button"
        onPress={() => {
          void retry();
        }}
        style={({ pressed }) => [styles.retryButton, pressed && styles.retryButtonPressed]}
      >
        <Text style={styles.retryText}>Try again</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: AppColors.paper,
    paddingHorizontal: Spacing.four,
    gap: Spacing.three,
  },
  heading: {
    fontSize: 22,
    fontWeight: "700",
    color: AppColors.ink,
    textAlign: "center",
  },
  body: {
    fontSize: 15,
    color: AppColors.textMuted,
    textAlign: "center",
  },
  devDetail: {
    fontSize: 12,
    color: AppColors.textSubtle,
    textAlign: "center",
  },
  retryButton: {
    borderWidth: 1,
    borderColor: AppColors.ink,
    borderRadius: Spacing.two,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.four,
    marginTop: Spacing.two,
  },
  retryButtonPressed: {
    opacity: 0.7,
  },
  retryText: {
    fontSize: 16,
    fontWeight: "600",
    color: AppColors.ink,
  },
});
