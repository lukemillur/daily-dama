// Jest has no ExpoNetwork native module. Tests that exercise connectivity
// override this with their own jest.mock("expo-network", ...).
export const getNetworkStateAsync = async () => ({ isConnected: true, isInternetReachable: true });
export const addNetworkStateListener = () => ({ remove: () => undefined });
