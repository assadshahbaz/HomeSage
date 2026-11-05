# HomeSage

[![CI](https://github.com/assadshahbaz/HomeSage/actions/workflows/ci.yml/badge.svg)](https://github.com/assadshahbaz/HomeSage/actions/workflows/ci.yml)

Ask about homes for sale in plain English, in a chat window or over the phone, and get an answer grounded in the listings, with every fact traceable to the property it came from.

* **Chat app** (`api/` and `web/`): a router decides whether a question needs SQL filters, semantic search or both. The API pulls rows from MySQL and documents from Elasticsearch, and a model writes the answer from those and nothing else, citing each fact as `[P-1234]`. Answers stream into an Angular UI with a card for each cited property.
* **Voice agent** (`voice/`): a phone agent for an estate agency, built on [Vapi](https://vapi.ai). Callers ask about homes and the agent answers through the chat API, then books viewings, logs valuation requests and takes messages.

> **All the data here is made up.** `npm run db:seed` generates about 800 listings with invented streets and postcodes that cannot exist. Only the towns and postcode districts are real. See [docs/data.md](docs/data.md).

## Architecture

```
  Angular chat UI                       Caller on the phone
        |  SSE                                  |
        |                                 Vapi (speech, voice)
        |                                       |  tool calls
        |                                 voice agent  ---- SQLite: viewings,
        |                                       |           leads, call log
        v                                       v
                        POST /chat
                            |
                       Query router          small model, strict JSON
            structured | semantic | hybrid | out of scope
                            |
              +-------------+-------------+
              v                           v
        Text to SQL                 Semantic search       run in parallel
        validated, read only        kNN and BM25
              |                           |
            MySQL -------ingest------> Elasticsearch
              |                           |
              +-------------+-------------+
                            v
                      Result merger         RRF, dedupe, top 8
                            v
                    Answer generator        stronger model, cited
                            v
                     Citation guard         drops ids it did not retrieve
                            v
          route -> retrieval -> token -> citations -> done
```

Redis holds the rate limit counters and ingestion checkpoints. Every request carries an id through structured logs.

The three apps are independent, each with its own `package.json`. `api` is NestJS and owns every request and response shape in `api/src/contracts/`. `web` is Angular and imports those contracts through an alias, which is the only part of the API it can reach. `voice` is NestJS and talks to the API over HTTP.

### How answers stay honest

* **The model never answers from memory.** It only sees rows retrieved for this question, and the citation guard strips any property id that was not retrieved.
* **Generated SQL is never trusted.** It passes a parser based validator, and the API's MySQL account can only `SELECT`, so MySQL itself refuses a write.
* **A missing fact is not a no.** A false flag means the listing did not say, and an unanswered question stays unknown, so the app never claims a home lacks something.

### Design decisions

| ADR | Decision |
|-----|----------|
| [001](docs/adr/001-hybrid-retrieval.md) | Retrieve with SQL and vector search together, not vector search alone |
| [002](docs/adr/002-elasticsearch-as-the-vector-store.md) | Elasticsearch holds the vectors and the keyword index |
| [003](docs/adr/003-mysql-is-the-source-of-truth.md) | MySQL is the source of truth and the Elasticsearch index is rebuildable |
| [004](docs/adr/004-no-framework-in-core-paths.md) | Call provider SDKs directly, no LangChain in the core paths |
| [005](docs/adr/005-cited-answers-only.md) | Every answer cites property ids, and uncited ids are stripped |
| [006](docs/adr/006-validate-generated-sql.md) | Generated SQL passes a parser based validator, on top of the read only grant |
| [007](docs/adr/007-provider-agnostic-llm-layer.md) | The model vendor is an adapter chosen by config |
| [008](docs/adr/008-streamed-answers-query-citations-and-memory.md) | Answers stream as cited text, and aggregates cite their query |

## Run it

You need Node 24 (see `.nvmrc`), npm, Docker with Compose, and a free API key from [Groq](https://console.groq.com).

```
cp .env.example .env               # fill in the three blanks, see below
docker compose up -d --wait        # MySQL, Elasticsearch, Redis and Ollama

cd api
npm install
npm run db:seed                    # generate the made up listings
npm run ingest -- --full           # build the search index
npm run start:dev                  # API on http://localhost:3000
```

In a second terminal:

```
cd web
npm install                        # install api first, the web app compiles its contracts
npm start                          # http://localhost:4200
```

Things to ask:

* "Three bedroom homes in AB15 with a garden under £300,000"
* "How many listings are there in Stonehaven?"
* "The five cheapest three bedroom homes in Ellon"
* "A home that runs on renewable energy"
* "Which homes in Aberdeen have an EPC rating of B or better?" The data has no ratings, so it says so.

To try the phone agent, follow [voice/README.md](voice/README.md).

### The three blanks

| Variable | What to put there |
|----------|-------------------|
| `MYSQL_ROOT_PASSWORD` | Any password you choose. The container and the seed use it |
| `MYSQL_RO_PASSWORD` | Any password you choose. The API connects with this one |
| `LLM_API_KEY` | Your Groq key. Any placeholder gets you to a green health check, but not to an answer |

The API validates its whole environment at boot and refuses to start with anything missing or malformed, naming the variable at fault.

Choose the MySQL passwords before the first `docker compose up`. They are fixed when the data volume is first created, so changing one later means `docker compose down --volumes` and seeding again.

The first `docker compose up` takes a few minutes longer, because Ollama downloads the embedding model. Embeddings run on your machine with no key. Ports bind to localhost only, and this stack is not fit for a shared or public host.

## Evals

Passing tests show the code agrees with itself. The evals show whether answers are right. They run real questions through the real models and services, and write a report to [workbench/evals/reports](workbench/evals/reports).

Results will be added here once the final eval run is complete.

```
cd api
npm run evals                      # spends model quota, needs the Docker stack
```

How the golden set is built and scored is in [workbench/evals/README.md](workbench/evals/README.md).

## Checks

```
cd api                             # or web, or voice
npm run lint
npm run format:check
npm run typecheck
npm test
```

CI runs these for all three apps on every pull request, plus the voice agent's end to end tests, a production build of the web app, and a check that no real looking postcode or phone number has entered the repo.

`cd api && npm run test:e2e` runs the API's end to end tests, which need the Docker stack and the seeded data. They do not run in CI yet.

## Status

This is a portfolio project that runs locally. It is not deployed, and these are not built yet: conversation memory, trace viewing, a browser end to end test, and a fallback for when Elasticsearch is down. The gaps are listed in [docs/backlog.md](docs/backlog.md).

## More

* [docs/data.md](docs/data.md): where the made up listings come from
* [docs/schema.md](docs/schema.md): every column and what the data can and cannot say
* [docs/property-document.md](docs/property-document.md): how a row becomes search text
* [docs/chat-stream.md](docs/chat-stream.md): the `POST /chat` event stream
* [docs/ui-components.md](docs/ui-components.md): the shared UI components

## Licence

[MIT](LICENSE)
