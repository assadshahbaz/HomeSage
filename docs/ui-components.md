# UI components

`web/src/app/ui/` is the shared library of presentational building blocks. Features compose these instead of hand rolling native controls, so focus rings, disabled states, sizes and colours stay consistent and are fixed in one place. This page lists what exists and how to use it. Add a section here in the same change that adds a component.

The rules the library is built to are in `.claude/rules/frontend/ui-components.md`. In short:

* One folder per component: `<name>.ts`, `<name>.html`, `<name>.spec.ts` and `<name>-classes.ts`, selector `hs-<name>`.
* `ui/` never imports from a feature, a resource or a domain type. It does not know what a property or a citation is.
* All Tailwind strings for a component live in its `-classes.ts`. Variant unions are derived from the class map, so a variant cannot exist without styling.
* Colour only comes from the theme tokens below.

## Theme tokens

Defined in `web/src/styles.css` with a light value under `@theme` and a dark value under `[data-theme='dark']`. Tailwind's own palette is switched off, so `bg-red-600` or `text-white` generates nothing; use a token utility such as `bg-surface` or `text-ink-muted`.

| Token | Use | Example utilities |
|-------|-----|-------------------|
| `surface` | Page background | `bg-surface` |
| `surface-raised` | Panels, cards, hover on quiet controls | `bg-surface-raised` |
| `surface-sunken` | Hover on raised controls, wells | `bg-surface-sunken` |
| `ink` | Body text | `text-ink` |
| `ink-muted` | Secondary text | `text-ink-muted` |
| `line` | Borders and dividers | `border-line` |
| `accent` | Primary actions, links | `bg-accent`, `text-accent` |
| `accent-hover` | Hover on primary actions | `hover:bg-accent-hover` |
| `on-accent` | Text on an accent background | `text-on-accent` |
| `focus` | Keyboard focus outline | `outline-focus` |
| `danger` | Error text and invalid field borders | `text-danger`, `border-danger` |

Every token must have a dark value, and every text on surface pair must reach 4.5:1 contrast in both themes. `web/src/theme-contrast.spec.ts` checks both, so a new token or a new pair is added there too.

The theme is set on `<html>` as `data-theme="light"` or `"dark"`. A small script in `index.html` sets it before first paint from the stored choice or the system preference, and `ThemePreference` in `layout/theme/` keeps it in step after the app starts. Components rarely need the `dark:` variant, since the tokens already switch; it exists for the case a token swap cannot express.

## Shared pieces

| File | What it holds |
|------|---------------|
| `ui/theme/size.ts` | `ControlSize`: `sm`, `md`, `lg`. Every control's size map is typed `Record<ControlSize, string>`, so adding a step fails to compile until every control handles it. |
| `ui/theme/fragments.ts` | `FOCUS_RING` (outline shown for keyboard focus only), `DISABLED` and `MUTED_TEXT` (hints, descriptions, the neutral badge). Fragments used by three or more components go here; anything else stays in the component's own classes file. |
| `ui/unique-id.ts` | `uniqueId(prefix)`: an id unique on the page, for linking a label, hint, error or heading to its element. |

## Button

`hs-button` wraps a native `<button>`. Use it for every clickable action.

| Input | Type | Default | Notes |
|-------|------|---------|-------|
| `variant` | `'primary' \| 'secondary' \| 'ghost'` | `'secondary'` | `primary` for the one main action in a view, `ghost` for quiet toolbar actions |
| `size` | `ControlSize` | `'md'` | |
| `type` | `'button' \| 'submit'` | `'button'` | `submit` only inside a form |
| `disabled` | `boolean` | `false` | A disabled button never emits a click |
| `label` | `string` | none | Accessible name. Required when the content is only an icon |
| `pressed` | `boolean` | none | Set only for a toggle button; becomes `aria-pressed` |

Listen with `(click)` on the element. The native click bubbles out of `hs-button`, and a disabled native button does not fire one.

```html
<hs-button variant="primary" type="submit" [disabled]="sending()">Send</hs-button>

<hs-button variant="ghost" size="sm" label="Dark theme" [pressed]="isDark()" (click)="toggleTheme()">
  <svg aria-hidden="true">...</svg>
</hs-button>
```

Accessibility: the focus ring shows for keyboard focus only, the accessible name comes from the content or `label`, and a toggle keeps the same name while `aria-pressed` reports its state. Do not change the label to describe the next state as well; screen readers announce the pressed state already.

## Input

`hs-input` is a labelled text field, one line or multiline, with an optional hint and error. Bind it with a reactive form control.

| Input | Type | Default | Notes |
|-------|------|---------|-------|
| `label` | `string` | required | Always visible, and the field's accessible name |
| `hint` | `string` | none | Muted text under the field, announced with it |
| `error` | `string` | none | Shown under the field in the `danger` colour, announced with it, and sets `aria-invalid` |
| `type` | `'text' \| 'search'` | `'text'` | One line mode only |
| `placeholder` | `string` | none | An example, never a replacement for the label |
| `size` | `ControlSize` | `'md'` | Padding and text size, so it fits both modes |
| `multiline` | `boolean` | `false` | Renders a `<textarea>` |
| `rows` | `number` | `3` | Multiline mode only |
| `disabled` | `boolean` | `false` | A disabled form control disables it too |

