import * as Network from "expo-network";
import { Platform } from "react-native";

export interface ReportedNetworkState {
  readonly isConnected?: boolean;
  readonly isInternetReachable?: boolean;
}

/**
 * Online unless the platform positively reports otherwise. Android and iOS
 * report reachability late (fields start `undefined`), and a pending or failed
 * probe must not flash the UI offline or block sync.
 */
export function isOnlineFromNetworkState(state: ReportedNetworkState): boolean {
  return state.isConnected !== false && state.isInternetReachable !== false;
}

/** Best-effort current state. Native fails open to online if the probe throws. */
export async function getInitialOnline(): Promise<boolean> {
  if (Platform.OS === "web") {
    return typeof window === "undefined" || window.navigator === undefined ? true : window.navigator.onLine;
  }
  try {
    return isOnlineFromNetworkState(await Network.getNetworkStateAsync());
  } catch {
    return true;
  }
}

/**
 * The single platform boundary for connectivity changes: web uses the browser
 * online/offline events, native uses expo-network. Consecutive identical values
 * are dropped so listeners only see real transitions. Nothing is emitted for
 * the current state; use `getInitialOnline` for that.
 */
export function subscribeToConnectivity(listener: (online: boolean) => void): () => void {
  let last: boolean | undefined;
  const emit = (online: boolean) => {
    if (online === last) return;
    last = online;
    listener(online);
  };
  if (Platform.OS === "web") {
    if (typeof window === "undefined") return () => undefined;
    const onOnline = () => emit(true);
    const onOffline = () => emit(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }
  const subscription = Network.addNetworkStateListener((state) => emit(isOnlineFromNetworkState(state)));
  return () => subscription.remove();
}
