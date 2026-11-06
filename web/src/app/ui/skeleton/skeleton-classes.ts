export const SKELETON_CLASSES = {
  root: 'block bg-surface-sunken motion-safe:animate-pulse',
  shape: {
    line: 'h-4 w-full rounded',
    block: 'h-24 w-full rounded-lg',
  },
} as const;

export type SkeletonShape = keyof typeof SKELETON_CLASSES.shape;
