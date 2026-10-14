import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, create, type ReactTestRenderer, type ReactTestRendererJSON } from 'react-test-renderer';

import { StyleSheet } from 'react-native';

import { getServerSnapshot, LandingHero } from '@/features/landing/components/landing-hero';

jest.mock('expo-image', () => {
  const React = require('react');
  const { View } = require('react-native');
  return { Image: (props: Record<string, unknown>) => React.createElement(View, props) };
});

// Set to a never-settling promise to hold the scene in its Suspense state,
// standing in for the lazily loaded 3D chunk still downloading.
let mockSceneSuspension: Promise<never> | undefined;
jest.mock('./lazy-looping-hero-scene', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    LazyLoopingHeroScene: () => {
      if (mockSceneSuspension) throw mockSceneSuspension;
      return React.createElement(View, { testID: 'looping-hero-scene-stub' });
    },
  };
});

const mockIsWebGLAvailable = jest.fn<() => boolean>();
jest.mock('../utils/webgl-availability', () => ({
  isWebGLAvailable: () => mockIsWebGLAvailable(),
}));

type Json = ReactTestRendererJSON | ReactTestRendererJSON[] | string | null;

function countByProp(node: Json, key: string, value: string): number {
  if (node === null || typeof node === 'string') return 0;
  if (Array.isArray(node)) {
    return node.reduce((sum, child) => sum + countByProp(child, key, value), 0);
  }
  const own = node.props?.[key] === value ? 1 : 0;
  const children = node.children ?? [];
  return own + children.reduce((sum, child) => sum + countByProp(child, key, value), 0);
}

let activeRoot: ReactTestRenderer | null = null;

async function mount() {
  let root!: ReactTestRenderer;
  await act(async () => {
    root = create(<LandingHero />);
  });
  activeRoot = root;
  return root;
}

beforeEach(() => {
  mockIsWebGLAvailable.mockReset();
  mockSceneSuspension = undefined;
});

afterEach(async () => {
  if (activeRoot) {
    const root = activeRoot;
    activeRoot = null;
    await act(async () => {
      root.unmount();
    });
  }
});

describe('LandingHero', () => {
  it('keeps the outer landing-hero testID stable on both branches', async () => {
    mockIsWebGLAvailable.mockReturnValue(true);
    const root = await mount();

    expect(countByProp(root.toJSON(), 'testID', 'landing-hero')).toBe(1);
  });

  it('renders the looping 3D scene once WebGL is available (post-mount)', async () => {
    mockIsWebGLAvailable.mockReturnValue(true);
    const root = await mount();

    expect(countByProp(root.toJSON(), 'testID', 'looping-hero-scene-stub')).toBe(1);
  });

  it('shows the static fallback image while the 3D scene is still loading', async () => {
    mockIsWebGLAvailable.mockReturnValue(true);
    mockSceneSuspension = new Promise<never>(() => {});
    const root = await mount();
    const json = root.toJSON();

    expect(countByProp(json, 'testID', 'looping-hero-scene-stub')).toBe(0);
    expect(countByProp(json, 'alt', 'A kendama mid-catch in its cup, with the Daily Dama wordmark')).toBe(1);
  });

  it('renders the static fallback image when WebGL is unavailable', async () => {
    mockIsWebGLAvailable.mockReturnValue(false);
    const root = await mount();
    const json = root.toJSON();

    expect(countByProp(json, 'testID', 'looping-hero-scene-stub')).toBe(0);
    expect(countByProp(json, 'alt', 'A kendama mid-catch in its cup, with the Daily Dama wordmark')).toBe(1);
  });

  it('uses a server snapshot of false, regardless of the real client value (no hydration-mismatch-prone default of true)', () => {
    // react-test-renderer renders straight from 'getSnapshot' -- it has no
    // hydrateRoot-style two-pass SSR/first-client-render split for
    // 'useSyncExternalStore' to bridge, so this can't be observed through a
    // component render here the way it plays out in the browser. What *is*
    // testable, and is the actual invariant the exit criterion cares about,
    // is that LandingHero's 'getServerSnapshot' -- what the static export's
    // Node prerender pass and React's first client render both use -- always
    // returns the fallback branch regardless of the real 'isWebGLAvailable()'
    // result, so the two agree and there is no mismatch to warn about.
    expect(getServerSnapshot()).toBe(false);
  });
});

function resolvedMaxWidthFor(root: ReactTestRenderer, testID: string) {
  const matches = root.root.findAll((node) => node.props.testID === testID);
  const arrayStyleMatch = matches.find((node) => Array.isArray(node.props.style));
  const plainStyleMatch = matches.find(
    (node) => typeof node.props.style === "object" && node.props.style !== null && !Array.isArray(node.props.style),
  );
  const resolved = arrayStyleMatch ?? plainStyleMatch;
  const flattened = StyleSheet.flatten(resolved?.props.style) as { maxWidth?: number } | undefined;
  return flattened?.maxWidth;
}

describe("LandingHero panel size", () => {
  it("resolves a max-width noticeably larger than the old 320px cap", async () => {
    mockIsWebGLAvailable.mockReturnValue(true);
    const root = await mount();

    const maxWidth = resolvedMaxWidthFor(root, "landing-hero");

    expect(maxWidth).toBeGreaterThan(320);
  });
});
