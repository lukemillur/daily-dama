import type { KenteiClass, KenteiLevel, TrickSummary } from '@/features/tricks/model/trick';

interface TrickGroup {
  readonly rank: number;
  readonly level: KenteiLevel;
  readonly className: KenteiClass;
  readonly names: readonly string[];
}

const groups = [
  {
    rank: 1,
    level: 'Basic',
    className: '3rd Class',
    names: ['Big cup', 'Small cup', 'Base cup', 'Moshikame x5', 'Pull up spike (Spin or No spin)'],
  },
  {
    rank: 2,
    level: 'Basic',
    className: '2nd Class',
    names: ['Baseball', 'Easy big cup, Spike', 'Small cup, Big cup', 'Moshikame x10', 'Airplane'],
  },
  {
    rank: 3,
    level: 'Basic',
    className: '1st Class',
    names: ['Frying pan, Spike', 'Around the block', 'Trapeze', 'Moshikame x20', 'Around Japan'],
  },
  {
    rank: 4,
    level: 'Advanced',
    className: '3rd Class',
    names: ['Moshikame x10 or more, Spike', 'Swing spike', 'Around the World', 'Stuntplane', 'Lighthouse, Falling in'],
  },
  {
    rank: 5,
    level: 'Advanced',
    className: '2nd Class',
    names: ['Bird, Spike', 'Around Europe', 'Earth turn', 'Downspike', 'Jumping stick'],
  },
  {
    rank: 6,
    level: 'Advanced',
    className: '1st Class',
    names: [
      '1 turn lighthouse, Tradespike',
      'Big cup, Kenflip big cup, Spike',
      '1 turn airplane',
      'Lighthouse flip, Falling in',
      'Airplane, Base cup, Downspike',
    ],
  },
  {
    rank: 7,
    level: 'Expert',
    className: '3rd Class',
    names: ['Gunslinger spike', 'Juggle big cup, Spike', 'Lunar, Flip in', 'Turntable, Spike', 'Around USA'],
  },
  {
    rank: 8,
    level: 'Expert',
    className: '2nd Class',
    names: ['2 turn airplane', 'Stilt, Flip in', 'Spacewalk', 'Kenflip Lighthouse, Falling in', 'Whirlwind'],
  },
  {
    rank: 9,
    level: 'Expert',
    className: '1st Class',
    names: [
      'Handlestall, 1 turn spike',
      'Swirl to airplane (Ken grip start)',
      'Spacewalk swap spike',
      '1 turn lunar, Falling in',
      'Juggle spike',
    ],
  },
  {
    rank: 10,
    level: 'Master',
    className: '3rd Class',
    names: [
      'Sweets special',
      'Airplane, 1.5 swap spike',
      'Kenflip downspike',
      '2 turn lighthouse, Stuntplane fasthand',
      'Double whirlwind',
    ],
  },
  {
    rank: 11,
    level: 'Master',
    className: '2nd Class',
    names: [
      'Around Denmark',
      '2 turn airplane, Double jumping stick',
      'Tap juggle spike',
      'Around stall, 1 turn spike',
      'Lightning drop swap spike',
    ],
  },
  {
    rank: 12,
    level: 'Master',
    className: '1st Class',
    names: [
      'Gooncircle',
      'Stilt flip, Flip in',
      'Bird, Juggle bird, 1 turn spike',
      'Inward lunar, Flip cushion tap inward lunar, Falling in',
      'Kenflip juggle kenflip juggle spike',
    ],
  },
] as const satisfies readonly TrickGroup[];

function createId(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export const KENDAMA_KENTEI_TRICKS: readonly TrickSummary[] = groups.flatMap((group) =>
  group.names.map((name) => ({
    id: createId(name),
    name,
    kenteiRank: group.rank,
    kenteiLevel: group.level,
    kenteiClass: group.className,
  })),
);
