import type { CustomTrick } from '@/features/custom-tricks/model/custom-trick';
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
