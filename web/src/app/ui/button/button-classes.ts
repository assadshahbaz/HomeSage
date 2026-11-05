import { DISABLED, FOCUS_RING } from '../theme/fragments';
import type { ControlSize } from '../theme/size';

const SIZE: Record<ControlSize, string> = {
  sm: 'h-8 px-3 text-sm',
  md: 'h-10 px-4 text-sm',
  lg: 'h-12 px-5 text-base',
};

export const BUTTON_CLASSES = {
  root: `inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors ${FOCUS_RING} ${DISABLED}`,
  variant: {
    primary: 'bg-accent text-on-accent enabled:hover:bg-accent-hover',
    secondary: 'border border-line bg-surface-raised text-ink enabled:hover:bg-surface-sunken',
    ghost: 'text-ink enabled:hover:bg-surface-raised',
  },
  size: SIZE,
} as const;

export type ButtonVariant = keyof typeof BUTTON_CLASSES.variant;
