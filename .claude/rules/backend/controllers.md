---
paths:
  - "api/src/**/*.controller.ts"
---

# Controllers

* Controllers parse the request and delegate. No business logic, no SQL, no Elasticsearch calls. Inject a service and call it.
* Handlers may be `async`. Return the value and let Nest serialise it. No `res.json()`.
* Validate bodies and query params with the Zod schema from `src/contracts/` through the validation pipe, not with hand written checks in the handler.
* Throw an `HttpException` subclass when a failure maps to a status code. The global filter does the rest.
* Rate limits are applied with the throttler decorators, not with checks inside the handler.

## Response shape

* Every endpoint returns a type defined in `src/contracts/`. The web app imports the same type through `@api/contracts`, so the two cannot drift.
* Never return internal detail the caller has no use for: raw database errors, stack traces, full prompts, provider request ids, embedding vectors. Map to the response type explicitly rather than returning whatever the service produced.
* Debug information shown in the UI's "under the hood" panel (intent, generated SQL, retrieval scores) is part of the contract on purpose and is typed like everything else.

## Streaming

`POST /chat` streams Server Sent Events. The controller only adapts the chat service's event stream to SSE. Event names and payloads come from the shared contract, in this order:

1. `route`
2. `retrieval`
3. `token` (many)
4. `citations`
5. `done`, or `error` with a user safe message

A failure after streaming has started is sent as an `error` event, since the status code has already gone out.
