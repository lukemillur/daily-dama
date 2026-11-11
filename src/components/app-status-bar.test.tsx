import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { StatusBar } from 'expo-status-bar';
import * as ReactNative from 'react-native';
import { act, create } from 'react-test-renderer';

import { AppStatusBar } from '@/components/app-status-bar';

jest.mock('expo-status-bar', () => ({
  StatusBar: () => null,
}));

const originalPlatformOS = ReactNative.Platform.OS;

function render(background: string) {
  let root!: ReturnType<typeof create>;
  act(() => {
    root = create(<AppStatusBar background={background} />);
  });
  return root;
}

describe('AppStatusBar', () => {
  afterEach(() => {
    ReactNative.Platform.OS = originalPlatformOS;
  });

  it('passes dark icons for a pale background and light icons for a dark one', () => {
    ReactNative.Platform.OS = 'android';
    expect(render('#fbdcd6').root.findByType(StatusBar).props.style).toBe('dark');
    expect(render('#101820').root.findByType(StatusBar).props.style).toBe('light');
  });

  it('renders nothing on web', () => {
    ReactNative.Platform.OS = 'web';
    expect(render('#fbdcd6').toJSON()).toBeNull();
  });
});
