import type { CustomTrick } from '@/features/custom-tricks/model/custom-trick';
import type { PracticeSessionRecord } from '@/features/stats/model/practice-history';
import type {
  KenteiClass,
  KenteiLevel,
  PracticeTrick,
  TrickSummary,
} from '@/features/tricks/model/trick';

export type DirectoryTrick =
  | TrickSummary
  | (PracticeTrick & {
      readonly customKind: CustomTrick['kind'];
      readonly kenteiRank?: number;
      readonly kenteiLevel?: KenteiLevel;
      readonly kenteiClass?: KenteiClass;
    });

export interface RankedTrickSection {
  readonly kind: 'ranked';
  readonly rank: number;
  readonly level: KenteiLevel;
  readonly className: KenteiClass;
  readonly data: DirectoryTrick[];
}

export interface CustomTrickSection {
  readonly kind: 'custom';
  readonly data: DirectoryTrick[];
}

export interface FocusedTrickSection {
  readonly kind: 'focused';
  readonly data: DirectoryTrick[];
}

export type TrickSection = RankedTrickSection | CustomTrickSection | FocusedTrickSection;

export function isCustomDirectoryTrick(trick: DirectoryTrick) {
  return 'customKind' in trick;
}

export function createProfileDirectoryTricks(
  standardTricks: readonly TrickSummary[],
  customTricks: readonly CustomTrick[],
): DirectoryTrick[] {
  const placementByRank = new Map(
    standardTricks.map((trick) => [
      trick.kenteiRank,
      { kenteiLevel: trick.kenteiLevel, kenteiClass: trick.kenteiClass },
    ]),
  );

  const customDirectoryTricks = customTricks.map((trick): DirectoryTrick => {
    const placement =
      trick.kenteiRank === undefined ? undefined : placementByRank.get(trick.kenteiRank);

    return {
      id: trick.id,
      name: trick.name,
      customKind: trick.kind,
      ...(trick.kenteiRank === undefined || !placement
        ? {}
        : { kenteiRank: trick.kenteiRank, ...placement }),
    };
  });

  return [...standardTricks, ...customDirectoryTricks];
}

export function createTrickSections(
  tricks: readonly DirectoryTrick[],
  focusedTrickIds?: readonly string[],
): TrickSection[] {
  const focusedSection: FocusedTrickSection[] =
    focusedTrickIds === undefined
      ? []
      : [
          {
            kind: 'focused',
            data: tricks.filter((trick) => focusedTrickIds.includes(trick.id)),
          },
        ];

  const sectionsByRank = new Map<number, RankedTrickSection>();
  const unrankedCustomTricks: DirectoryTrick[] = [];

  for (const trick of tricks) {
    if (
      trick.kenteiRank === undefined ||
      trick.kenteiLevel === undefined ||
      trick.kenteiClass === undefined
    ) {
      if (isCustomDirectoryTrick(trick)) unrankedCustomTricks.push(trick);
      continue;
    }

    const existingSection = sectionsByRank.get(trick.kenteiRank);
    if (existingSection) {
      existingSection.data.push(trick);
      continue;
    }

    sectionsByRank.set(trick.kenteiRank, {
      kind: 'ranked',
      rank: trick.kenteiRank,
      level: trick.kenteiLevel,
      className: trick.kenteiClass,
      data: [trick],
    });
  }

  const rankedSections = [...sectionsByRank.values()]
    .sort((first, second) => first.rank - second.rank)
    .map((section) => ({
      ...section,
      data: section.data.sort((first, second) => {
        return Number(isCustomDirectoryTrick(first)) - Number(isCustomDirectoryTrick(second));
      }),
    }));

  const trailingSections: TrickSection[] =
    unrankedCustomTricks.length === 0
      ? rankedSections
      : [...rankedSections, { kind: 'custom', data: unrankedCustomTricks }];

  return [...focusedSection, ...trailingSections];
}

// A rank is complete once every standard trick assigned to it is laced, by either practice
// history or manual marking (see selectEffectiveUnlockedTrickIds). A rank with no standard
// tricks assigned is never considered complete (guards against a stray rank number promoting
// on an empty set).
export function isKenteiRankComplete(
  rank: number,
  standardTricks: readonly TrickSummary[],
  effectiveLacedTrickIds: ReadonlySet<string>,
): boolean {
  const tricksInRank = standardTricks.filter((trick) => trick.kenteiRank === rank);
  if (tricksInRank.length === 0) return false;
  return tricksInRank.every((trick) => effectiveLacedTrickIds.has(trick.id));
}

// Starting at the currently assessed rank, advances one rank at a time while the current rank
// is fully laced (by either practice history or manual marking), cascading through multiple
// ranks in a single call if several are already complete. Never advances past the highest rank
// present in standardTricks.
export function selectPromotedKenteiRank(
  currentRank: number,
  standardTricks: readonly TrickSummary[],
  effectiveLacedTrickIds: ReadonlySet<string>,
): number {
  const maxRank = Math.max(...standardTricks.map((trick) => trick.kenteiRank));
  let rank = currentRank;
  while (rank < maxRank && isKenteiRankComplete(rank, standardTricks, effectiveLacedTrickIds)) {
    rank += 1;
  }
  return rank;
}

export function selectLacedCountByTrickId(
  sessions: readonly PracticeSessionRecord[],
): ReadonlyMap<string, number> {
  const counts = new Map<string, number>();
  for (const session of sessions) {
    counts.set(session.trickId, (counts.get(session.trickId) ?? 0) + session.laceCount);
  }
  return counts;
}

// Unlocked means at least one completed practice-history record exists for the trick ID,
// regardless of whether that record actually landed a lace (see selectLacedCountByTrickId,
// which already keeps zero-lace sessions in its map for the same reason).
export function selectUnlockedTrickIds(
  sessions: readonly PracticeSessionRecord[],
): ReadonlySet<string> {
  return new Set(sessions.map((session) => session.trickId));
}

// Layers the manual-unlock override on top of lace-derived unlock status. A trick unlocked
// by either source stays unlocked; this is a toggle, not a one-way override, so clearing the
// manual flag on a trick with no lace history reverts it to locked.
export function selectEffectiveUnlockedTrickIds(
  lacedUnlockedTrickIds: ReadonlySet<string>,
  manuallyUnlockedTrickIds: readonly string[],
): ReadonlySet<string> {
  return new Set([...lacedUnlockedTrickIds, ...manuallyUnlockedTrickIds]);
}

export function selectAvailablePracticeTricks(
  standardTricks: readonly TrickSummary[],
  customTricks: readonly CustomTrick[],
) {
  return [
    ...standardTricks.map((trick) => ({
      id: trick.id,
      name: trick.name,
      descriptor: `Rank ${trick.kenteiRank} · ${trick.kenteiLevel}`,
    })),
    ...customTricks.map((trick) => ({
      id: trick.id,
      name: trick.name,
      descriptor: trick.kind === 'sequence' ? 'Custom sequence' : 'Custom trick',
      ...(trick.kind === 'sequence'
        ? { sequenceSteps: trick.steps.map((step) => step.name) }
        : {}),
    })),
  ];
}
