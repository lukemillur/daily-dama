import { Redirect } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Screen } from '@/components/ui/screen';
import { AppColors } from '@/constants/theme';
import { MultiTrickSesh } from '@/features/sesh/components/multi-trick-sesh';
import { createOpenEndedSeshPlan } from '@/features/sesh/model/sesh';
import { KENDAMA_KENTEI_TRICKS } from '@/features/tricks/data/kendama-kentei-tricks';
import { selectAvailablePracticeTricks } from '@/features/tricks/model/trick-directory';

/**
 * Dev-only sandbox for the multi-trick sequencing layer (`MultiTrickSesh`). Nested under
 * the stats route for the same reason trick-viz-sandbox.tsx is: it already
 * has a Stack layout, whereas the NativeTabs/Tabs root only hosts routes
 * tied to a registered tab trigger. Not linked from the tab nav; only
 * reachable via the dev-only link on Home, and inert outside local
 * development regardless of how the URL is reached.
 */
export default function SeshSequenceSandbox() {
  const [runKey, setRunKey] = useState(0);
  const [finished, setFinished] = useState(false);
  const tricks = useMemo(() => selectAvailablePracticeTricks(KENDAMA_KENTEI_TRICKS, []).slice(0, 3), []);
  const plan = useMemo(() => createOpenEndedSeshPlan(), []);

  if (!__DEV__) {
    return <Redirect href="/app/home" />;
  }

  return (
    <Screen background={AppColors.paper} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <Text style={styles.title}>Sesh sequence sandbox</Text>
        <Text style={styles.subtitle}>
          {tricks.map((trick) => trick.name).join(' → ')}
        </Text>
      </View>
      {finished ? (
        <View style={styles.finished}>
          <Text style={styles.finishedText}>Run finished — check practice history for 3 records, in order.</Text>
          <Text
            accessibilityRole="button"
            onPress={() => {
              setFinished(false);
              setRunKey((key) => key + 1);
            }}
            style={styles.restart}>
            Run again
          </Text>
        </View>
      ) : (
        <MultiTrickSesh key={runKey} tricks={tricks} plan={plan} onFinished={() => setFinished(true)} />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 4,
  },
  title: {
    color: AppColors.ink,
    fontSize: 18,
    fontWeight: '900',
  },
  subtitle: {
    color: AppColors.textMuted,
    fontSize: 12,
    fontWeight: '700',
    marginTop: 4,
  },
  finished: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 16,
  },
  finishedText: {
    color: AppColors.ink,
    fontSize: 16,
    fontWeight: '800',
    textAlign: 'center',
  },
  restart: {
    color: AppColors.red,
    fontSize: 15,
    fontWeight: '900',
    textDecorationLine: 'underline',
  },
});
