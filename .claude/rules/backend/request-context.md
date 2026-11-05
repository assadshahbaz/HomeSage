---
paths:
  - "api/src/**/*.ts"
---

# Request Context

`RequestContextService` (`src/platform/request-context/`) is the only way code below a controller reaches request scoped values: the request id, the chat session id and the trace id. Do not pass these through service signatures and do not read `request` below a controller.

## Reading it

Inject `RequestContextService`. Its module is `@Global()`, so no feature imports it.

* `getRequestId()`, `getSessionId()` and `getTraceId()` return `undefined` outside a request.
* Reads never throw. The ingestion CLI, scheduled sync, eval runner and health checks all run with no request and must keep working.

## How it works

* `AsyncLocalStorage`, opened by a middleware on every route.
* Not a Nest request scoped provider. Request scope spreads up the injection chain and would make every service request scoped. ALS keeps all providers singletons.
* Consumers depend on the service, not the storage, so the implementation can change.

## Request id

* Taken from an inbound `X-Request-Id` only when it is a short plain token, generated otherwise. Long values or values containing newlines are rejected, since they could forge log lines.
* Echoed back on the response under the same header.

## Logs and traces

The Pino logger reads the context on every line, so `requestId` and `sessionId` are stamped automatically. Do not add them to log calls by hand.

Never log question text together with anything identifying the caller, and never log API keys, full prompts with secrets or raw provider responses at info level.
