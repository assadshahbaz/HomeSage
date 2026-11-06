# ADR 008: Answers stream as cited plain text, aggregates cite their query, and memory keeps three turns

Status: Accepted
Date: 29 September 2026

Supersedes the structured output part of ADR 005. The rest of ADR 005 stands.

## Context

ADR 005 has the answer model return `{ answer, citedIds, confidence }`, so the prose and its citation list come from one parsed object. Three things planned for M3 do not fit that.

**Streaming.** The M3 definition of done asks for the first streamed token within 1.5 seconds and a p50 round trip under 4 seconds, over SSE. A JSON object cannot be shown to the reader until it has been parsed, and the `answer` field inside it cannot be streamed reliably by parsing partial JSON: the field order, escaping and closing braces are the model's to get right, and a single slip turns the whole reply into a parse failure. The model interface, `LlmProvider` in `api/src/core/`, also only has `complete()`, which returns the full text at once.

**Aggregates.** Since M1.1, `POST /sql` returns two kinds of result. `rows` lists properties. `aggregate` holds values computed over listings, such as a count, an average or one value per town, together with the SQL that produced them and `listingCount`, the number of listings behind them. "There are 53 listings in Stonehaven" is true and grounded, but no single property id supports it, and citing all 53 is useless to a reader.

**Follow ups.** M3 keeps recent turns in Redis so that "what about 2 beds instead?" works. Nothing yet says how many turns are kept, for how long, whether the follow up is rewritten before retrieval, or which ids an answer to a follow up may cite. The citation guard needs that last answer, because its whole job is to compare cited ids against a known set.

`confidence` also needs a decision. Nothing in the UI, the evals or the router reads it, and a model's own estimate of its confidence is not calibrated against anything.

## Decision

The answer model writes plain text with inline citation markers, and the API streams it through the citation guard as it arrives. Citations are derived from the guarded text, never supplied by the model. A turn cites either properties or one aggregate query. Memory keeps the last three turns of each session for 30 minutes, and an answer may only cite what its own turn retrieved.

### The answer

* The model writes prose. Every fact carries a marker: `[P-3501]` for a property, `[SQL]` for an aggregate result.
* `LlmProvider` gains a streaming call beside `complete()`, and each adapter implements it for its vendor. `LlmService` streams, logs the same model, tokens, latency and cost as before once the stream ends, and keeps the timeout.
* Tokens pass through the streaming citation guard before they reach the client. It holds back text that could be the start of a marker until the marker is complete, lets through markers that were retrieved in this turn, and strips any other marker, logging a hallucination event with the request id.
* `citedIds` is not in the model's output. The API derives it from the guarded text: each surviving `[P-...]` marker once, in order of first appearance.
* `confidence` is dropped from the answer and the contract.

### Aggregate answers

* When retrieval produces an aggregate result, the answer cites it as `[SQL]`. There is one marker because a turn runs at most one aggregate query.
* In an aggregate turn, `[SQL]` is the only valid marker, and any `[P-...]` is stripped, since no property was retrieved. In a property turn, `[SQL]` is stripped.
* A turn is one or the other. Aggregate results skip fusion with semantic search, so they never mix with property results.
* The `citations` event is a union: `{ kind: 'properties', ids }` or `{ kind: 'aggregate', sql, listingCount }`. The UI links `[P-...]` markers to property cards and renders `[SQL]` as a chip that opens the under the hood view on the query and its listing count.
* The prompt tells the model to quote aggregate values exactly as given, without rounding or recomputing them.

### Conversation memory

