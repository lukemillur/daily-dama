import { Redirect } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { KendamaModelScene } from '@/features/kendama-model/components/KendamaModelScene';
import { StrungKendamaScene } from '@/features/kendama-model/components/StrungKendamaScene';
import type { BigCupPhase } from '@/features/kendama-model/model/big-cup';
import type { Grip, Handedness } from '@/features/kendama-model/model/stringing';
import type { StrungLayout } from '@/features/kendama-model/model/strung-render';
import { MODEL_VIEWS, type ModelView } from '@/features/kendama-model/model/views';

type Mode = 'anatomy' | 'strung';

const PHASE_LABELS: Record<BigCupPhase['kind'], string> = {
  settle: 'Big Cup · steadying the ball',
  pull: 'Big Cup · pull',
  rise: 'Big Cup · ball rising, cup moving under',
  catch: 'Big Cup · meeting the ball',
  absorb: 'Big Cup · cushioning',
  landed: 'Big Cup · landed',
  missed: 'Big Cup · missed',
};

type ChipProps = {
  label: string;
  active?: boolean;
  role?: 'button' | 'switch';
  onPress: () => void;
};

function Chip({ label, active = false, role = 'button', onPress }: ChipProps) {
  return (
    <Pressable
      accessibilityRole={role}
      accessibilityState={role === 'switch' ? { checked: active } : { selected: active }}
      onPress={onPress}
      style={[styles.chip, active && styles.chipActive]}
    >
      <Text style={styles.chipLabel}>{label}</Text>
    </Pressable>
  );
}

/**
 * Dev-only sandbox for the anatomical kendama model, independent of the
 * trick visualization: a static turntable of the parts, and the kendama
 * strung with simulated string physics. Nested under stats for the same
 * reason as the trick sandbox: the tab router only hosts routes with a
 * registered tab trigger.
 */
export default function KendamaModelSandbox() {
  const [mode, setMode] = useState<Mode>('strung');
  const [view, setView] = useState<ModelView>('spike');
  const [spinning, setSpinning] = useState(false);
  const [handedness, setHandedness] = useState<Handedness>('right');
  const [grip, setGrip] = useState<Grip>('big-cup');
  const [layout, setLayout] = useState<StrungLayout>('hanging');
  const [slowMotion, setSlowMotion] = useState(false);
  const [runCount, setRunCount] = useState(0);
  const [trickPhase, setTrickPhase] = useState<BigCupPhase['kind'] | null>(null);

  if (!__DEV__) {
    return <Redirect href="/app/home" />;
  }

  const restart = (next: StrungLayout) => {
    setLayout(next);
    setTrickPhase(null);
    setRunCount((count) => count + 1);
  };

  return (
    <View style={styles.root}>
      {mode === 'anatomy' ? (
        <KendamaModelScene view={view} autoRotate={spinning} />
      ) : (
        <StrungKendamaScene
          handedness={handedness}
          layout={layout}
          grip={grip}
          runToken={`${handedness}:${layout}:${runCount}`}
          slowMotion={slowMotion}
          onTrickPhase={setTrickPhase}
        />
      )}

      {/* Bottom stack: the web tab nav's hit area covers the top of the route. */}
      <View style={styles.hud}>
        {mode === 'anatomy' ? (
          <View style={styles.row}>
            {MODEL_VIEWS.map((option) => (
              <Chip
                key={option.id}
                label={option.label}
                active={option.id === view}
                onPress={() => setView(option.id)}
              />
            ))}
            <Chip
              label="Turntable"
              role="switch"
              active={spinning}
              onPress={() => setSpinning((on) => !on)}
            />
          </View>
        ) : (
          <View style={styles.row}>
            <Chip label="Big Cup" onPress={() => restart('big-cup')} />
            <Chip label="Drop" onPress={() => restart('drop')} />
            <Chip label="Reset" onPress={() => restart('hanging')} />
            <Chip
              label={handedness === 'right' ? 'Right-handed' : 'Left-handed'}
              onPress={() => setHandedness((side) => (side === 'right' ? 'left' : 'right'))}
            />
            <Chip
              label={grip === 'big-cup' ? 'Big-cup grip' : 'Spike up'}
              onPress={() => setGrip((held) => (held === 'big-cup' ? 'spike-up' : 'big-cup'))}
            />
            <Chip
              label="Slow-mo"
              role="switch"
              active={slowMotion}
              onPress={() => setSlowMotion((on) => !on)}
            />
          </View>
        )}
        <View style={styles.row}>
          <Chip label="Strung" active={mode === 'strung'} onPress={() => setMode('strung')} />
          <Chip label="Anatomy" active={mode === 'anatomy'} onPress={() => setMode('anatomy')} />
        </View>
        <Text style={styles.readout}>
          {mode === 'anatomy'
            ? 'Drag to orbit · scroll to zoom'
            : layout === 'big-cup' && trickPhase
              ? PHASE_LABELS[trickPhase]
              : 'Seen from behind you · drag the ken to move your hand · Shift-drag to tilt it'}
        </Text>
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
    textAlign: 'center',
    paddingHorizontal: 16,
  },
});
