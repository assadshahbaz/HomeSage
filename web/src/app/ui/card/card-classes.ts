export const CARD_CLASSES = {
  root: 'relative flex flex-col gap-3 rounded-lg border bg-surface-raised p-4 text-ink transition-colors',
  // One of the two, so the border colour never depends on CSS order.
  border: {
    normal: 'border-line',
    highlighted: 'border-accent ring-2 ring-accent',
  },
  clickableRoot: 'hover:border-accent',
  top: 'flex items-start justify-between gap-3',
  heading: 'font-semibold',
  // The title button's ::after covers the whole card, so a click anywhere on it
  // lands on one real button, and its focus ring is drawn around the card.
  action:
    'cursor-pointer text-left font-semibold after:absolute after:inset-0 after:rounded-lg focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:outline-offset-2 focus-visible:after:outline-focus',
  slot: 'empty:hidden',
  // Content sits above the stretched area. Plain text lets clicks through to it;
  // controls inside the card take their own clicks.
  clickableSlot:
    'relative z-10 pointer-events-none [&_a]:pointer-events-auto [&_button]:pointer-events-auto [&_input]:pointer-events-auto [&_select]:pointer-events-auto [&_summary]:pointer-events-auto [&_textarea]:pointer-events-auto',
} as const;
