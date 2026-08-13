import { Link } from 'expo-router';
import { styled } from 'styled-components/native';

import { AppColors } from '@/constants/theme';
import { formatPracticeDate } from '@/features/stats/model/format-practice-date';
import type { NeglectedTrick } from '@/features/stats/model/neglected-tricks';

export interface NeglectedTrickCandidate {
  readonly id: string;
  readonly name: string;
}

// Deliberately subordinate to the core Stats summary: no card chrome, no metrics, just a
// compact nudge with a direct Practice action per trick. Renders nothing (not even a heading)
// when there are no suggestions, so an empty result adds no visual weight.
export function NeglectedTricksSection({
  neglectedTricks,
}: {
  readonly neglectedTricks: readonly NeglectedTrick<NeglectedTrickCandidate>[];
}) {
  if (neglectedTricks.length === 0) return null;

  return (
    <Section>
      <SectionLabel>Needs attention</SectionLabel>
      <List>
        {neglectedTricks.map((entry) => (
          <Row key={entry.trick.id}>
            <RowText>
              <RowName>{entry.trick.name}</RowName>
              <RowMeta>
                {entry.mostRecentPracticeAt === undefined
                  ? 'Never practiced'
                  : `Last practiced ${formatPracticeDate(entry.mostRecentPracticeAt)}`}
              </RowMeta>
            </RowText>
            <Link asChild href={{ pathname: '/sesh', params: { trickId: entry.trick.id } }}>
              <PracticeAction
                accessibilityLabel={`Practice ${entry.trick.name}`}
                accessibilityRole="link">
                Practice →
              </PracticeAction>
            </Link>
          </Row>
        ))}
      </List>
    </Section>
  );
}

const Section = styled.View`margin-top: 30px;`;
const SectionLabel = styled.Text`color: ${AppColors.textMuted}; font-size: 12px; font-weight: 800; letter-spacing: 1.4px; margin-bottom: 10px; text-transform: uppercase;`;
const List = styled.View`gap: 8px;`;
const Row = styled.View`flex-direction: row; align-items: center; justify-content: space-between; gap: 12px; padding: 10px 0; border-bottom-width: 1px; border-bottom-color: ${AppColors.paper};`;
const RowText = styled.View`flex: 1;`;
const RowName = styled.Text`color: ${AppColors.ink}; font-size: 15px; font-weight: 700;`;
const RowMeta = styled.Text`color: ${AppColors.textMuted}; font-size: 11px; font-weight: 600; margin-top: 2px;`;
const PracticeAction = styled.Text`color: ${AppColors.red}; font-size: 13px; font-weight: 800;`;
