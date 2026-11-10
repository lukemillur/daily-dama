import { buildTrickRowActions } from '@/features/tricks/model/trick-row-actions';

const noop = () => undefined;

describe('buildTrickRowActions', () => {
  it('gives a standard trick practice, notes and goals only', () => {
    const actions = buildTrickRowActions('Ken Up', {
      onPractice: noop,
      onOpenNotes: noop,
      onOpenGoals: noop,
    });
    expect(actions.map((a) => a.id)).toEqual(['practice', 'notes', 'goals']);
    expect(actions.map((a) => a.side)).toEqual(['leading', 'trailing', 'trailing']);
    expect(actions.some((a) => a.destructive)).toBe(false);
  });

  it('gives a custom trick edit and delete last, with only delete destructive', () => {
    const actions = buildTrickRowActions('My Trick', {
      onPractice: noop,
      onOpenNotes: noop,
      onOpenGoals: noop,
      onEdit: noop,
      onDelete: noop,
    });
    expect(actions.map((a) => a.id)).toEqual(['practice', 'notes', 'goals', 'edit', 'delete']);
    expect(actions.filter((a) => a.destructive).map((a) => a.id)).toEqual(['delete']);
    expect(actions.map((a) => a.label)).toEqual(['Practice', 'Notes', 'Goals', 'Edit', 'Delete']);
  });

  it('uses the inline accessibility labels', () => {
    const actions = buildTrickRowActions('Ken Up', { onPractice: noop, onOpenNotes: noop, onOpenGoals: noop });
    expect(actions.map((a) => a.accessibilityLabel)).toEqual([
      'Practice Ken Up',
      'Notes for Ken Up',
      'Goals for Ken Up',
    ]);
  });

  it('omits actions without handlers and never offers edit without delete', () => {
    expect(buildTrickRowActions('X', {})).toEqual([]);
    expect(buildTrickRowActions('X', { onEdit: noop }).map((a) => a.id)).toEqual([]);
    expect(buildTrickRowActions('X', { onOpenGoals: noop }).map((a) => a.id)).toEqual(['goals']);
  });

  it('invokes the matching handler', () => {
    const onDelete = jest.fn();
    const actions = buildTrickRowActions('X', { onEdit: noop, onDelete });
    actions.find((a) => a.id === 'delete')?.onSelect();
    expect(onDelete).toHaveBeenCalledTimes(1);
  });
});
