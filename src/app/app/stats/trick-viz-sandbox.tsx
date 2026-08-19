import { OrbitControls } from '@react-three/drei';
import { Redirect } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { TrickScene } from '@/features/trick-viz/components/TrickScene';
import { TRICK_VISUALIZATIONS } from '@/features/trick-viz/model/tricks';

/** Positions to freeze at, as fractions of the trick. */
const SCRUB_STOPS = [0, 0.25, 0.5, 0.75, 1];

/**
 * Dev-only sandbox for the procedural trick visualization work. Nested
 * under the stats route (which already has a Stack layout) rather than the
 * NativeTabs/Tabs root, since those tab navigators only host routes tied to
 * a registered tab trigger. Not linked from the tab nav; only reachable via
 * the dev-only link on Home, and inert outside local development regardless
 * of how the URL is reached.
 */
export default function TrickVizSandbox() {
  const [trickIndex, setTrickIndex] = useState(0);
  // Free look hands the camera to OrbitControls; the follow rig and the
  // controls would otherwise both write to the camera every frame.
  const [freeLook, setFreeLook] = useState(false);
  // Freezing at a moment beats stretching the whole trick to twenty seconds
  // and remembering to put it back, which is how phases used to be checked.
  const [scrub, setScrub] = useState<number | null>(null);

  if (!__DEV__) {
    return <Redirect href="/app/home" />;
  }

  const trick = TRICK_VISUALIZATIONS[trickIndex];

  return (
    <View style={styles.root}>
      <TrickScene

        trick={trick}
        scrub={scrub}
        followAction={!freeLook}
        canvasExtras={({ target }) => (freeLook ? <OrbitControls target={target} /> : null)}
      >
        {({ replay }) => (
          // Everything lives in one bottom stack: the app's web tab nav
          // floats a full-width hit area across the top of the route, so
          // controls placed up there look clickable and are not.
          <View style={styles.hud}>
            <View style={styles.row}>
              {TRICK_VISUALIZATIONS.map((option, index) => (
                <Pressable
                  key={option.id}
                  onPress={() => setTrickIndex(index)}
                  style={[styles.chip, index === trickIndex && styles.chipActive]}
                >
                  <Text style={styles.chipLabel}>{option.name}</Text>
                </Pressable>
              ))}
            </View>

            <View style={styles.row}>
              <Pressable
                onPress={() => setScrub(null)}
                style={[styles.chip, scrub === null && styles.chipActive]}
              >
                <Text style={styles.chipLabel}>Play</Text>
              </Pressable>
              {SCRUB_STOPS.map((stop) => (
                <Pressable
                  key={stop}
                  onPress={() => setScrub(stop)}
                  style={[styles.chip, scrub === stop && styles.chipActive]}
                >
                  <Text style={styles.chipLabel}>{Math.round(stop * 100)}%</Text>
                </Pressable>
              ))}
            </View>

            <View style={styles.row}>
              <Button
                size="medium"
                onPress={() => {
                  setScrub(null);
                  replay();
                }}
              >
                Replay
              </Button>
              <Button size="medium" onPress={() => setFreeLook((on) => !on)}>
                {freeLook ? 'Follow cam' : 'Free look'}
              </Button>
            </View>

            <Text style={styles.readout}>
              {trick.name} · {trick.durationSeconds.toFixed(2)}s · {trick.samples.length} samples
            </Text>
          </View>
        )}
      </TrickScene>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#1c1c1c',
  },
  hud: {
    position: 'absolute',
    bottom: 24,
    // Stretched rather than centred: an absolutely positioned box has no
    // width of its own, so wrapping rows inside it would each take a line.
    left: 0,
    right: 0,
    alignItems: 'center',
    gap: 10,
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
    borderColor: '#5a5045',
    backgroundColor: '#2a2622',
  },
  chipActive: {
    borderColor: '#e0a868',
    backgroundColor: '#4a3823',
  },
  chipLabel: {
    color: '#f2e4c9',
    fontSize: 13,
  },
  readout: {
    color: '#9a8f82',
    fontSize: 12,
  },
});
