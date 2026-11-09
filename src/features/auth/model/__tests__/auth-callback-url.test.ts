import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { Platform } from 'react-native';

import { buildAuthCallbackUrl } from '@/features/auth/model/auth-callback-url';

// Jest has no app manifest; expo-linking's createURL needs one to resolve the scheme.
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { scheme: 'dailydama' }, executionEnvironment: 'standalone' },
  ExecutionEnvironment: { Bare: 'bare', Standalone: 'standalone', StoreClient: 'storeClient' },
}));

type WindowHolder = { window?: unknown };
const holder = globalThis as WindowHolder;
const originalWindow = holder.window;

afterEach(() => {
  holder.window = originalWindow;
  jest.restoreAllMocks();
});

function setPlatform(os: 'web' | 'ios' | 'android') {
  jest.replaceProperty(Platform, 'OS', os);
}

describe('buildAuthCallbackUrl', () => {
  it('returns the current web callback URLs from the window origin', () => {
    setPlatform('web');
    holder.window = { location: { origin: 'https://dailydama.com' } };

    expect(buildAuthCallbackUrl()).toBe('https://dailydama.com/auth/callback');
    expect(buildAuthCallbackUrl({ flow: 'email_change' })).toBe(
      'https://dailydama.com/auth/callback?flow=email_change',
    );
  });

  it('returns undefined on web when there is no window', () => {
    setPlatform('web');
    holder.window = undefined;

    expect(buildAuthCallbackUrl()).toBeUndefined();
  });

  it.each(['ios', 'android'] as const)('returns the dailydama scheme URLs on %s', (os) => {
    setPlatform(os);

    expect(buildAuthCallbackUrl()).toBe('dailydama://auth/callback');
    expect(buildAuthCallbackUrl({ flow: 'email_change' })).toBe('dailydama://auth/callback?flow=email_change');
  });

  it.each(['ios', 'android'] as const)('never reads window on %s', (os) => {
    setPlatform(os);
    const touched: (string | symbol)[] = [];
    holder.window = new Proxy(
      {},
      {
        get(_target, property) {
          touched.push(property);
          throw new Error(`window.${String(property)} read on native`);
        },
      },
    );

    expect(buildAuthCallbackUrl({ flow: 'email_change' })).toBe('dailydama://auth/callback?flow=email_change');
    expect(touched).toEqual([]);
  });
});
