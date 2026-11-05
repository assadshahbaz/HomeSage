---
paths:
  - "web/src/**/*.ts"
  - "web/src/**/*.html"
  - "web/src/**/*.css"
  - "web/src/**/*.scss"
---

# Frontend Conventions

Angular 21 (`web`), standalone components only, no `NgModule`s. Root files are `app.config.ts` and `app.routes.ts`.

## General

* **DI**: use `inject()`, not constructor injection.
* **Structure**: organise by feature (`chat/`, `property/`, `layout/`), not by type. No `utils/`, `shared/` or `common/` folder inside the app. A truly cross cutting helper gets a folder named for what it does (`format/price.ts`).
* **One concept per file.** Keep files small.
* **Signals**: `signal()` and `computed()` for state. Reach for RxJS only when the value really is a stream (HTTP, router events, the SSE feed).
* **Change detection**: zoneless. Anything a template reads that changes over time is a signal.
* **No `any`** anywhere in the web app.

## Configuration

Static data a feature reads but never changes (filter chip definitions, property type labels, pipeline stage labels) lives in `src/app/config/<concern>/<concern>.ts`, not next to whichever component used it first.

* A config file holds data plus pure functions that select from it. No `inject()`, no decorators, no HTTP, no signals.
* Export the item type from the same file so consumers type against it.
* Runtime values (the API base URL) are not config in this sense. They come from the runtime config loaded at bootstrap.

## Resources (API layer)

`src/app/resources/` is the only place that talks to the API. Components and services use a resource, never `HttpClient` directly.

* One folder per resource: `resources/chat/chat.resource.ts` exporting `ChatResource`.
* Request and response types and schemas come from the API through `@api/contracts`. Never redeclare them in the web app; if a shape is missing, add it to the API first.
* The chat resource owns the SSE connection and exposes the event stream as typed events. It handles cleanup; an interrupted stream is an error, never resumed. Components never touch `EventSource` or `fetch` streams.
* The API location is never hard coded. It comes from runtime config, defaulting to same origin `/api`.

## State

* Chat state (messages, pipeline stage, citations, under the hood data) lives in a signal based store service, not in components.
* Filter state is mirrored in the URL query string so a search can be shared and reloaded.
* The session id lives in `localStorage`, read and written through one small service with try/catch around storage access.

## Styling

* Tailwind utilities in templates. Avoid new component CSS unless Tailwind cannot express it.
* No hard coded spacing, font sizes or palette colours. Use Tailwind's scale and the theme tokens.
* Dark mode through Tailwind's dark variant driven by theme tokens.

## Naming

* Modern Angular CLI naming without the `.component` suffix: `chat-page.ts` exporting `ChatPage`.
* Kebab case filenames.
* Component selectors use the `hs-` prefix (`hs-property-card`). Attribute directives use `hs` plus camelCase.

## Components

* Standalone is the default, so do not write `standalone: true`.
* `input()`, `output()` and `model()` over decorators.
* Member order: injected deps, inputs, outputs, queries, other fields, methods.
* Template only members are `protected`. Injected deps, inputs, outputs and queries are `readonly`.
* No logic in templates. Derive with `computed()`.
* Use the built in control flow (`@if`, `@for` with `track`, `@switch`).
* `[class]` and `[style]` bindings over `NgClass` and `NgStyle`.
* Name handlers for the action (`openCitation()`), not the event (`handleClick()`).
* Business logic belongs in services, not components.

## RxJS

* `switchMap` for requests that should cancel the previous one.
* Clean up with `takeUntilDestroyed()` or `DestroyRef`.
* No nested subscribes.

## Forms

* Reactive forms. Validate on blur or submit, not every keystroke.
* Client validation is for user experience only. The API validates everything again.

## Accessibility

* Every interactive element works with a keyboard and has a visible focus state.
* Streaming answer regions use `aria-live="polite"` so screen readers hear the answer without being flooded per token.
* Target Lighthouse accessibility of 90 or higher.
