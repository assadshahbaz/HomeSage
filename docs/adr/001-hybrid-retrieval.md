# ADR 001: Retrieve with SQL and vector search together, not vector search alone

Status: Accepted
Date: 22 September 2026

## Context

The questions this app has to answer do not come in one shape. Three real examples from the golden set:

* "3 bed under 250k in AB15 with a garden" is entirely hard constraints. Every term maps to a column: `bedrooms`, `price`, `postcode_district`, `has_garden`.
* "somewhere quiet with a bit of character, not a new build" has one column in it and the rest is intent. There is no `is_quiet` and there never will be.
* "cheapest 2 bed flats in Aberdeen with parking" needs ordering and a limit over the whole table, not a neighbourhood of similar rows.

An embedding is a similarity function. It has no notion of "less than", so a paragraph containing "Asking price 229,000" sits close to both "under 250k" and "under 200k", and prices in this data span several hundred thousand pounds. Asking a vector index for properties under a threshold returns rows that read like the question rather than rows that satisfy it, and the model then writes a confident wrong answer over them. Counting, averaging and ranking across every row are not retrieval problems at all.

SQL has the opposite gap. The source listings carry no description text (see `docs/data.md`), so the only prose in the database is the seller questionnaire answers on about two thirds of the rows: free text about heating, alterations, parking arrangements and disputes. None of it is queryable by column, and a user's words rarely match a column name.

So neither path covers the question set on its own, and the two failures are different: the vector path returns plausible rows that are wrong on the numbers, the SQL path returns nothing when the question has no columns in it.

## Decision

The API runs both retrieval paths and merges their results.

A router classifies each question as `structured`, `semantic`, `hybrid` or `out_of_scope` before retrieval, using a small model with a strict JSON contract. `structured` runs text to SQL only, `semantic` runs kNN only, `hybrid` runs both in parallel. On any parse failure the router falls back to `hybrid`, because running both is the answer that is never badly wrong.

Both paths return property ids. Results merge with Reciprocal Rank Fusion, dedupe by property id, and the top 8 documents go to the answer model. RRF is a pure function with its own unit tests: it combines ranks, not scores, which is what makes fusing a BM25 score with a cosine similarity defensible at all.

Hard facts that users filter on are also written into the Elasticsearch document as metadata fields, so the semantic path can pre filter on price and bedrooms rather than hoping the vector understood a number.

## Alternatives considered

### Vector search only, with metadata pre filters

The usual RAG shape, and the one the vector database documentation pushes. The filters still have to come from somewhere: a model has to read "under 250k in AB15" and emit a filter object. That is text to SQL with a different output format and without the parts that make it safe, a validator and an allow list. It also cannot answer "how many" or "the cheapest", because a kNN query returns a neighbourhood, not an aggregate over the table.

### SQL only

Cheaper, simpler, fully verifiable, and it fails the moment a question contains a word that is not a column. It also leaves the questionnaire prose unreachable, which is the only real text in the dataset and the thing that makes a listing sound like a home rather than a row.

### Vector search only, no filters

Rejected on the numbers above. This is the version that looks like it works in a demo and produces wrong prices in front of a user.

## Consequences

* Two retrieval paths exist, both tested, both kept working. The SQL path needs a validator, an allow list and an injection suite. The vector path needs an embedding pipeline and an index that can be rebuilt (ADR 002, ADR 003).
* There is a router, so there is a routing mistake. A question sent to `structured` when it needed prose returns thin results. The cost of a wrong route is bounded by falling back to `hybrid`, and the router output is parsed with a schema rather than trusted.
* Three model calls sit on the hybrid path: route, generate, and the text to SQL call. That is the latency and the cost. The budget is p50 under 4 seconds end to end with the first token under 1.5 seconds, which is why the two retrieval calls run in parallel rather than one after the other.
* The two paths can return overlapping or contradictory sets. Merging is therefore a named component with its own tests, not a few lines inside the chat service.
* Elasticsearch being down degrades to a SQL only answer with a warning on the response, instead of a 500. This fallback only exists because the SQL path is a complete path in its own right.

## Revisit when

The question mix stops being mixed. If the eval set shows the router sending almost everything one way, the other path is carrying its cost without earning it and should be cut rather than maintained out of symmetry.
