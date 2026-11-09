import { areAccountsAvailable } from '@/features/auth/model/account-availability';

describe('areAccountsAvailable', () => {
  it('is available on web, ios and android', () => {
    expect(areAccountsAvailable('web')).toBe(true);
    expect(areAccountsAvailable('ios')).toBe(true);
    expect(areAccountsAvailable('android')).toBe(true);
  });

  it('is withheld on any other platform', () => {
    expect(areAccountsAvailable('windows')).toBe(false);
  });
});
