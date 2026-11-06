export const DRAWER_CLASSES = {
  // No display class here: a closed <dialog> must keep the browser's display: none.
  dialog:
    'fixed inset-y-0 end-0 start-auto m-0 h-dvh max-h-dvh w-full max-w-full border-s border-line bg-surface p-0 text-ink sm:max-w-md backdrop:bg-ink/40',
  // Fills the dialog, so a click that lands on the dialog itself is a backdrop click.
  panel: 'flex h-full flex-col',
  header: 'flex items-center justify-between gap-3 border-b border-line px-4 py-3',
  heading: 'text-lg font-semibold',
  body: 'flex-1 overflow-y-auto px-4 py-4',
} as const;
