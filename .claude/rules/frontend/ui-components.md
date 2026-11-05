---
paths:
  - "web/src/**/*.ts"
  - "web/src/**/*.html"
---

# UI Component Library

`web/src/app/ui/` is the shared library of presentational building blocks: button, card, badge, chip, spinner, skeleton, drawer, empty state, input.

* A feature never hand rolls a native button, form control, spinner or drawer in its own template. Use the `ui/` component, and if it does not exist yet, build it in `ui/` first.
* `ui/` stays feature agnostic. No imports from feature folders, resources, services or shared domain types. `ui/` never knows what a property or a citation is.
* Check `ui/` for an existing component before assuming one is missing.

## Structure

One folder per component, `ui/<name>/`, holding `<name>.ts`, `<name>.html`, `<name>.spec.ts` and `<name>-classes.ts`. Selector `hs-<name>`. A small component still gets its own folder.

No `helpers.ts` or `utils.ts` inside `ui/`. A shared module sits flat in `ui/` only if it is one named concept (`unique-id.ts` for page unique DOM ids, for example).

## Classes

* A component's Tailwind strings live in its own `<name>-classes.ts`, exported as one grouped constant (`BUTTON_CLASSES`). The component holds `protected readonly classes = BUTTON_CLASSES;` and binds `[class]="classes.root"`.
* Fragments needed by three or more components (focus ring, disabled state, muted text) go in `ui/theme/fragments.ts`. Anything used by one component stays private to it.
* A classes file imports only from `ui/theme/`.
* Class names must appear as whole literal strings. Tailwind scans source text, so `` `bg-${tone}` `` is never generated.
* A variant union (`ButtonVariant`, `BadgeTone`) is derived from its class map with `keyof typeof`, so a value cannot exist without styling.
* One size scale for the whole library in `ui/theme/size.ts`. Size maps are typed `Record<ControlSize, string>` so adding a step fails to compile until every control handles it.

## Pattern

* Every variant is a named union, never inline string literals on `input()`.
* `input()` for props, `computed()` for everything derived. No logic in templates or lifecycle hooks.
* A component composing another `ui/` component maps its own inputs onto the child instead of restyling it.
* A one line doc comment above the class says where it is meant to be used.

## Colour

No literal palette classes (`red-600`, `gray-700`, `white`) in `ui/`. Colour always comes from a `--color-*` token defined in the global stylesheet, with light and dark values. Text and surface token pairs must clear 4.5:1 contrast. Add a token rather than reaching for a raw palette class.

## Loading states

* `hs-spinner` for "something is happening" in tight spaces (a send button).
* `hs-skeleton` for "content is coming in roughly this shape" (property cards while retrieval runs). It keeps layout stable.
* Both animations sit behind `motion-safe:`. Both are `aria-hidden`; the surrounding region announces the busy state.

## Empty states

A list never renders a blank area. Use `hs-empty-state` with a title, an optional description and an optional action.

## Cards

`hs-card` is the container for property cards and summary tiles. Header and footer are optional content slots on the one component. A clickable card never takes `role="button"` itself, because a control inside it would then be a nested interactive control, which fails the accessibility audit. Instead its heading becomes one native button whose hit area is stretched over the whole card, so Enter and Space come from the button. A control inside a card sits above that area and handles its own click without triggering the card.

## Testing zoneless components

Only a signal write on a test host wakes change detection. Give test host components `signal()` fields for anything a test changes after the first `detectChanges()`.
