---
paths:
  - "api/src/**/*.spec.ts"
  - "api/tools/**/*.spec.ts"
  - "api/test/**/*.e2e-spec.ts"
---

# Backend Tests

Runner is Vitest (the NestJS 12 default), run from `api`. Use `vi.fn()` and `vi.spyOn()` for mocks.

* **Unit tests** sit next to the code as `*.spec.ts` (`sql-validator.ts` next to `sql-validator.spec.ts`). Run with `npm test`, or `npm test -- sql-validator` for one file.
* **e2e tests** live in `api/test/*.e2e-spec.ts` and boot the real `AppModule`, using Supertest. They need the Docker services running, or Testcontainers where a spec starts its own.
* Use `.only` while iterating and remove it before committing.

## Unit test style

* Build the class under test directly with mocked constructor arguments. Do not start a `TestingModule` for a plain unit test.
* Mock every injected dependency: `LlmService`, `EmbeddingProvider`, repositories, the ES client.
* Never call a real model provider from a unit or e2e test. Real calls belong to the eval harness only.
* Use realistic ids in the same format production uses (`P-1234`), pulled into named constants at the top of the file. A readable placeholder like `'prop-1'` passes against code that would reject the real thing.

## What to cover

* Every rejection and fallback path, not just the happy path. The validator, router fallback, citation guard and ES down fallback each need explicit tests.
* Pure logic (RRF merge, citation guard, document builder, validator) gets thorough table driven tests since it is cheap to test well.
* Check that a new assertion earns its place by breaking the code it covers and watching it fail. An assertion that passes either way costs a run and buys false confidence.
* No smoke tests like `expect(service).toBeDefined()`. Every other test already proves that.
