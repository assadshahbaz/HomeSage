# ADR 007: The model vendor is an adapter chosen by config

Status: Accepted
Date: 24 September 2026

## Context

Every feature that matters in HomeSage calls a language model: SQL generation, routing, answers and the eval judge. Model vendors change prices, free tiers and model ids every few months, and the vendor has already been changed once before any feature used it. A choice that is spread through the code as model ids, price tables and SDK types turns each of those changes into a refactor.

HomeSage is also a portfolio project with no budget. It is evaluated by running golden sets many times and demoed publicly, so it has to run on a free tier today and be able to move to a paid or local model later without touching the features.

## Decision

The API knows no model vendor outside one adapter class per vendor. Which vendor serves calls, which model does each job and what each model costs all come from the environment.

* `LlmProvider` in `core/` is the whole contract: model, system instructions, user turn and token cap in; text, token counts and a stop reason out. No vendor type appears in it.
* An adapter implements it for one vendor and is the only file that imports that vendor's SDK. It builds its own client from the `llm` config through a static `fromConfig`, maps the vendor's request and response onto the contract, counts every billed token, and turns its own timeout into a `GatewayTimeoutException`. Vendor error types never leave it.
* `llm-provider-registry.ts` maps each `LLM_PROVIDER` name to an adapter's `fromConfig`. An unknown name stops the API at boot, listing the names that exist. The registry is the only place outside the adapters that knows vendors exist.
* `LlmService` maps a job (router or answer) to that job's model and price from config, wraps user and retrieved text in delimited blocks, and logs model, tokens, latency and cost for every call.
* Config has no defaults for vendor, models or prices. `LLM_PROVIDER`, `LLM_ROUTER_MODEL`, `LLM_ANSWER_MODEL` and the four `*_USD_PER_MILLION` prices are required, so the code names no vendor and never guesses a cost. `LLM_TIMEOUT_MS` and `LLM_MAX_ATTEMPTS` are vendor neutral and keep defaults. The router call has its own shorter `LLM_ROUTER_TIMEOUT_MS`, checked at boot to be below `LLM_TIMEOUT_MS`, since a slow router holds up the whole stream.

Changing the model within a vendor is an `.env` change. Adding a vendor is:

1. An adapter class implementing `LlmProvider`, with a `fromConfig` and its own spec.
2. One entry in the registry.
3. The provider name, model ids, prices and key in `.env`.

Nothing in `LlmService`, the features, the prompts or their tests changes.

The first configuration was Gemini for chat and embeddings. Its free tier turned out to allow 20 requests a day on the answer model, fewer than one run of the 20 question eval, so chat moved to Groq, whose free tier allows 1,000 requests and 200,000 tokens a day per model: `openai/gpt-oss-20b` routes and `openai/gpt-oss-120b` answers. The move was one adapter, one registry entry and new `.env` values, which is the design above working as intended. Groq has no embedding model, so embeddings keep their own configuration, `gemini-embedding-2` at 1,536 dimensions, planned for M2. Chat and embeddings are configured separately (`LLM_*` and `EMBED_*`), so they can come from different vendors.

### Embeddings

Embeddings follow the same shape as a contract of their own, since a vendor that serves one may not serve the other (Groq has no embedding model).

