import { Redirect } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { KendamaModelScene } from '@/features/kendama-model/components/KendamaModelScene';
import { MODEL_VIEWS, type ModelView } from '@/features/kendama-model/model/views';

/**
 * Dev-only turntable for the anatomical kendama model, independent of the
 * trick visualization. Nested under stats for the same reason as the trick
 * sandbox: the tab router only hosts routes with a registered tab trigger.
 */
export default function KendamaModelSandbox() {
  const [view, setView] = useState<ModelView>('spike');
  const [spinning, setSpinning] = useState(false);

  if (!__DEV__) {
    return <Redirect href="/app/home" />;
  }

  return (
    <View style={styles.root}>
      <KendamaModelScene view={view} autoRotate={spinning} />
      {/* Bottom stack: the web tab nav's hit area covers the top of the route. */}
      <View style={styles.hud}>
        <View style={styles.row}>
          {MODEL_VIEWS.map((option) => (
            <Pressable
              key={option.id}
              accessibilityRole="button"
              accessibilityState={{ selected: option.id === view }}
              onPress={() => setView(option.id)}
              style={[styles.chip, option.id === view && styles.chipActive]}
            >
              <Text style={styles.chipLabel}>{option.label}</Text>
            </Pressable>
          ))}
          <Pressable
            accessibilityRole="switch"
            accessibilityState={{ checked: spinning }}
            onPress={() => setSpinning((on) => !on)}
            style={[styles.chip, spinning && styles.chipActive]}
          >
            <Text style={styles.chipLabel}>Turntable</Text>
          </Pressable>
        </View>
        <Text style={styles.readout}>Drag to orbit · scroll to zoom</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#efe9df',
  },
  hud: {
    position: 'absolute',
    bottom: 24,
    left: 0,
    right: 0,
    alignItems: 'center',
    gap: 8,
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 12,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#c9bba6',
    backgroundColor: '#f8f4ee',
  },
  chipActive: {
    borderColor: '#7a4a1f',
    backgroundColor: '#ead3ad',
  },
  chipLabel: {
    color: '#3b2a1a',
    fontSize: 13,
  },
  readout: {
    color: '#8a7a66',
    fontSize: 12,
  },
});
