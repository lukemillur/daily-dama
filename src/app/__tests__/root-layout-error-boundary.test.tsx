import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Component, type ComponentType, type PropsWithChildren } from 'react';
import { Text } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

// _layout.tsx transitively imports app-theme-provider.tsx -> use-cached-guest-theme.ts, which
// imports AsyncStorage directly for its native fallback path -- mock it before _layout.tsx is
// imported below, same pattern as root-layout.test.tsx.
jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- required by jest hoisting
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

jest.mock('react-native-reanimated', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- required by jest hoisting
  require('react-native-reanimated/mock'),
);

// _layout.tsx imports global.css directly (a web-only stylesheet with no runtime meaning under
// Jest) -- mock it out rather than teaching the resolver a CSS transform just for this test.
jest.mock('@/global.css', () => ({}), { virtual: true });

// _layout.tsx imports AnimatedSplashOverlay, which transitively imports expo-image -- expo-image
// throws at import time under this Jest environment (unrelated to this test's behavior). Mock it
// out, same as root-layout.test.tsx, since this test only needs the named ErrorBoundary export
// to resolve, not AnimatedSplashOverlay's behavior.
jest.mock('@/components/animated-icon', () => ({
  AnimatedSplashOverlay: () => null,
}));

import { ErrorBoundary } from '@/app/_layout';
import type { ErrorBoundaryProps } from 'expo-router';

/**
 * Mirrors expo-router's real (internal, non-exported) `Try` class
 * (`node_modules/expo-router/build/views/Try.js`), which is what actually wraps a route
 * module's default export when that module also exports `ErrorBoundary`. Re-implemented here
 * rather than reaching into expo-router internals directly, so this test exercises the real
 * contract (a `getDerivedStateFromError` class boundary around arbitrary thrown render errors)
 * without depending on an unexported internal module path.
 */
class RouteErrorBoundaryHarness extends Component<
  PropsWithChildren<{ catch: ComponentType<ErrorBoundaryProps> }>,
  { error?: Error }
> {
  state: { error?: Error } = {};

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  retry = () => new Promise<void>((resolve) => this.setState({ error: undefined }, resolve));

  render() {
    const { error } = this.state;
    const { catch: Fallback, children } = this.props;
    if (!error) return children;
    return <Fallback error={error} retry={this.retry} />;
  }
}

let shouldThrow = true;
function Bomb() {
  if (shouldThrow) {
    throw new Error('simulated fatal render error');
  }
  return <Text>Recovered content</Text>;
}

// Restrict to host (string-typed) nodes -- a composite Text component and its underlying host
// element both carry the same accessibilityRole/children props, so counting every fiber would
// overcount a single rendered element.
function findHeading(root: ReactTestRenderer) {
  return root.root.findAll(
    (node) => typeof node.type === 'string' && node.props.accessibilityRole === 'header',
  );
}

function findRetryButton(root: ReactTestRenderer) {
  return root.root.find(
    (node) => node.props.accessibilityRole === 'button' && typeof node.props.onPress === 'function',
  );
}

function findByText(root: ReactTestRenderer, text: string) {
  return root.root.findAll(
    (node) =>
      typeof node.type === 'string' &&
      typeof node.props.children === 'string' &&
      node.props.children.includes(text),
  );
}

describe('root layout ErrorBoundary (T259)', () => {
  let consoleErrorSpy: ReturnType<typeof jest.spyOn>;

  beforeEach(() => {
    shouldThrow = true;
    // React logs the caught error to console.error; suppress it in this test's output without
    // letting the spy leak into other test files.
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it('renders the branded fallback, not a blank screen or the default Expo overlay, when a render error occurs beneath the boundary', () => {
    let root!: ReactTestRenderer;
    act(() => {
      root = create(
        <RouteErrorBoundaryHarness catch={ErrorBoundary}>
          <Bomb />
        </RouteErrorBoundaryHarness>,
      );
    });

    const headings = findHeading(root);
    expect(headings).toHaveLength(1);
    expect(headings[0].props.children).toContain('Daily Dama hit a snag');
    expect(findByText(root, 'Something went wrong')).toHaveLength(0);
    expect(findByText(root, 'Recovered content')).toHaveLength(0);

    act(() => {
      root.unmount();
    });
  });

  it('retry re-renders the underlying tree in place, without a full page reload', async () => {
    let root!: ReactTestRenderer;
    act(() => {
      root = create(
        <RouteErrorBoundaryHarness catch={ErrorBoundary}>
          <Bomb />
        </RouteErrorBoundaryHarness>,
      );
    });

    expect(findHeading(root)).toHaveLength(1);

    // Fix the underlying condition before retrying, exactly like a real transient error whose
    // cause has resolved by the time the user taps Try again.
    shouldThrow = false;
    const retryButton = findRetryButton(root);
    await act(async () => {
      await (retryButton.props.onPress as () => Promise<void>)();
    });

    // Same `root` instance throughout -- no second create() call -- is itself the evidence
    // there was no full remount/reload.
    expect(findHeading(root)).toHaveLength(0);
    expect(findByText(root, 'Recovered content')).toHaveLength(1);

    act(() => {
      root.unmount();
    });
  });

  it('renders children normally with no boundary UI when nothing throws', () => {
    shouldThrow = false;
    let root!: ReactTestRenderer;
    act(() => {
      root = create(
        <RouteErrorBoundaryHarness catch={ErrorBoundary}>
          <Bomb />
        </RouteErrorBoundaryHarness>,
      );
    });

    expect(findHeading(root)).toHaveLength(0);
    expect(findByText(root, 'Recovered content')).toHaveLength(1);

    act(() => {
      root.unmount();
    });
  });
});
