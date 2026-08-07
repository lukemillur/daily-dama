import { OrbitControls } from '@react-three/drei';
import { Redirect } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { TrickScene } from '@/features/trick-viz/components/TrickScene';
import { BIG_CUP_KEYFRAMES } from '@/features/trick-viz/model/tricks/bigCup';

/**
 * Dev-only sandbox for the procedural trick visualization work. Nested
 * under the stats route (which already has a Stack layout) rather than the
 * NativeTabs/Tabs root, since those tab navigators only host routes tied to
 * a registered tab trigger. Not linked from the tab nav; only reachable via
 * the dev-only link on Home, and inert outside local development regardless
 * of how the URL is reached.
 */
export default function TrickVizSandbox() {
  if (!__DEV__) {
    return <Redirect href="/" />;
  }

  return (
    <View style={styles.root}>
      <TrickScene keyframes={BIG_CUP_KEYFRAMES} canvasExtras={<OrbitControls />}>
        {({ replay }) => (
          <View style={styles.hud}>
            <Button size="medium" onPress={replay}>
              Replay
            </Button>
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
    bottom: 32,
    alignSelf: 'center',
  },
});
