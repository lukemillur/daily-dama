export const KENTEI_LEVELS = ['Basic', 'Advanced', 'Expert', 'Master'] as const;

export type KenteiLevel = (typeof KENTEI_LEVELS)[number];
export type KenteiClass = '3rd Class' | '2nd Class' | '1st Class';

export interface TrickSummary {
  readonly id: string;
  readonly name: string;
  readonly kenteiRank: number;
  readonly kenteiLevel: KenteiLevel;
  readonly kenteiClass: KenteiClass;
}
