import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, create } from 'react-test-renderer';

type Decision = 'show-start' | 'redirect-home' | undefined;
let mockDecision: Decision;
jest.mock('../state/use-native-start-route', () => ({
  useNativeStartRoute: () => mockDecision,
}));
jest.mock('./native-start-screen', () => ({ NativeStartScreen: () => null }));
const mockReleased = jest.fn();
jest.mock('@/shared/splash/splash-ready', () => ({
  HideSplashWhenMounted: () => {
    mockReleased();
    return null;
  },
}));

import { NativeStartRoute } from './native-start-route';

describe('NativeStartRoute splash release', () => {
  beforeEach(() => {
    mockReleased.mockClear();
  });

  it.each<Decision>([undefined, 'redirect-home'])(
    'keeps the splash held while the decision is %s',
    (decision) => {
      mockDecision = decision;
      act(() => {
        create(<NativeStartRoute />);
      });
      expect(mockReleased).not.toHaveBeenCalled();
    },
  );

  it('releases the splash once the Start screen shows', () => {
    mockDecision = 'show-start';
    act(() => {
      create(<NativeStartRoute />);
    });
    expect(mockReleased).toHaveBeenCalledTimes(1);
  });
});
