import type { ControlSize } from '../theme/size';

const SIZE: Record<ControlSize, string> = {
  sm: 'px-2.5 py-0.5 text-xs',
  md: 'px-3 py-1 text-sm',
  lg: 'px-4 py-1.5 text-base',
};

export const CHIP_CLASSES = {
  root: 'inline-flex items-center gap-1 rounded-full border border-line bg-surface text-ink',
  size: SIZE,
} as const;