* `EmbeddingProvider` in `core/` has separate methods for documents and for queries, so a vendor that embeds the two sides of retrieval differently can do both, and a `retryAfterMs` method, so each adapter decides which of its vendor's errors are worth another try and passes on any wait the vendor names.
* Adapters live in `app/embeddings/providers/`, and `embedding-provider-registry.ts` maps each `EMBED_PROVIDER` name to one. `EMBED_PROVIDER`, `EMBED_MODEL`, `EMBED_DIMENSIONS` and `EMBED_INPUT_USD_PER_MILLION` have no defaults. What reaching the model takes is the adapter's to check at boot, not the env schema's: a hosted adapter refuses to start without `EMBED_API_KEY`, and a local one without `EMBED_BASE_URL`.
* A model may expect a marker before each text, one for stored documents and another for queries. `EMBED_DOCUMENT_PREFIX` and `EMBED_QUERY_PREFIX` hold them as config, so the marker belongs to the model's settings rather than to any adapter's code.
* `EmbeddingService` owns batching, retries and the deadline: batches of `EMBED_BATCH_SIZE`, up to `EMBED_MAX_ATTEMPTS` tries with exponential backoff or the vendor's named wait, whichever is longer, all inside `EMBED_TIMEOUT_MS`. With `EMBED_TEXTS_PER_MINUTE` set, it holds each batch back until it fits that limit, for a vendor that counts every text in a batch as one request. That wait comes before the batch's deadline starts. Adapters turn their SDK's own retries off, so one policy with one deadline applies. It checks every vector's count and size before anything can reach the index, and logs tokens and cost per batch.

This differs from chat on purpose. A chat call is one request, so the adapter lets its SDK retry inside the timeout. An embedding run is thousands of texts, so the retry policy has to be one the ingestion run can see, count and bound.

Gemini's embedding response carries no token count on an API key, so its adapter counts the same contents alongside each call. Counting is free and runs in parallel. It also sends each text as its own `Content`: an array of plain strings is read as the parts of one content and returns a single vector for all of them.

The local adapter talks to an Ollama server over its HTTP API with `fetch`, so it adds no dependency. Its response carries the token count, so it needs no second call. It asks the server not to truncate, so a text longer than the model's context fails loudly rather than being embedded cut short. The prototype defaults to it, since it has no quota and no cost; the hosted adapter stays registered, and switching back is config plus an index rebuild.

## Alternatives considered

### Hardcode one vendor

Call one SDK from the features and keep its model ids and prices in code. It is the least code today and the most work at every change after it, which is exactly the pressure described above. It also ties the tests of every feature to one vendor's response shape.

### A price table in code keyed by model id

Cost stays computed rather than guessed, but every new model, and every price change, becomes a code change and a release. Prices are deployment facts, like the models themselves, so they live next to the model ids in config.

### A multi vendor library such as LangChain or the Vercel AI SDK

These give one call shape over many vendors for free. They are ruled out by ADR 004 for core paths, and the reason holds here: the abstraction this app needs is small enough to own, and owning it keeps token counting, timeouts and error mapping visible and tested.

### A local model as the first configuration

Free without rate limits and private by construction. It lost as the first choice because the deploy target in M7 is a small instance with no GPU, and a model that fits there is far weaker at SQL than a hosted one. It stays a good later adapter for offline development.

## Consequences

* A misconfigured deploy fails at boot, not on the first request: a missing model, a missing price or an unregistered provider name each stop the process with the variable named.
* Logged cost is only as right as the prices in `.env`. When a vendor changes its price, the config has to change with it, and eval reports from before and after are not comparable without a note. On a free tier the logged cost is what the traffic would cost once paid for.
* Free tiers rate limit and overload. Adapters retry rate limits and server errors up to `LLM_MAX_ATTEMPTS` inside one timeout, and the eval runner still has to pace its calls.
* Free tier terms differ by vendor, and some allow prompts and responses to be used to improve the vendor's products. Nothing sensitive may go into a prompt, which the import already guarantees for the property data.
* Embeddings at 1,536 dimensions make the vector index about half again as large as the 1,024 dimension estimate in ADR 002. At this data size that is still a few tens of megabytes, so ADR 002's reasoning holds.
* The contract has no structured output or streaming yet. The router and the streamed answer in M3 will add them to `LlmProvider`, and every adapter then has to implement them. That is the one place where a vendor switch will cost more than one class.

## Revisit when

A feature needs something one vendor offers and the contract cannot express, or a second adapter shows the contract leaking one vendor's assumptions.
