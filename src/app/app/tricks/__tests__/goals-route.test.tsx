import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import TrickGoalsRoute from '@/app/app/tricks/[trickId]/goals';
import { KENDAMA_KENTEI_TRICKS } from '@/features/tricks/data/kendama-kentei-tricks';

const mockRouter = { replace: jest.fn() };
let mockParams: { readonly trickId?: string } = {};
let mockCustomTricks: readonly { readonly id: string; readonly name: string; readonly kind: 'standalone' }[] = [];
let mockRenderedGoalsProps:
  | { readonly trickId: string; readonly trickName: string; readonly onBack: () => void }
  | undefined;

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockParams,
  useRouter: () => mockRouter,
}));
jest.mock('@/features/onboarding/state/require-onboarding', () => ({
  useRequireOnboarding: () => true,
}));
jest.mock('@/features/custom-tricks/state/custom-trick-provider', () => ({
  useCustomTricks: () => ({ tricks: mockCustomTricks }),
}));
jest.mock('@/features/goals/components/trick-goals-screen', () => ({
  TrickGoalsScreen: (props: {
    readonly trickId: string;
    readonly trickName: string;
    readonly onBack: () => void;
  }) => {
    mockRenderedGoalsProps = props;
    return null;
  },
}));

function mountRoute() {
  let root!: ReactTestRenderer;
  act(() => {
    root = create(<TrickGoalsRoute />);
  });
  return root;
}

describe('TrickGoalsRoute', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCustomTricks = [];
    mockRenderedGoalsProps = undefined;
    mockParams = {};
  });

  it('resolves standard and custom tricks by route id before rendering the goals screen', () => {
    const standardTrick = KENDAMA_KENTEI_TRICKS[0]!;
    mockParams = { trickId: standardTrick.id };
    let root = mountRoute();

    expect(mockRenderedGoalsProps).toMatchObject({ trickId: standardTrick.id, trickName: standardTrick.name });
    act(() => {
      root.unmount();
    });

    mockCustomTricks = [{ id: 'custom-stilt-flip', name: 'Stilt flip', kind: 'standalone' }];
    mockParams = { trickId: 'custom-stilt-flip' };
    root = mountRoute();

    expect(mockRenderedGoalsProps).toMatchObject({ trickId: 'custom-stilt-flip', trickName: 'Stilt flip' });
    act(() => {
      root.unmount();
    });
  });

  it('replaces invalid direct URLs with the Tricks directory', () => {
    mockParams = { trickId: 'missing-trick' };
    mountRoute();

    expect(mockRouter.replace).toHaveBeenCalledWith('/app/tricks');
    expect(mockRenderedGoalsProps).toBeUndefined();
  });

  it('uses an explicit back route instead of browser history', () => {
    mockParams = { trickId: KENDAMA_KENTEI_TRICKS[0]!.id };
    mountRoute();

    expect(mockRenderedGoalsProps).toBeDefined();
    act(() => {
      mockRenderedGoalsProps!.onBack();
    });

    expect(mockRouter.replace).toHaveBeenCalledWith('/app/tricks');
  });
});
