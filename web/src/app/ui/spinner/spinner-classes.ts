import type { ControlSize } from '../theme/size';

const SIZE: Record<ControlSize, string> = {
  sm: 'size-4',
  md: 'size-5',
  lg: 'size-6',
};

export const SPINNER_CLASSES = {
  // With reduced motion the ring stays still, which still reads as busy.
  root: 'inline-block shrink-0 motion-safe:animate-spin',
  track: 'opacity-25',
  arc: 'opacity-90',
  size: SIZE,
} as const;
