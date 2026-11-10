import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";

// A CommonJS require resolves to the same react-native module object that connectivity.ts imports,
// so mutating Platform.OS is visible to it.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const ReactNative = require("react-native") as typeof import("react-native");

type NetState = { isConnected?: boolean; isInternetReachable?: boolean };
const mockListeners: ((state: NetState) => void)[] = [];
const mockRemove = jest.fn();
const mockGetState = jest.fn<() => Promise<NetState>>();
const mockAddListener = jest.fn((listener: (state: NetState) => void) => {
  mockListeners.push(listener);
  return { remove: mockRemove };
});
jest.mock("expo-network", () => ({
  getNetworkStateAsync: () => mockGetState(),
  addNetworkStateListener: (listener: (state: NetState) => void) => mockAddListener(listener),
}));

import { getInitialOnline, isOnlineFromNetworkState, subscribeToConnectivity } from "@/shared/network/connectivity";

const originalOS = ReactNative.Platform.OS;

beforeEach(() => {
  mockListeners.length = 0;
  mockRemove.mockClear();
  mockAddListener.mockClear();
  mockGetState.mockReset();
});
afterEach(() => {
  ReactNative.Platform.OS = originalOS;
  delete (globalThis as { window?: unknown }).window;
});

describe("isOnlineFromNetworkState", () => {
  it.each([
    [{ isConnected: true, isInternetReachable: true }, true],
    [{ isConnected: false, isInternetReachable: false }, false],
    [{ isConnected: false }, false],
    [{ isConnected: true, isInternetReachable: false }, false],
    [{ isConnected: true }, true],
    [{ isInternetReachable: undefined, isConnected: undefined }, true],
    [{}, true],
  ])("%j -> %s", (state, expected) => {
    expect(isOnlineFromNetworkState(state)).toBe(expected);
  });
});

describe("native", () => {
  beforeEach(() => {
    ReactNative.Platform.OS = "android";
  });

  it("emits mapped values, drops consecutive duplicates and unsubscribes via remove", () => {
    const listener = jest.fn();
    const unsubscribe = subscribeToConnectivity(listener);
    mockListeners[0]({ isConnected: true });
    mockListeners[0]({ isConnected: true, isInternetReachable: true });
    mockListeners[0]({ isConnected: false });
    mockListeners[0]({ isConnected: false, isInternetReachable: false });
    mockListeners[0]({ isConnected: true, isInternetReachable: true });
    expect(listener.mock.calls).toEqual([[true], [false], [true]]);
    unsubscribe();
    expect(mockRemove).toHaveBeenCalledTimes(1);
  });

  it("initial probe maps the reported state and fails open when the probe throws", async () => {
    mockGetState.mockResolvedValueOnce({ isConnected: false, isInternetReachable: false });
    await expect(getInitialOnline()).resolves.toBe(false);
    mockGetState.mockRejectedValueOnce(new Error("no module"));
    await expect(getInitialOnline()).resolves.toBe(true);
  });
});

describe("web", () => {
  it("uses window events and never touches expo-network", async () => {
    ReactNative.Platform.OS = "web";
    const handlers: Record<string, () => void> = {};
    (globalThis as { window?: unknown }).window = {
      navigator: { onLine: false },
      addEventListener: (type: string, handler: () => void) => {
        handlers[type] = handler;
      },
      removeEventListener: (type: string) => {
        delete handlers[type];
      },
    };
    const listener = jest.fn();
    const unsubscribe = subscribeToConnectivity(listener);
    handlers.offline();
    handlers.online();
    expect(listener.mock.calls).toEqual([[false], [true]]);
    await expect(getInitialOnline()).resolves.toBe(false);
    unsubscribe();
    expect(Object.keys(handlers)).toHaveLength(0);
    expect(mockAddListener).not.toHaveBeenCalled();
    expect(mockGetState).not.toHaveBeenCalled();
  });
});
