---
paths:
  - "web/src/**/*.spec.ts"
  - "web/e2e/**/*.ts"
---

# Frontend Tests

* Runner is Vitest through the Angular CLI unit test builder (the Angular 21 default). Specs sit next to the code (`chat-store.spec.ts` beside `chat-store.ts`) and run with `npm test` inside `web`.
* Playwright covers the happy path end to end under `web/e2e/`.
* Services and guards that use `inject()` are called inside `TestBed.runInInjectionContext(...)`.
* The chat resource is mocked in component and store specs. A fake SSE stream drives the store through every event type in order.

## What to assert

A spec covers behaviour and contracts: what the component promises its user, which is roughly the issue's acceptance criteria. It does not restate the implementation.

* **Never assert a literal Tailwind class.** That is the classes file written twice, and it breaks on every restyle without catching a bug. Assert the behaviour instead: each variant renders a distinct class string, the default matches an explicit default, a rule holds across all values.
* The exception is a guard that is a contract, such as `motion-safe:`. Assert it by name together with the absence of the unguarded class.
* **Select elements by meaning**: role, `aria-label`, button text. Never by a styling class.
* **Do not restate data another spec owns.** If filter chips come from a config function, check the component renders what that function returns, not a hard coded list.
* **No smoke tests.** `expect(component).toBeTruthy()` proves nothing the other tests do not already prove.
* Check a new assertion by breaking the code it covers and watching it fail.

## Must have coverage

* Chat store: every SSE event updates the right state, and an `error` event leaves the UI recoverable.
* Citation linking: clicking `[P-1234]` in an answer highlights and scrolls to the matching card, and an id with no card does nothing harmful.
* URL sync: filter chips and the query string stay in step both ways.
