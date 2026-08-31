// T159.1: minimal Profile-adjacent preview of a resumable guest import.
// Presentational only -- inspects useGuestImport()'s status and renders
// accordingly.
//
// T186.1: import is now auto-confirmed by the hook itself as soon as
// awaitingConfirmation is reached with local data, so this component no
// longer renders the manual confirm/"Not now" decision (the
// 'awaitingConfirmation'/'inventorying' branches).
//
// T186.2: an existing-account merge's profile-preference and per-record
// conflicts are now resolved automatically by `updatedAt` at merge-planning
// time (see .claude/plans/T186.2.md), so the `awaitingProfileChoice`/
// `conflicts` statuses no longer exist and there is nothing left for this
// component to render for them -- the manual choice/JSON-snapshot UI that
// used to live here has been deleted entirely, not just hidden.

import { styled } from 'styled-components/native';

import { BodyText } from '@/components/ui/typography';
import { AppColors } from '@/constants/theme';
import { useGuestImport } from '@/features/guest-import/state/use-guest-import';
import { useIdentityHandle } from '@/shared/persistence/identity-provider';

export function GuestImportPreview() {
  const { identity } = useIdentityHandle();
  const { state } = useGuestImport();

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

  return null;
}

const Section = styled.View`
  width: 100%;
  margin-top: 22px;
  padding: 16px;
  border-width: 2px;
  border-color: ${AppColors.ink};
`;
