import { Pressable, View, StyleSheet } from "react-native";

import { ThemedText } from "@/components/themed-text";
import { AppColors, Spacing } from "@/constants/theme";
import { useAppLocalDurability } from "@/shared/persistence/use-app-local-durability";

/**
 * App-shell, non-blocking warning for a local-save failure in any of the five
 * persistence domains. Deliberately distinct from cloud SyncStatus copy: the
 * text below never mentions syncing, conflicts, or pending cloud operations,
 * only whether the current change is safely on this device.
 */
export function LocalDurabilityWarningBanner() {
  const { hasFailure, failedLabels, isRetrying, retryAll } = useAppLocalDurability();

  if (!hasFailure) {
    return null;
  }

  const domainList = failedLabels.join(", ");

  return (
    <View
      style={styles.container}
      accessibilityRole="alert"
      accessibilityLiveRegion="assertive"
    >
      <ThemedText type="small" style={styles.text}>
        {`Not saved on this device yet: ${domainList}. This is separate from cloud sync.`}
      </ThemedText>
      <Pressable
        accessibilityRole="button"
        disabled={isRetrying}
        accessibilityState={{ disabled: isRetrying, busy: isRetrying }}
        onPress={() => {
          void retryAll();
        }}
        style={({ pressed }) => [styles.retryButton, pressed && styles.retryButtonPressed]}
      >
        <ThemedText type="smallBold" style={styles.retryText}>
          {isRetrying ? "Retrying..." : "Retry"}
        </ThemedText>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: Spacing.two,
    backgroundColor: AppColors.red,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
  },
  text: {
    color: AppColors.cream,
    flexShrink: 1,
    flexGrow: 1,
  },
  retryButton: {
    borderWidth: 1,
    borderColor: AppColors.cream,
    borderRadius: Spacing.one,
    paddingVertical: Spacing.half,
    paddingHorizontal: Spacing.two,
  },
  retryButtonPressed: {
    opacity: 0.7,
  },
  retryText: {
    color: AppColors.cream,
  },
});
