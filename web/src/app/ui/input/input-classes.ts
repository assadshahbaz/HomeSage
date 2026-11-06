import { DISABLED, FOCUS_RING, MUTED_TEXT } from '../theme/fragments';
import type { ControlSize } from '../theme/size';

// Padding and text only, so the same scale fits a one line input and a textarea.
const SIZE: Record<ControlSize, string> = {
  sm: 'px-2 py-1 text-sm',
  md: 'px-3 py-2 text-sm',
  lg: 'px-4 py-3 text-base',
};

export const INPUT_CLASSES = {
  root: 'flex flex-col gap-1',
  label: 'text-sm font-medium text-ink',
  control: `w-full rounded-md border bg-surface text-ink placeholder:text-ink-muted ${FOCUS_RING} ${DISABLED}`,
  border: {
    valid: 'border-line',
    invalid: 'border-danger',
  },
  hint: `text-sm ${MUTED_TEXT}`,
  error: 'text-sm text-danger',
  size: SIZE,
} as const;
