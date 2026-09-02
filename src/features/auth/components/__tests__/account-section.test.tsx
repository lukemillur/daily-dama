import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { act, create, type ReactTestRenderer } from "react-test-renderer";

import type { AuthState } from "@/features/auth/model/auth-state";
import { networkFailure } from "@/features/auth/model/auth-test-fixtures";
import type { SyncCoordinatorState } from "@/shared/sync/coordinator";

import { AccountSection } from "@/features/auth/components/account-section";

const mockSignOut = jest.fn<() => Promise<{ error: unknown }>>();
let mockAuthState: AuthState = { status: "guest", reason: "signedOut" };

jest.mock("@/features/auth/state/auth-provider", () => ({
  useAuthState: () => mockAuthState,
  useAuthActions: () => ({ signOut: mockSignOut }),
}));

let mockGeneration = 1;
jest.mock("@/shared/persistence/identity-provider", () => ({
  useIdentityHandle: () => ({
    identity: { kind: "user", userId: "11111111-1111-1111-1111-111111111111" },
    generation: mockGeneration,
    context: {},
  }),
}));

const mockRequestManualSync = jest.fn<() => void>();
const mockDiscardAllPending = jest.fn<() => Promise<void>>();
let mockCoordinatorState: SyncCoordinatorState = {
  status: "idle",
  identityGeneration: 1,
  lastRun: undefined,
  pendingRerunTrigger: undefined,
};
let mockPendingCount = 0;

jest.mock("@/shared/sync/sync-coordinator-provider", () => ({
  useSyncCoordinatorStatus: () => ({
    state: mockCoordinatorState,
    requestManualSync: mockRequestManualSync,
    pendingCount: mockPendingCount,
    discardAllPending: mockDiscardAllPending,
  }),
}));

const mockPush = jest.fn();
const mockReplace = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
}));

const mockTrackAuthEvent = jest.fn();
const mockLogAuthWarning = jest.fn();
jest.mock("@/features/auth/observability/auth-observability", () => ({
  trackAuthEvent: (...args: unknown[]) => mockTrackAuthEvent(...args),
  logAuthWarning: (...args: unknown[]) => mockLogAuthWarning(...args),
}));

const EMAIL = "someone@example.com";

function findByLabel(renderer: ReactTestRenderer, label: string) {
  return renderer.root.find((node) => node.props.accessibilityLabel === label);
}

function findAllByLabel(renderer: ReactTestRenderer, label: string) {
  return renderer.root.findAll((node) => node.props.accessibilityLabel === label);
}

function containsText(renderer: ReactTestRenderer, text: string | RegExp) {
  return (
    renderer.root.findAll((node) => {
      const { children } = node.props;
      if (typeof children !== "string") return false;
      return typeof text === "string" ? children === text : text.test(children);
    }).length > 0
  );
}

function authenticatedState(): AuthState {
  return {
    status: "authenticated",
    session: { access_token: "tok", user: { email: EMAIL } } as never,
    lastEvent: "SIGNED_IN",
  };
}

function runningCoordinatorState(): SyncCoordinatorState {
  return {
    status: "running",
    identityGeneration: 1,
    run: {
      runId: "run-1",
      identityGeneration: 1,
      trigger: "manual",
      startedAt: 0,
      domainResults: {},
      queuedRerunTrigger: undefined,
    },
  };
}

function idleCoordinatorState(): SyncCoordinatorState {
  return { status: "idle", identityGeneration: 1, lastRun: undefined, pendingRerunTrigger: undefined };
}

async function mount() {
  let root!: ReactTestRenderer;
  await act(async () => {
    root = create(<AccountSection />);
  });
  return root;
}

