import { afterEach, describe, expect, it, jest } from "@jest/globals";
import { act, create, type ReactTestRenderer } from "react-test-renderer";

const mockRetryAll = jest.fn<() => Promise<void>>(async () => undefined);
const mockMountEffect = jest.fn();

interface MockSummary {
  hasFailure: boolean;
  failedLabels: readonly string[];
  isRetrying: boolean;
  retryAll: () => Promise<void>;
}

let mockSummary: MockSummary = { hasFailure: false, failedLabels: [], isRetrying: false, retryAll: mockRetryAll };

jest.mock("@/shared/persistence/use-app-local-durability", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- required inside the mock factory
  const realReact = require("react");
  return {
    useAppLocalDurability: () => {
      realReact.useEffect(() => {
        mockMountEffect();
      }, []);
      return mockSummary;
    },
  };
});

import { LocalDurabilityWarningBanner } from "@/components/local-durability-warning-banner";

function findByAccessibilityRole(root: ReactTestRenderer, role: string) {
  return root.root.findAll((node) => typeof node.type !== "string" && node.props.accessibilityRole === role);
}

describe("LocalDurabilityWarningBanner", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it("renders nothing when there is no failure", () => {
    mockSummary = { hasFailure: false, failedLabels: [], isRetrying: false, retryAll: mockRetryAll };
    let root!: ReactTestRenderer;
    act(() => {
      root = create(<LocalDurabilityWarningBanner />);
    });

    expect(root.toJSON()).toBeNull();

    act(() => {
      root.unmount();
    });
  });

  it("renders one alert naming the failed domains when there is a failure", () => {
    mockSummary = {
      hasFailure: true,
      failedLabels: ["Goals", "Notes"],
      isRetrying: false,
      retryAll: mockRetryAll,
    };
    let root!: ReactTestRenderer;
    act(() => {
      root = create(<LocalDurabilityWarningBanner />);
    });

    const alerts = findByAccessibilityRole(root, "alert");
    expect(alerts).toHaveLength(1);
    expect(JSON.stringify(root.toJSON())).toContain("Goals, Notes");

    act(() => {
      root.unmount();
    });
  });

  it("pressing Retry calls retryAll once, and the button is disabled while retrying", () => {
    mockSummary = {
      hasFailure: true,
      failedLabels: ["Goals"],
      isRetrying: false,
      retryAll: mockRetryAll,
    };
    let root!: ReactTestRenderer;
    act(() => {
      root = create(<LocalDurabilityWarningBanner />);
    });

    const [button] = findByAccessibilityRole(root, "button");
    act(() => {
      button.props.onPress();
    });
    expect(mockRetryAll).toHaveBeenCalledTimes(1);

    mockSummary = { ...mockSummary, isRetrying: true };
    act(() => {
      root.update(<LocalDurabilityWarningBanner />);
    });
    const [retryingButton] = findByAccessibilityRole(root, "button");
    expect(retryingButton.props.disabled).toBe(true);

    act(() => {
      root.unmount();
    });
  });
  it("does not remount when an unrelated sibling prop changes across rerenders", () => {
    mockSummary = {
      hasFailure: true,
      failedLabels: ["Goals"],
      isRetrying: false,
      retryAll: mockRetryAll,
    };

    function RouteStandIn({ routeName }: { routeName: string }) {
      return <>{routeName}</>;
    }
    function Shell({ routeName }: { routeName: string }) {
      return (
        <>
          <LocalDurabilityWarningBanner />
          <RouteStandIn routeName={routeName} />
        </>
      );
    }

    let root!: ReactTestRenderer;
    act(() => {
      root = create(<Shell routeName="home" />);
    });
    expect(mockMountEffect).toHaveBeenCalledTimes(1);

    act(() => {
      root.update(<Shell routeName="sesh" />);
    });
    expect(mockMountEffect).toHaveBeenCalledTimes(1);
    expect(findByAccessibilityRole(root, "alert")).toHaveLength(1);

    act(() => {
      root.unmount();
    });
  });
});
