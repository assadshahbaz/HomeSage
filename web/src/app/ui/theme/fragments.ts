// Class fragments shared by several `ui/` components. Each is a whole literal
// string, because Tailwind only generates classes it can read in the source.

/** Keyboard focus ring, shown only for keyboard focus. */
export const FOCUS_RING =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus';

/** Disabled state for native controls. */
export const DISABLED = 'disabled:cursor-not-allowed disabled:opacity-50';

/** Secondary text: hints, descriptions and quiet labels. */
export const MUTED_TEXT = 'text-ink-muted';
