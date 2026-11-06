# Architecture

## Request flow

```
┌────────────┐      ┌─────────────────────────────────────────────┐
│ Angular 21 │ SSE  │              NestJS API                     │
│  Chat UI   │◄────►│                                             │
└────────────┘      │  /chat ──► Query Router (LLM classifies)    │
                    │             │                               │
                    │      ┌──────┴──────┐                        │
                    │      ▼             ▼                        │
                    │  Text-to-SQL    Semantic Search             │
                    │  (guarded)      (kNN embeddings)            │
                    │      │             │                        │
                    │      ▼             ▼                        │
                    │   MySQL ◄──sync──► Elasticsearch            │
                    │  (source of       (vector + BM25 index)     │
                    │   truth)                                    │
                    │      └──────┬──────┘                        │
                    │             ▼                               │
                    │      Result Merger (RRF)                    │
                    │             ▼                               │
                    │      Answer Generator (LLM, cited)          │
                    │             ▼                               │
                    │      Redis (cache, rate limit)              │
                    └─────────────────────────────────────────────┘
```


```
Angular chat UI
   |  SSE
   v
POST /chat
   |
   v
Query router (small, cheap model, strict JSON)
   |  intent: structured | semantic | hybrid | out_of_scope
   v
+-------------------+      +----------------------+
| Text to SQL       |      | Semantic search      |
| (validated)       |      | (kNN on embeddings)  |
+---------+---------+      +-----------+----------+
          |                            |
        MySQL  <----- sync ----->  Elasticsearch
          |                            |
          +-------------+--------------+
                        v
              Result merger (RRF, dedupe, top 8)
                        v
              Answer generator (stronger model, cited)
                        v
              Citation guard (strip unknown IDs)
                        v
              Stream tokens and citations back
```

Redis sits beside this for rate limits and ingestion checkpoints. Conversation memory and trace viewing are designed but not built; see `docs/backlog.md`.

## Module boundaries

* `chat` owns orchestration only. It calls other modules and streams events. No SQL or ES code here. Its `answer/` stage turns the retrieved properties (card facts plus what sellers said) or the one aggregate result into compact JSON and streams the answer model's cited text through `LlmService.stream`.
* `router` takes the question plus recent turns and returns a validated intent object, including the question rewritten to stand alone and the ids of any earlier listings a follow up refers to. On a timeout, a provider error, or a reply that cannot be read or does not fit the schema, it falls back to `hybrid` and the route event says why.
* `sql` builds the prompt, calls the LLM, validates the SQL and executes it. The validator is its own class with no LLM dependency so it can be tested in isolation.
* `retrieval` talks to Elasticsearch and owns the RRF merge. For a routed question it runs the branches the intent needs (SQL, kNN, BM25) side by side, each under `RETRIEVAL_BRANCH_TIMEOUT_MS`, fuses whatever came back, and reads the cards for the fused ids from MySQL. A branch that fails is recorded and the others still answer. An aggregate SQL result names no property, so it passes through unfused.
* `embeddings` hides the embedding provider behind one interface. Callers never import a provider SDK directly.
* `ingestion` turns MySQL rows into documents and upserts them into ES. It must be idempotent and resumable.
* `llm` hides the chat model provider. Every call records model, tokens, latency and cost. Prompts are loaded from versioned files.
* `platform/` holds request context, logging, tracing, rate limiting, caching and the exception filter. `infra/` holds config and the MySQL, Elasticsearch and Redis adapters. `core/` holds shared contracts only.

All features above live under `api/src/app/`. Detailed rules for each area are in `.claude/rules/backend/`.

## SSE event order

1. `route` with the detected intent, filters and standalone question
2. `retrieval` status updates, result counts and the retrieved properties or aggregate result
3. `token` events for the answer text, plain text with `[P-1234]` or `[SQL]` markers, already through the citation guard
4. `citations`: `{ kind: 'properties', ids }` in order of first citation, or `{ kind: 'aggregate', sql, listingCount }`
5. `done`, or `error` with a user safe message

## Conversation memory

Redis keeps the last three turns per session for 30 minutes after the most recent one: each turn's question, standalone rewrite, intent, filters and cited ids, never the answer text. The router reads them to rewrite a follow up and to resolve "the second one" to an id, which retrieval then reads fresh from MySQL. An answer only ever cites what its own turn retrieved.

## Degraded modes

* Elasticsearch down: answer from SQL only and tell the user results may be incomplete.
* LLM provider failing: circuit breaker opens, return a clean error instead of hanging.
* Router output invalid: treat as `hybrid`.

## Design decisions

Recorded as ADRs in `docs/adr/`.

| ADR | Decision |
|-----|----------|
| 001 | Hybrid retrieval, not vector only, because questions mix hard filters with fuzzy intent |
| 002 | Elasticsearch as the vector store, since it does BM25 and kNN together |
| 003 | MySQL stays the source of truth and ES is a rebuildable index |
| 004 | No LangChain in core paths, direct SDK calls only |
| 005 | Answers must cite property IDs, and uncited claims are rejected |
| 006 | Generated SQL passes a parser based validator before it runs, on top of the read only grant |
| 007 | The model vendor is an adapter chosen by config |
| 008 | Answers stream as cited plain text, aggregates cite their query as `[SQL]`, and memory keeps three turns for 30 minutes |
