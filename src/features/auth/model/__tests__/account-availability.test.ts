import { areAccountsAvailable } from '@/features/auth/model/account-availability';

describe('areAccountsAvailable', () => {
  it('is available on web only', () => {
    expect(areAccountsAvailable('web')).toBe(true);
    expect(areAccountsAvailable('ios')).toBe(false);
    expect(areAccountsAvailable('android')).toBe(false);
  });
});
