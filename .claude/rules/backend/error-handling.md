---
paths:
  - "api/src/**/*.ts"
  - "api/test/**/*.ts"
---

# Error Handling

One central system in `src/platform/filters/`. No try/catch at throw sites just to reshape an error.

## The rule

* **Throw, do not catch and format.** Controllers and services throw. `AllExceptionsFilter`, registered globally in `main.ts`, is the single place that turns any thrown value into a response.
* **Standard shape**: `{ statusCode, message, error?, ...extra, path, timestamp, requestId }`.
* **Default throw site**: a built in exception from `@nestjs/common`.

  ```ts
  throw new BadRequestException('Question is empty');
  throw new ServiceUnavailableException('Search index is unavailable');
  ```

* **Custom exception classes**: do not add one ahead of need. If a case needs a machine readable code, pass an object body to `HttpException` where it is thrown:

  ```ts
  throw new HttpException(
    { errorCode: 'E_SQL_REJECTED', message: 'Query not allowed', detail: { reason } },
    HttpStatus.UNPROCESSABLE_ENTITY,
  );
  ```

  Extract a shared class only once a second real call site needs exactly the same shape.

## When catching is correct

Catching is right when it changes behaviour, not when it only changes the error's format:

* Elasticsearch fails during a chat: catch it, continue with SQL only results and tell the user the results may be incomplete.
* Generated SQL fails to execute: catch it once, feed the error back to the model for one retry, then let the second failure throw.
* Router JSON fails to parse: catch it and fall back to `hybrid`.
* The circuit breaker is open: fail fast with a clean `ServiceUnavailableException`.

A caught error that triggers a side effect (logging, a fallback, a metric) still has to surface to the caller unless the caller truly does not need to know.

## What the filter already does

* **Validation**: the Zod validation pipe throws one `BadRequestException` with per field issues. Do not repeat these checks by hand.
* **Unknown errors**: become a generic 500 with no message or stack leaked. Do not add your own fallback catch for these.
* **Logging**: the filter logs 5xx at error level with the stack and 4xx at debug. Do not also log around a throw, or it double logs.

## Tests

Build the filter directly (`new AllExceptionsFilter(...)`), mock `ArgumentsHost` with `switchToHttp().getRequest()/getResponse()`, and assert on the status and body. No `TestingModule` needed.
