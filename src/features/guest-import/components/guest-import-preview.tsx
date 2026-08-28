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
  const { state, confirmImport, cancelImport, chooseProfile, resolveConflict, finishConflicts } = useGuestImport();

  if (identity.kind !== 'user') return null;
  if (state.status === 'idle' || state.status === 'cancelled' || state.status === 'completed') return null;

  if (state.status === 'inventorying') {
    return (
      <Section accessibilityLabel="Checking local practice data">
        <BodyText>Checking your local practice data...</BodyText>
      </Section>
    );
  }

  if (state.status === 'uploading') {
    return (
      <Section accessibilityLabel="Import in progress">
        <BodyText>Import in progress...</BodyText>
      </Section>
    );
  }

  if (state.status === 'awaitingProfileChoice' || state.status === 'conflicts') {
    const comparison = state.profileComparison;
    const resolved = new Set(state.conflictResolutions.map((item) => `${item.domain}:${item.recordId}`));
    return (
      <Section accessibilityLabel="Import in progress">
        <Title>{state.status === 'awaitingProfileChoice' ? 'Choose your profile preferences' : 'Resolve import conflicts'}</Title>
        {comparison ? <>
          <Copy>Choose which profile preferences to keep. Trick selections are merged separately.</Copy>
          <ChoiceButton accessibilityLabel="Keep guest profile preferences" onPress={() => chooseProfile?.('guest')} variant={state.profileChoice === 'guest' ? 'primary' : 'secondary'}>Keep guest preferences</ChoiceButton>
          <ChoiceButton accessibilityLabel="Keep cloud profile preferences" onPress={() => chooseProfile?.('cloud')} variant={state.profileChoice === 'cloud' ? 'primary' : 'secondary'} disabled={comparison.cloud === null}>Keep cloud preferences{comparison.cloud === null ? ' (not available)' : ''}</ChoiceButton>
          <Snapshot accessibilityLabel="Guest profile preferences">Guest: {JSON.stringify(comparison.guest)}</Snapshot>
          <Snapshot accessibilityLabel="Cloud profile preferences">Cloud: {comparison.cloud === null ? 'No cloud profile' : JSON.stringify(comparison.cloud)}</Snapshot>
        </> : null}
        {state.conflicts.length > 0 ? <>
          <Copy>{state.conflicts.length - resolved.size} unresolved record conflict(s)</Copy>
          {state.conflicts.map((conflict) => {
            const key = `${conflict.domain}:${conflict.recordId}`;
            const done = resolved.has(key);
            return <ConflictRow key={key}>
              <BodyText>{DOMAIN_LABELS[conflict.domain]} — {conflict.recordId}</BodyText>
              <Snapshot>Guest: {JSON.stringify(conflict.guestSnapshot)}</Snapshot>
              <Snapshot>Cloud: {JSON.stringify(conflict.cloudSnapshot)}</Snapshot>
              <ChoiceButton accessibilityLabel={`Keep guest ${conflict.recordId}`} onPress={() => resolveConflict?.(conflict.domain, conflict.recordId, 'guest')} variant={done ? 'secondary' : 'primary'} disabled={done}>Keep guest</ChoiceButton>
              <ChoiceButton accessibilityLabel={`Keep cloud ${conflict.recordId}`} onPress={() => resolveConflict?.(conflict.domain, conflict.recordId, 'cloud')} variant="secondary" disabled={done}>Keep cloud</ChoiceButton>
            </ConflictRow>;
          })}
          <ChoiceButton accessibilityLabel="Finish conflict resolution" onPress={() => finishConflicts?.()} variant="primary" disabled={state.profileChoice === undefined || resolved.size !== state.conflicts.length}>Done</ChoiceButton>
        </> : null}
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
const ChoiceButton = styled(Button).attrs({ size: 'medium' })`
  align-self: stretch;
  margin-top: 10px;
`;
const Snapshot = styled(BodyText)`
  margin-top: 8px;
  font-size: 12px;
`;
const ConflictRow = styled.View`
  margin-top: 16px;
  padding-top: 12px;
  border-top-width: 1px;
  border-top-color: ${AppColors.inkSoft};
`;