* Redis holds the last `CHAT_MEMORY_TURNS` turns (3) per session id, with a sliding TTL of `CHAT_MEMORY_TTL_SECONDS` (1,800 seconds), refreshed on every turn. Both are config, not literals.
* A turn in memory is the question as asked, its standalone rewrite, the router's intent and filters, and the ids it cited, in order. The answer text is not stored.
* The router, which already reads the recent turns, also returns `standaloneQuestion`, the follow up rewritten to stand on its own. "3 bed flats in AB15 under £250k" followed by "what about 2 beds?" gives "2 bed flats in AB15 under £250k". Retrieval, the trace, the response cache key and the evals all use the standalone question. For a first question the two are the same.
* When a follow up refers to listings from an earlier turn ("tell me more about the second one"), the router returns their ids as `propertyIds`, resolved from the ordered cited ids in memory. Retrieval reads those rows fresh from MySQL, so they are retrieved in this turn.
* An answer may cite only ids retrieved in its own turn. The guard's set is always exactly this turn's retrieval.
* Memory is the only place the API keeps what a user wrote beyond a single request, and it is kept for at most 30 minutes after the last turn. What logs and traces keep, and for how long, is settled with the public deploy in M3.2.

## Alternatives considered

### Keep the structured object and stream its `answer` field

Parse the model's JSON incrementally and forward the characters of `answer` as they arrive. It keeps ADR 005's single source for prose and citations. It lost because it makes streaming depend on the model writing well formed JSON in a fixed field order, one stray quote fails the whole reply rather than one citation, and each vendor's JSON mode behaves differently, which ADR 007 set out to keep out of the features.

### Stream plain text, then ask a second call for the cited ids

Clean prose for the reader, and an explicit citation list from the model. It adds a model call to every answer, its latency sits between the last token and the `citations` event, and the list could disagree with the text it describes. Deriving the ids from the guarded text makes the text the single source, which is what the UI links anyway.

### Derive a confidence score instead of dropping it

For example from retrieval scores or the share of sentences carrying a citation. A similarity score measures closeness to the question, not correctness, and a citation share rewards citing, not being right. A number labelled confidence that means neither would mislead the one reader who looks at it. The eval harness measures quality where it can be checked.

### Cite every listing behind an aggregate

Grounded in the strict ADR 005 sense, since every id is real. A count over a town can cover hundreds of listings, the stream would carry all of them, and a reader cannot check a claim by opening 53 cards. The query and its listing count are the honest source of a computed number, and the under the hood view shows both.

### Keep the full transcript

Answer text included, so the router sees exactly what the user saw. The prompt grows with every turn, the router is the cheapest and fastest call and the one on the path to the first token, and the store holds more of what users wrote than any feature needs. The ordered cited ids already resolve "the second one".

### Rewrite follow ups with a separate model call

A dedicated rewrite prompt would be simpler to test on its own. It puts a second sequential model call before retrieval can start, against a first token budget of 1.5 seconds, when the router already reads the same turns and returns strict JSON.

### Let every id cited in the session stay citable

Simpler for the router, which would not need `propertyIds`. The guard would then accept ids whose rows are not in this turn's context, so the model could cite a listing it cannot see, from memory of an earlier answer. Fetching the rows again keeps every citation backed by data in front of the model.

## Consequences

* `LlmProvider` has a second method, and every adapter must implement streaming, including its timeout and token counting when the stream ends early.
* The citation guard is stateful across chunks instead of a pure function over a finished string. It gets its own tests for markers split across chunks and for text that only looks like a marker.
* The client gets tokens after the guard has seen them, so an invented id never reaches the screen. The price is a short hold on any text that could be the start of a marker.
* The guard proves `[SQL]` points at a real aggregate result, not that the number in the sentence matches it. The prompt and the eval harness carry that check; a numeric cross check against the result values is a backlog item.
* `citations` is a union, so the web app and the eval runner both handle two shapes.
* The router's JSON gains `standaloneQuestion` and `propertyIds`, and its contract tests cover a missing or empty rewrite, falling back to the question as asked.
* Retrieval gains a path that reads named ids from MySQL, which also serves the fast path in M3.1 if it is built.
* A follow up that refers to a listing the router cannot resolve gets no citation for it rather than a stale one.
* Follow ups become part of the golden set as short conversations, and aggregate questions are scored on `[SQL]` citations.

## Revisit when

* A dataset with listing descriptions arrives, so answers quote text a reader can check, and the guard may need to cite passages rather than rows.
* Follow ups regularly need more than three turns of context, or users return to a conversation after more than 30 minutes and expect it to continue.
* A turn needs to combine an aggregate with listings, such as "how many are there, and show me the cheapest three".
