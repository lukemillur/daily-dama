// T159.1: minimal Profile-adjacent preview of a resumable guest import.
// Presentational only -- inspects useGuestImport()'s status and renders
// accordingly. Real UI for 'uploading'/'awaitingProfileChoice'/'conflicts'
// is T159.2+'s job; this component only guarantees the screen is never
// left blank once confirmImport() is pressed.

import { styled } from 'styled-components/native';

import { Button } from '@/components/ui/button';
import { BodyText } from '@/components/ui/typography';
import { AppColors } from '@/constants/theme';
import { useGuestImport } from '@/features/guest-import/state/use-guest-import';
import { useIdentityHandle } from '@/shared/persistence/identity-provider';
import { SYNC_DOMAINS, type SyncDomain } from '@/shared/sync/domain';

const DOMAIN_LABELS: Readonly<Record<SyncDomain, string>> = {
  profile: 'Profile & trick selections',
  customTricks: 'Custom tricks',
  practiceHistory: 'Practice history',
  goals: 'Goals',
  notes: 'Notes',
};

export function GuestImportPreview() {
  const { identity } = useIdentityHandle();
  const { state, confirmImport, cancelImport } = useGuestImport();

  if (identity.kind !== 'user') return null;
  if (state.status === 'idle' || state.status === 'cancelled' || state.status === 'completed') return null;

  if (state.status === 'inventorying') {
    return (
      <Section accessibilityLabel="Checking local practice data">
        <BodyText>Checking your local practice data...</BodyText>
      </Section>
    );
  }

  if (state.status === 'uploading' || state.status === 'awaitingProfileChoice' || state.status === 'conflicts') {
    return (
      <Section accessibilityLabel="Import in progress">
        <BodyText>Import in progress...</BodyText>
      </Section>
    );
  }

  // state.status === 'awaitingConfirmation'
  const inventory = state.inventory;
  if (inventory === undefined) return null;

  const domainsWithLocalData = SYNC_DOMAINS.filter((domain) => inventory[domain].local > 0);
  if (domainsWithLocalData.length === 0) return null;

  return (
    <Section accessibilityLabel="Import your practice data">
      <Title>Import your practice data?</Title>
      <Copy>This device has local practice data from before you signed in. Here is what would move to your account:</Copy>
      {domainsWithLocalData.map((domain) => (
        <CountRow key={domain}>
          <BodyText>{DOMAIN_LABELS[domain]}</BodyText>
          <CountText>
            {inventory[domain].local} on this device, {inventory[domain].cloud} already in your account
          </CountText>
        </CountRow>
      ))}
      <ImportButton accessibilityLabel="Import my practice data" onPress={confirmImport} variant="primary">
        Import my practice data
      </ImportButton>
      <NotNowButton accessibilityLabel="Not now" onPress={cancelImport} variant="secondary">
        Not now
      </NotNowButton>
    </Section>
  );
}

const Section = styled.View`
  width: 100%;
  margin-top: 22px;
  padding: 16px;
  border-width: 2px;
  border-color: ${AppColors.ink};
`;
const Title = styled.Text`
  color: ${({ theme }) => theme.text};
  font-size: 16px;
  font-weight: 900;
`;
const Copy = styled(BodyText)`
  margin-top: 8px;
`;
const CountRow = styled.View`
  margin-top: 14px;
`;
const CountText = styled.Text`
  color: ${AppColors.inkSoft};
  font-size: 12px;
  font-weight: 700;
  margin-top: 2px;
`;
const ImportButton = styled(Button).attrs({ size: 'medium' })`
  align-self: stretch;
  margin-top: 18px;
`;
const NotNowButton = styled(Button).attrs({ size: 'medium' })`
  align-self: stretch;
  margin-top: 10px;
`;
