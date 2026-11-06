import { MUTED_TEXT } from '../theme/fragments';

export const EMPTY_STATE_CLASSES = {
  root: 'flex flex-col items-center gap-2 rounded-lg border border-dashed border-line px-6 py-10 text-center',
  heading: 'font-medium text-ink',
  description: `max-w-prose text-sm ${MUTED_TEXT}`,
  action: 'mt-2 empty:hidden',
} as const;