async function flush(times = 4) {
  for (let i = 0; i < times; i += 1) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

async function pressLogOut(root: ReactTestRenderer) {
  const button = findByLabel(root, "Log out");
  act(() => {
    button.props.onPress();
  });
  await flush();
}

describe("AccountSection", () => {
  beforeEach(() => {
    mockSignOut.mockReset();
    mockTrackAuthEvent.mockReset();
    mockLogAuthWarning.mockReset();
    mockPush.mockReset();
    mockReplace.mockReset();
    mockRequestManualSync.mockReset();
    mockDiscardAllPending.mockReset();
    mockDiscardAllPending.mockResolvedValue(undefined);
    mockAuthState = { status: "guest", reason: "signedOut" };
    mockGeneration = 1;
    mockCoordinatorState = idleCoordinatorState();
    mockPendingCount = 0;
  });

  it("renders nothing while initializing", async () => {
    mockAuthState = { status: "initializing" };
    const root = await mount();

    expect(findAllByLabel(root, "Log out").length).toBe(0);
  });

  it("renders nothing when a guest", async () => {
    mockAuthState = { status: "guest", reason: "signedOut" };
    const root = await mount();

    expect(findAllByLabel(root, "Log out").length).toBe(0);
  });

  it("renders nothing during password recovery", async () => {
    mockAuthState = { status: "passwordRecovery", session: { access_token: "tok" } as never };
    const root = await mount();

    expect(findAllByLabel(root, "Log out").length).toBe(0);
  });

  it("renders the account email and an enabled Log out button when authenticated", async () => {
    mockAuthState = authenticatedState();
    const root = await mount();

    expect(containsText(root, EMAIL)).toBe(true);
    const button = findByLabel(root, "Log out");
    expect(button.props.disabled).toBe(false);
  });

  it("renders a Manage account security link when authenticated, and navigates to the security route", async () => {
    mockAuthState = authenticatedState();
    const root = await mount();

    const link = findByLabel(root, "Manage account security");
    await act(async () => {
      link.props.onPress();
    });

    expect(mockPush).toHaveBeenCalledWith("/app/profile/account/security");
  });

  it("no longer renders a Delete account link (moved to the profile footer bar)", async () => {
    mockAuthState = authenticatedState();
    const root = await mount();

    expect(findAllByLabel(root, "Delete account").length).toBe(0);
  });

  it("has no Manage account security link when not authenticated", async () => {
    mockAuthState = { status: "guest", reason: "signedOut" };
    const root = await mount();

    expect(findAllByLabel(root, "Manage account security").length).toBe(0);
  });

  it("falls back to a generic label when the session has no email", async () => {
    mockAuthState = {
      status: "authenticated",
      session: { access_token: "tok", user: {} } as never,
      lastEvent: "SIGNED_IN",
    };
    const root = await mount();

    expect(containsText(root, "Your account")).toBe(true);
  });

  it("no pending outbox: signs out successfully and re-enables the button, tracking log_out_success", async () => {
    mockAuthState = authenticatedState();
    mockPendingCount = 0;
    mockSignOut.mockResolvedValue({ error: null });
    const root = await mount();

    await pressLogOut(root);

    expect(mockSignOut).toHaveBeenCalledTimes(1);
    expect(mockTrackAuthEvent).toHaveBeenCalledWith("log_out_success");
    const button = findByLabel(root, "Log out");
    expect(button.props.disabled).toBe(false);
    expect(button.props.children).toBe("Log out");
  });

  it("navigates to / once sign-out completes successfully", async () => {
    mockAuthState = authenticatedState();
    mockPendingCount = 0;
    mockSignOut.mockResolvedValue({ error: null });
    const root = await mount();

    await pressLogOut(root);

    expect(mockReplace).toHaveBeenCalledWith("/");
  });

  it("does not navigate when a completed sign-out attempt fails", async () => {
    mockAuthState = authenticatedState();
    mockPendingCount = 0;
    mockSignOut.mockResolvedValue({ error: networkFailure() });
    const root = await mount();

    await pressLogOut(root);

    expect(mockReplace).not.toHaveBeenCalled();
  });

  it("does not navigate when the logout prompt is cancelled", async () => {
    mockAuthState = authenticatedState();
    mockPendingCount = 3;
    const root = await mount();

    await pressLogOut(root);
    const cancelButton = findByLabel(root, "Cancel logout");
    act(() => {
      cancelButton.props.onPress();
    });
    await flush();

    expect(mockSignOut).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it("no pending outbox: surfaces a retryable offline error and does not fake a guest transition", async () => {
    mockAuthState = authenticatedState();
    mockPendingCount = 0;
    mockSignOut.mockResolvedValue({ error: networkFailure() });
    const root = await mount();

    await pressLogOut(root);

    expect(containsText(root, /offline/i)).toBe(true);
    expect(mockLogAuthWarning).toHaveBeenCalledWith("Log out failed.", networkFailure());
    expect(mockTrackAuthEvent).toHaveBeenCalledWith("log_out_error", "offline");

    // The UI must not force its own guest transition -- it still reflects the authenticated
    // state its mocked hook was given, and the button is re-enabled so the user can retry.
    expect(containsText(root, EMAIL)).toBe(true);
    const button = findByLabel(root, "Log out");
    expect(button.props.disabled).toBe(false);
  });

  it("shows generic copy for an unexpected non-offline error", async () => {
    mockAuthState = authenticatedState();
    mockPendingCount = 0;
    mockSignOut.mockResolvedValue({ error: { message: "server error" } });
    const root = await mount();

    await pressLogOut(root);

    expect(containsText(root, "Something went wrong. Please try again.")).toBe(true);
  });

  it("never renders a raw error message", async () => {
    mockAuthState = authenticatedState();
    mockPendingCount = 0;
    mockSignOut.mockResolvedValue({ error: { message: "some raw supabase detail" } });
    const root = await mount();

    await pressLogOut(root);

    expect(containsText(root, "some raw supabase detail")).toBe(false);
  });

  it("guards against a repeat press firing signOut twice", async () => {
    mockAuthState = authenticatedState();
    mockPendingCount = 0;
    let resolveFirst!: (value: { error: unknown }) => void;
    mockSignOut.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveFirst = resolve;
        }),
    );
    const root = await mount();

    const button = findByLabel(root, "Log out");
    await act(async () => {
      button.props.onPress();
      button.props.onPress();
      await Promise.resolve();
    });

    expect(mockSignOut).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveFirst({ error: null });
    });
  });

  it("pending outbox opens the prompt instead of calling signOut immediately", async () => {
    mockAuthState = authenticatedState();
    mockPendingCount = 2;
    const root = await mount();

    await pressLogOut(root);

    expect(mockSignOut).not.toHaveBeenCalled();
    expect(findAllByLabel(root, "Unsynced changes").length).toBeGreaterThan(0);
    expect(containsText(root, /2 unsynced changes/i)).toBe(true);
  });

  it("Retry press calls requestManualSync and, on success, proceeds to signOut", async () => {
    mockAuthState = authenticatedState();
    mockPendingCount = 2;
    mockSignOut.mockResolvedValue({ error: null });
    const root = await mount();

    await pressLogOut(root);
    const retryButton = findByLabel(root, "Retry sync");
    act(() => {
      retryButton.props.onPress();
    });
    await flush();

    expect(mockRequestManualSync).toHaveBeenCalledTimes(1);

    // Reflect the run actually starting -- a genuine re-render so
    // useLogoutGuard observes the coordinator entering running.
    act(() => {
      mockCoordinatorState = runningCoordinatorState();
      root.update(<AccountSection />);
    });
    await flush();

    act(() => {
      mockPendingCount = 0;
      mockCoordinatorState = idleCoordinatorState();
      root.update(<AccountSection />);
    });
    await flush();

    expect(mockSignOut).toHaveBeenCalledTimes(1);
    expect(findAllByLabel(root, "Unsynced changes").length).toBe(0);
  });

  it("failed Retry keeps the prompt open with retained copy and does not call signOut", async () => {
    mockAuthState = authenticatedState();
    mockPendingCount = 2;
    const root = await mount();

    await pressLogOut(root);
    const retryButton = findByLabel(root, "Retry sync");
    act(() => {
      retryButton.props.onPress();
    });
    await flush();

    act(() => {
      mockCoordinatorState = runningCoordinatorState();
      root.update(<AccountSection />);
    });
    await flush();

    act(() => {
      mockPendingCount = 2;
      mockCoordinatorState = idleCoordinatorState();
      root.update(<AccountSection />);
    });
    await flush();

    expect(mockSignOut).not.toHaveBeenCalled();
    expect(findAllByLabel(root, "Unsynced changes").length).toBeGreaterThan(0);
    expect(containsText(root, /still couldn.t sync/i)).toBe(true);
  });

  it("Cancel dismisses the prompt without calling signOut", async () => {
    mockAuthState = authenticatedState();
    mockPendingCount = 3;
    const root = await mount();

    await pressLogOut(root);
    expect(findAllByLabel(root, "Unsynced changes").length).toBeGreaterThan(0);

    const cancelButton = findByLabel(root, "Cancel logout");
    act(() => {
      cancelButton.props.onPress();
    });
    await flush();

    expect(mockSignOut).not.toHaveBeenCalled();
    expect(findAllByLabel(root, "Unsynced changes").length).toBe(0);
  });

  it("Discard calls discardAllPending then signOut", async () => {
    mockAuthState = authenticatedState();
    mockPendingCount = 3;
    mockSignOut.mockResolvedValue({ error: null });
    const root = await mount();

    await pressLogOut(root);
    const discardButton = findByLabel(root, "Discard and log out");
    act(() => {
      discardButton.props.onPress();
    });
    await flush();

    expect(mockDiscardAllPending).toHaveBeenCalledTimes(1);
    expect(mockSignOut).toHaveBeenCalledTimes(1);
    expect(findAllByLabel(root, "Unsynced changes").length).toBe(0);
  });

  it("an identity change while the prompt is open closes it without calling signOut or discardAllPending", async () => {
    mockAuthState = authenticatedState();
    mockPendingCount = 3;
    const root = await mount();

    await pressLogOut(root);
    expect(findAllByLabel(root, "Unsynced changes").length).toBeGreaterThan(0);

    act(() => {
      mockGeneration = 2;
      root.update(<AccountSection />);
    });
    await flush();

    expect(findAllByLabel(root, "Unsynced changes").length).toBe(0);
    expect(mockSignOut).not.toHaveBeenCalled();
    expect(mockDiscardAllPending).not.toHaveBeenCalled();
  });
});