```html
<hs-input
  label="Your question"
  hint="Ask in plain English"
  [error]="questionError()"
  [multiline]="true"
  [formControl]="question"
  (keydown.enter)="send($event)"
/>
```

Validation belongs to the form, and whatever the field checks is repeated by the API. Keyboard handling such as Enter to send is the feature's: native keyboard events bubble out of `hs-input`.

## Card

`hs-card` is the container for property cards and summary tiles.

| Input or output | Type | Default | Notes |
|-----------------|------|---------|-------|
| `heading` | `string` | none | Rendered as an `h3` at the top |
| `clickable` | `boolean` | `false` | Turns the heading into the card's one button. Needs a heading to name it |
| `highlighted` | `boolean` | `false` | An accent border and ring for the card a reader was just sent to, such as the one a citation points at |
| `activated` | output | | Emitted when the clickable card is clicked or its button is pressed |

| Slot | Where it renders |
|------|------------------|
| `[hsCardHeader]` | Beside the heading, for a price or badges |
| default | The body |
| `[hsCardFooter]` | Under the body, for a note or actions |

```html
<hs-card [heading]="property.address" [clickable]="true" (activated)="open(property)">
  <hs-badge hsCardHeader>Band E</hs-badge>
  <p>3 bedrooms, 2 bathrooms</p>
  <p hsCardFooter>Listing data from 13 April 2025</p>
</hs-card>
```

Accessibility: a clickable card is not `role="button"`, because any control inside it would then be a nested interactive control, which fails the accessibility audit. The heading's button has a hit area stretched over the whole card, so a click anywhere activates it, Enter and Space work because it is a real button, and its focus ring outlines the whole card. A link or button inside the card sits above that area and takes its own click. Text inside a clickable card cannot be selected with the mouse, since clicks on it go through to the card.

## Badge

`hs-badge` is a short inline label for a fact or a status, such as a council tax band.

| Input | Type | Default | Notes |
|-------|------|---------|-------|
| `tone` | `'neutral' \| 'accent'` | `'neutral'` | `accent` for the one fact that matters most on a card |
| `size` | `ControlSize` | `'sm'` | |

```html
<hs-badge>Band E</hs-badge>
```

## Chip

`hs-chip` is a rounded label for a filter value, such as "Under £250,000". It is display only; removing or editing a chip is added when the editable filters need it.

| Input | Type | Default |
|-------|------|---------|
| `size` | `ControlSize` | `'md'` |

```html
<hs-chip>Under £250,000</hs-chip>
```

## Spinner

`hs-spinner` means "something is happening" in a tight space, such as a send button. It inherits the text colour.

| Input | Type | Default |
|-------|------|---------|
| `size` | `ControlSize` | `'md'` |

It is `aria-hidden`, so the surrounding region must announce the busy state, for example with `aria-busy` on the region or visually hidden text. It spins only under `motion-safe:`; with reduced motion it is a still ring.

## Skeleton

`hs-skeleton` is a placeholder in roughly the shape of content that is on its way, such as a property card while retrieval runs. It keeps the layout from jumping when the content arrives.

| Input | Type | Default | Notes |
|-------|------|---------|-------|
| `shape` | `'line' \| 'block'` | `'line'` | A line of text, or a block about the height of a card |

```html
<hs-card>
  <div class="flex flex-col gap-2">
    <hs-skeleton />
    <hs-skeleton />
    <hs-skeleton shape="block" />
  </div>
</hs-card>
```

Skeletons add no spacing of their own; the layout around them does. Like the spinner it is `aria-hidden`, pulses only under `motion-safe:`, and relies on the surrounding region to announce that content is loading.

## Drawer

`hs-drawer` is a panel that slides over the page from the end edge, such as the under the hood view. It is full width on small screens.

| Input | Type | Default | Notes |
|-------|------|---------|-------|
| `heading` | `string` | required | The drawer's title and its accessible name |
| `open` | `boolean`, two way | `false` | Set it to open; it is set back to `false` whenever the drawer closes |

```html
<hs-button (click)="detailsOpen.set(true)">Under the hood</hs-button>
<hs-drawer heading="Under the hood" [(open)]="detailsOpen">
  ...
</hs-drawer>
```

It is a native modal `<dialog>`, so the browser does the hard parts: focus moves into the drawer and cannot Tab out of it, the page behind is inert, Escape closes it, and focus returns to the control that opened it. It also closes from its Close button and from a click on the backdrop.

## Empty state

`hs-empty-state` is what a list shows instead of a blank area.

| Input | Type | Default |
|-------|------|---------|
| `heading` | `string` | required |
| `description` | `string` | none |

Projected content is the optional action.

```html
<hs-empty-state heading="No properties match" description="Try a higher price or fewer filters.">
  <hs-button (click)="startAgain()">Start again</hs-button>
</hs-empty-state>
```
