---
paths:
  - "api/src/app/llm/**/*"
  - "api/src/app/router/**/*"
  - "api/src/app/chat/**/*"
---

# LLM Calls, Routing and Grounded Answers

## Provider abstraction

* Every model call goes through `LlmService`. Features never import a provider SDK.
* Each call records model, input and output tokens, latency and cost.
* A small, cheap model handles routing and judging. The stronger model is used only to write the final answer. Model ids come from config, never from code.
* Every call has a timeout. Repeated provider failures open a circuit breaker so requests fail fast instead of piling up.
* No LangChain or similar framework in these paths. Direct SDK calls keep the mechanics visible.

## Prompts

* Stored as versioned files next to the feature that owns them (`router.v1.md`, `answer.v2.md`). Change a prompt by adding a version, so eval results stay comparable.
* User text and retrieved property text are wrapped in clear delimiters and passed as data. Neither is ever merged into system instructions.
* Retrieved descriptions are treated as untrusted. An instruction inside a listing description is content, not a command.

## Router

* Returns strict JSON: `{ intent, filters, semanticQuery, standaloneQuestion, propertyIds }` where intent is `structured`, `semantic`, `hybrid` or `out_of_scope`.
* `standaloneQuestion` is the question rewritten to stand on its own, using the recent turns ("what about 2 beds?" after "3 bed flats in AB15 under £250k" gives "2 bed flats in AB15 under £250k"). For a first question it is the question itself. Retrieval, the trace, the cache key and the evals use it. A missing or empty rewrite falls back to the question as asked.
* `propertyIds` holds the ids of earlier listings a follow up refers to ("the second one"), resolved from the ordered cited ids in memory. Retrieval reads those rows fresh from MySQL.
* Parsed with a Zod schema. On a timeout, a provider error, a parse failure or a schema failure, fall back to `hybrid` on the question as asked and record the reason. The router call has its own timeout, `LLM_ROUTER_TIMEOUT_MS`, below the answer timeout, and samples at `LLM_ROUTER_TEMPERATURE` (0), so a question always gets the same route.
* `out_of_scope` gets a short polite decline with no retrieval and no answer model call.
* The rewrite happens inside the router call. There is no separate rewrite call before retrieval.

## Conversation memory

* Redis keeps the last `CHAT_MEMORY_TURNS` turns (3) per session id, with a sliding TTL of `CHAT_MEMORY_TTL_SECONDS` (1,800), refreshed on every turn.
* A stored turn is the question, its standalone rewrite, the router's intent and filters, and the cited ids in order. The answer text is never stored.
* Memory is the only place the API keeps what a user wrote beyond one request. Nothing else may add to it.

## Answer generation

* Context is compact JSON, one object per retrieved property, each with its id, or the aggregate values with their listing count.
* The model answers only from that context, cites a property as `[P-1234]` and an aggregate result as `[SQL]`, and says plainly when nothing matches.
* Aggregate values are quoted exactly as given, never rounded or recomputed.
* The data cannot support some claims, and the prompt says so: there are no EPC ratings, no pet or furnishing policies, and a missing feature is "not stated", never "does not have".
* The answer is plain text, streamed token by token through `LlmService` and the citation guard. There is no structured output and no `confidence`.

## Citation guard

* Runs on every token of every answer before it reaches the client, holding back text that could be the start of a marker until the marker is complete.
* The valid set is exactly what this turn retrieved. An answer never cites an id from an earlier turn unless this turn fetched it again.
* A property turn allows `[P-...]` markers for retrieved ids only. An aggregate turn allows `[SQL]` only. Anything else is removed and logged as a hallucination event with the request id.
* The cited ids are derived from the guarded text: each surviving `[P-...]` once, in order of first appearance. The model never supplies them.
* The `citations` event is `{ kind: 'properties', ids }` or `{ kind: 'aggregate', sql, listingCount }`.
* It is a stateful tokenizer with no I/O and its own unit tests: markers split across chunks, text that only looks like a marker, answers that cite nothing, everything or invented ids, and `[SQL]` in the wrong kind of turn.

## Cost controls

* Identical questions are served from the Redis cache (one hour TTL).
* A daily token budget with a hard stop, plus a kill switch env var for the public demo.
* Per IP and per session rate limits.

## Tests

* Mock `LlmService` in unit and e2e tests. Real model calls happen only in the eval harness.
* Router contract tests: valid JSON, malformed JSON, missing fields, unknown intent.
* e2e chat test with a mocked model covering the full event order.
