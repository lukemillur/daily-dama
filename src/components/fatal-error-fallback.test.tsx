import { describe, expect, it, jest } from "@jest/globals";
import { act, create } from "react-test-renderer";

import { FatalErrorFallback } from "@/components/fatal-error-fallback";

describe("FatalErrorFallback", () => {
  it("renders a branded accessible heading distinct from the default Expo error copy", () => {
    const retry = jest.fn(() => Promise.resolve());
    let root!: ReturnType<typeof create>;
    act(() => {
      root = create(<FatalErrorFallback error={new Error("boom")} retry={retry} />);
    });

    // Restrict to host (string-typed) nodes -- the composite Text component and its underlying
    // host element both carry accessibilityRole, so counting every fiber would overcount.
    const headings = root.root.findAll(
      (node) => typeof node.type === "string" && node.props.accessibilityRole === "header",
    );
    expect(headings).toHaveLength(1);
    expect(headings[0].props.children).toContain("Daily Dama hit a snag");
    expect(headings[0].props.children).not.toContain("Something went wrong");

    act(() => {
      root.unmount();
    });
  });

  it("invokes retry when the Try again button is pressed", () => {
    const retry = jest.fn(() => Promise.resolve());
    let root!: ReturnType<typeof create>;
    act(() => {
      root = create(<FatalErrorFallback error={new Error("boom")} retry={retry} />);
    });

    const button = root.root.find(
      (node) => node.props.accessibilityRole === "button" && typeof node.props.onPress === "function",
    );
    act(() => {
      (button.props.onPress as () => void)();
    });

    expect(retry).toHaveBeenCalledTimes(1);

    act(() => {
      root.unmount();
    });
  });

  it("shows the dev-only error message matching the thrown error", () => {
    const retry = jest.fn(() => Promise.resolve());
    let root!: ReturnType<typeof create>;
    act(() => {
      root = create(
        <FatalErrorFallback error={new Error("distinctive boom message")} retry={retry} />,
      );
    });

    const matches = root.root.findAll(
      (node) =>
        typeof node.props.children === "string" &&
        node.props.children.includes("distinctive boom message"),
    );
    expect(matches.length).toBeGreaterThan(0);

    act(() => {
      root.unmount();
    });
  });
});
