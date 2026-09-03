import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { Platform } from 'react-native';
import { initSentry, resetSentryClientForTests } from '@/shared/observability/sentry-client';

const mockInit = jest.fn((..._args: unknown[]) => undefined);
jest.mock('@sentry/react-native', () => ({
  init: (...args: unknown[]) => mockInit(...args),
}));

const mockConsoleWarn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);

describe('initSentry', () => {
  const originalDsn = process.env.EXPO_PUBLIC_SENTRY_DSN;
  const originalPlatformOS = Platform.OS;

  afterEach(() => {
    process.env.EXPO_PUBLIC_SENTRY_DSN = originalDsn;
    Platform.OS = originalPlatformOS;
    mockInit.mockClear();
    mockConsoleWarn.mockClear();
    resetSentryClientForTests();
  });

  it('never initializes on native platforms regardless of config', () => {
    Platform.OS = 'ios';
    process.env.EXPO_PUBLIC_SENTRY_DSN = 'https://examplePublicKey@o0.ingest.sentry.io/0';

    initSentry();

    expect(mockInit).not.toHaveBeenCalled();
  });

  it('never initializes and does not warn when the DSN is missing', () => {
    Platform.OS = 'web';
    delete process.env.EXPO_PUBLIC_SENTRY_DSN;

    initSentry();

    expect(mockInit).not.toHaveBeenCalled();
    expect(mockConsoleWarn).not.toHaveBeenCalled();
  });

  it('never initializes and warns when the DSN is malformed', () => {
    Platform.OS = 'web';
    process.env.EXPO_PUBLIC_SENTRY_DSN = 'not-a-url';

    initSentry();

    expect(mockInit).not.toHaveBeenCalled();
    expect(mockConsoleWarn).toHaveBeenCalledTimes(1);
  });

  it('initializes with sendDefaultPii disabled for a valid DSN on web', () => {
    Platform.OS = 'web';
    process.env.EXPO_PUBLIC_SENTRY_DSN = 'https://examplePublicKey@o0.ingest.sentry.io/0';

    initSentry();

    expect(mockInit).toHaveBeenCalledTimes(1);
    expect(mockInit).toHaveBeenCalledWith({
      dsn: 'https://examplePublicKey@o0.ingest.sentry.io/0',
      sendDefaultPii: false,
    });
  });

  it('only initializes once across repeated calls', () => {
    Platform.OS = 'web';
    process.env.EXPO_PUBLIC_SENTRY_DSN = 'https://examplePublicKey@o0.ingest.sentry.io/0';

    initSentry();
    initSentry();

    expect(mockInit).toHaveBeenCalledTimes(1);
  });
});
