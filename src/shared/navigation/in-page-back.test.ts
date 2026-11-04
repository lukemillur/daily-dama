import { describe, expect, it } from '@jest/globals';

import { shouldShowInPageBack } from './in-page-back';

describe('shouldShowInPageBack', () => {
  it('shows in-page back links on web only', () => {
    expect(shouldShowInPageBack('web')).toBe(true);
    expect(shouldShowInPageBack('ios')).toBe(false);
    expect(shouldShowInPageBack('android')).toBe(false);
  });
});
