import { describe, expect, it } from '@jest/globals';

import { TIME_LOGGED_LABELS } from '@/features/home/components/daily-home';

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
