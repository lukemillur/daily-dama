import { afterEach, beforeEach } from '@jest/globals';
import { Platform } from 'react-native';

/**
 * Pins `Platform.OS` for the tests in the enclosing describe block. Call it at the top of a
 * describe; a nested describe may call it again to override the outer value.
 */
export function setPlatformOS(os: 'ios' | 'android' | 'web') {
  let original: typeof Platform.OS;
  beforeEach(() => {
    original = Platform.OS;
    (Platform as { OS: string }).OS = os;
  });
  afterEach(() => {
    (Platform as { OS: string }).OS = original;
  });
}
