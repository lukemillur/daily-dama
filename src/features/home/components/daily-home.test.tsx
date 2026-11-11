import { describe, expect, it, jest } from '@jest/globals';

// resolveTheme's module imports the profile provider, which needs AsyncStorage.
jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { ThemeProvider as StyledThemeProvider } from 'styled-components/native';

import { DailyHome, TIME_LOGGED_LABELS } from '@/features/home/components/daily-home';
import { RAINBOW_THEME_PRESETS } from '@/features/profile/model/theme-presets';
import { resolveTheme } from '@/features/profile/state/use-resolved-theme';
import { contrastRatio } from '@/shared/color/contrast';
import type { HomeSummary } from '@/features/home/model/home-summary';

describe('DailyHome time-logged labels', () => {
  it('labels each rolling window unambiguously as last-N-days/hours, not a calendar period', () => {
    expect(TIME_LOGGED_LABELS).toEqual({
      day: 'Last 24 hours',
      week: 'Last 7 days',
      month: 'Last 30 days',
      year: 'Last 365 days',
    });

    // Guard against regressing to ambiguous calendar-period copy (e.g. "This week" reads as the
    // current calendar week, but the underlying window is a rolling last-7-days calculation).
    const labels = Object.values(TIME_LOGGED_LABELS);
    expect(labels).not.toContain('Today');
    expect(labels).not.toContain('This week');
    expect(labels).not.toContain('This month');
    expect(labels).not.toContain('This year');
  });
});


function baseSummary(overrides: Partial<HomeSummary> = {}): HomeSummary {
  return {
    kenteiRank: 3,
    selectedTricks: [],
    momentum: { sessionCount: 0, totalPracticeMs: 0, totalLaces: 0 },
    currentStreak: 0,
    timeLoggedWindows: [],
    ...overrides,
  };
}

function collectStrings(json: unknown, out: string[]): void {
  if (typeof json === 'string') {
    out.push(json);
    return;
  }
  if (Array.isArray(json)) {
    for (const child of json) collectStrings(child, out);
    return;
  }
  if (json && typeof json === 'object' && 'children' in json) {
    collectStrings((json as { children: unknown }).children, out);
  }
}

function allText(root: ReactTestRenderer): string[] {
  const out: string[] = [];
  collectStrings(root.toJSON(), out);
  return out;
}

describe('DailyHome next Kentei trick card', () => {
  it('renders the suggested trick with a practice entry point when one is available', () => {
    const summary = baseSummary({
      nextKenteiTrick: {
        id: 'trapeze',
        name: 'Trapeze',
        kind: 'standard',
        kenteiRank: 3,
        kenteiLevel: 'Basic',
      },
    });

    let root!: ReactTestRenderer;
    act(() => {
      root = create(<DailyHome summary={summary} />);
    });

    const text = allText(root).join(' ');
    expect(text).toContain('Trapeze');
    expect(text).toMatch(/Rank\s*3/);

    const link = root.root.findByProps({ href: '/app/sesh?trickId=trapeze&mode=practice' });
    expect(link).toBeDefined();
  });

  it('renders nothing for the next-trick card once every rank is fully laced', () => {
    const summary = baseSummary({ nextKenteiTrick: undefined });

    let root!: ReactTestRenderer;
    act(() => {
      root = create(<DailyHome summary={summary} />);
    });

    expect(allText(root)).not.toContain('Learn your next trick');
  });
});

describe('DailyHome hero accent foregrounds', () => {
  function textColor(root: ReactTestRenderer, text: string): string | undefined {
    const node = root.root.findAll(
      (n) => (n.type as unknown) === 'Text' && Array.isArray(n.props.children)
        ? n.props.children.join('') === text
        : (n.type as unknown) === 'Text' && n.props.children === text,
    )[0];
    const style = node?.props.style as { color?: string } | ReadonlyArray<{ color?: string }> | undefined;
    return Array.isArray(style)
      ? Object.assign({}, ...style.flat(Infinity)).color
      : (style as { color?: string } | undefined)?.color;
  }

  it.each(RAINBOW_THEME_PRESETS.map((preset) => [preset.label, preset] as const))(
    'draws hero marker, title and copy in the accent foreground roles on %s',
    (_label, preset) => {
      const theme = resolveTheme({
        themeBackgroundColor: preset.backgroundColor,
        themeAccentColor: preset.accentColor,
      });
      let root!: ReactTestRenderer;
      act(() => {
        root = create(
          <StyledThemeProvider theme={theme}>
            <DailyHome summary={baseSummary()} />
          </StyledThemeProvider>,
        );
      });

      const marker = textColor(root, 'Today’s practice');
      const title = textColor(root, 'Start your\nfirst sesh.');
      const copy = textColor(
        root,
        'Your practice list is ready when you are. A little focused practice is enough to begin.',
      );
      expect(marker).toBe(theme.onAccentMuted);
      expect(title).toBe(theme.onAccent);
      expect(copy).toBe(theme.onAccentMuted);
      for (const color of [marker, title, copy]) {
        expect(contrastRatio(color ?? '', theme.accent)).toBeGreaterThanOrEqual(4.5);
      }
    },
  );
});
