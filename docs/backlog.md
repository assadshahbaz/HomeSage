# Backlog

Ideas and known gaps. Nothing here is scheduled.

## Before any public deployment

* **Shutdown hooks are never armed.** The MySQL, Elasticsearch and Redis modules implement `onApplicationShutdown`, but `main.ts` never calls `app.enableShutdownHooks()`, so a restart drops connections rather than draining them.
* **Rate limits need the real client IP behind a proxy.** `ThrottleGuard` keys on `request.ip`, which behind a proxy is the proxy's address unless Express is told to trust it. Every visitor would then share one counter.
* **A provider overload reaches the client as a 500.** Adapters turn their own timeout into a 504, but any other vendor error passes through. Overload should map to a 503 and a rate limit to a 429 with `Retry-After`.
* **No fallback when Elasticsearch is down.** A question should still get a SQL only answer with a warning, rather than an error.

## Search quality

* **Semantic recall is limited by the text.** Listings have no descriptions, so vague questions match poorly. Descriptive phrases derived from the rows, and a separate field for embedding text, would be the next things to measure.
* **Postcode coordinates.** There are no coordinates, so "near the university" cannot be answered. Postcode centroids would unlock distance questions.
* **Seller detail under an unknown answer is thrown away.** The document writes a seller's detail sentence only when the answer beside it is yes or no. A rule that writes the detail under its label without claiming an answer would recover those facts.
* **An ordered SQL with no rows hides what the searches found.** When the SQL orders its rows, retrieval keeps that order and drops the search lists. If that SQL comes back empty because it read the question too narrowly, the turn is answered as no match even when the searches found listings.
* **Possible matches.** Some properties probably match but their record cannot prove it. They could sit under the main results with a badge naming the unconfirmed detail.

## Answers

* **Check aggregate numbers against the query result.** The citation guard proves `[SQL]` points at a real aggregate result, but not that "an average of £187,400" matches a value in it.
* **Conversation memory.** Every question is answered as a fresh conversation today. The design is in ADR 008.
* **Tracing.** Requests are logged with stages and a request id, but there is no trace viewer such as Langfuse yet.

## Ingestion

* **A spent embedding quota dead letters the rest of a run.** On a hosted provider, a refusal that outlasts the batch deadline should stop the run with its checkpoint kept, rather than dead lettering every later page.
* **Safe reindexing.** A versioned index with an alias swap, and a step that removes documents for deleted rows.

## Tests

* **End to end browser test.** A Playwright happy path in CI.
* **API e2e and evals in CI.** The API e2e suite needs the Docker stack, and evals spend model quota, so neither runs on a pull request today.
