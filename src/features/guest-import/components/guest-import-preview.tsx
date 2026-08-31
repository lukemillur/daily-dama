// T159.1: minimal Profile-adjacent preview of a resumable guest import.
// Presentational only -- inspects useGuestImport()'s status and renders
// accordingly.
//
// T186.1: import is now auto-confirmed by the hook itself as soon as
// awaitingConfirmation is reached with local data, so this component no
// longer renders the manual confirm/"Not now" decision (the
// 'awaitingConfirmation'/'inventorying' branches) -- see
// .claude/plans/T186.1.md's "Scope decision" for why the
// 'uploading'/'awaitingProfileChoice'/'conflicts' branches below are kept:
// they're a different, still-required decision (profile/record conflict
// resolution during an existing-account merge) untouched by this ticket.

import { styled } from 'styled-components/native';

import { Button } from '@/components/ui/button';
import { BodyText } from '@/components/ui/typography';
import { AppColors } from '@/constants/theme';
import { useGuestImport } from '@/features/guest-import/state/use-guest-import';
import { useIdentityHandle } from '@/shared/persistence/identity-provider';
import type { SyncDomain } from '@/shared/sync/domain';

const DOMAIN_LABELS: Readonly<Record<SyncDomain, string>> = {
  profile: 'Profile & trick selections',
  customTricks: 'Custom tricks',
  practiceHistory: 'Practice history',
  goals: 'Goals',
  notes: 'Notes',
};

export function GuestImportPreview() {
  const { identity } = useIdentityHandle();
  const { state, chooseProfile, resolveConflict, finishConflicts } = useGuestImport();

  if (identity.kind !== 'user') return null;
  if (
    state.status === 'idle' ||
    state.status === 'cancelled' ||
    state.status === 'completed' ||
    state.status === 'inventorying' ||
    state.status === 'awaitingConfirmation'
  ) {
    return null;
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

  return null;
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
