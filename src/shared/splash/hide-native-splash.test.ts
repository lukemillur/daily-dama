import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Platform } from 'react-native';

const mockHide = jest.fn<() => Promise<boolean>>();
const mockPrevent = jest.fn<() => Promise<boolean>>();
jest.mock('expo-splash-screen', () => ({
  hideAsync: () => mockHide(),
  preventAutoHideAsync: () => mockPrevent(),
}));

import {
  hideNativeSplash,
  holdNativeSplash,
  resetNativeSplashForTests,
} from './hide-native-splash';

describe('native splash helpers', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockHide.mockReset().mockResolvedValue(true);
    mockPrevent.mockReset().mockResolvedValue(true);
    resetNativeSplashForTests();
    Platform.OS = 'ios';
  });

  it('hides once however many surfaces release it', () => {
    hideNativeSplash();
    hideNativeSplash();
    expect(mockHide).toHaveBeenCalledTimes(1);
  });

  it('does nothing on web', () => {
    Platform.OS = 'web';
    holdNativeSplash();
    hideNativeSplash();
    expect(mockPrevent).not.toHaveBeenCalled();
    expect(mockHide).not.toHaveBeenCalled();
  });

  it('swallows a rejected hide', async () => {
    mockHide.mockRejectedValue(new Error('not ready'));
    expect(() => hideNativeSplash()).not.toThrow();
    await Promise.resolve();
  });

  it('releases after the safety timeout if no screen did', () => {
    holdNativeSplash();
    expect(mockPrevent).toHaveBeenCalledTimes(1);
    expect(mockHide).not.toHaveBeenCalled();
    jest.advanceTimersByTime(8000);
    expect(mockHide).toHaveBeenCalledTimes(1);
  });
});
