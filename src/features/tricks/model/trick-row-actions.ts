export type TrickRowActionId = 'practice' | 'notes' | 'goals' | 'edit' | 'delete';

export interface TrickRowAction {
  readonly id: TrickRowActionId;
  readonly label: string;
  readonly accessibilityLabel: string;
  readonly destructive: boolean;
  /** Swipe side: leading is revealed by swiping right, trailing by swiping left. */
  readonly side: 'leading' | 'trailing';
  readonly onSelect: () => void;
}

export interface TrickRowActionHandlers {
  readonly onPractice?: () => void;
  readonly onOpenNotes?: () => void;
  readonly onOpenGoals?: () => void;
  /** Edit and Delete only exist together, for custom tricks. */
  readonly onEdit?: () => void;
  readonly onDelete?: () => void;
}

/**
 * The single definition of a row's actions. Swipe panels and VoiceOver custom actions both render
 * this list, so they cannot drift. Order is fixed; Delete is last so it is outermost.
 */
export function buildTrickRowActions(
  trickName: string,
  handlers: TrickRowActionHandlers,
): readonly TrickRowAction[] {
  const actions: TrickRowAction[] = [];
  if (handlers.onPractice) {
    actions.push({
      id: 'practice',
      label: 'Practice',
      accessibilityLabel: `Practice ${trickName}`,
      destructive: false,
      side: 'leading',
      onSelect: handlers.onPractice,
    });
  }
  if (handlers.onOpenNotes) {
    actions.push({
      id: 'notes',
      label: 'Notes',
      accessibilityLabel: `Notes for ${trickName}`,
      destructive: false,
      side: 'trailing',
      onSelect: handlers.onOpenNotes,
    });
  }
  if (handlers.onOpenGoals) {
    actions.push({
      id: 'goals',
      label: 'Goals',
      accessibilityLabel: `Goals for ${trickName}`,
      destructive: false,
      side: 'trailing',
      onSelect: handlers.onOpenGoals,
    });
  }
  if (handlers.onEdit && handlers.onDelete) {
    actions.push(
      {
        id: 'edit',
        label: 'Edit',
        accessibilityLabel: `Edit ${trickName}`,
        destructive: false,
        side: 'trailing',
        onSelect: handlers.onEdit,
      },
      {
        id: 'delete',
        label: 'Delete',
        accessibilityLabel: `Delete ${trickName}`,
        destructive: true,
        side: 'trailing',
        onSelect: handlers.onDelete,
      },
    );
  }
  return actions;
}
