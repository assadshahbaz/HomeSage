import { MUTED_TEXT } from '../theme/fragments';
import type { ControlSize } from '../theme/size';

const SIZE: Record<ControlSize, string> = {
  sm: 'px-2 py-0.5 text-xs',
  md: 'px-2.5 py-0.5 text-sm',
  lg: 'px-3 py-1 text-base',
};

export const BADGE_CLASSES = {
  root: 'inline-flex items-center rounded-full font-medium',
  tone: {
    neutral: `bg-surface-sunken ${MUTED_TEXT}`,
    accent: 'bg-accent text-on-accent',
  },
  size: SIZE,
} as const;

export type BadgeTone = keyof typeof BADGE_CLASSES.tone;
