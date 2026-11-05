---
paths:
  - "api/src/**/*.ts"
  - "api/test/**/*.ts"
  - "api/tools/**/*.ts"
---

# Backend Conventions

NestJS 12 on Node 24 (`api`), compiled as native ES modules. Entry point `src/main.ts`, root module `src/app.module.ts`.

Relative imports end in `.js` (`import { AppModule } from './app.module.js'`), because the API runs as ESM under `nodenext` resolution. Package imports do not.

## Structure

A feature is a folder, not a row across five layer folders. Everything the SQL feature needs sits in `src/app/sql/`: module, controller, service, validator, prompts and specs. The layer a file belongs to shows in its name (`sql.controller.ts`, `sql-validator.ts`), not its path.

Once a feature folder grows past a handful of files, group it by pipeline stage in subfolders, never by layer. `app/sql/` has `generation/`, `validation/` and `execution/`; `app/ingestion/` has `document/` and `search-index/`; `app/llm/` has `providers/` and `prompts/`. Entry points (the module, controller and top level service) stay at the feature root, and a spec moves with the file it tests. There is no `services/`, `types/`, `dto/` or other layer folder.

Every top level folder under `src/` is one of five kinds:

* `contracts/` holds the Zod schemas and inferred types for every request, response and streamed event. It is the source of truth for the wire format and the only folder the web app may import (through `@api/contracts`). Files here import only `zod` and each other.
* `app/` holds the features: `chat`, `router`, `sql`, `retrieval`, `embeddings`, `ingestion`, `llm`, `health`, `evals` support. A feature owns its own enums, constants, DI tokens and assets.
* `platform/` holds the machinery we wrote for the app to run on: `request-context`, `logging`, `tracing`, `throttler`, `filters`, `cache`. Cross cutting, with no knowledge of properties or retrieval.
* `infra/` holds adapters to things outside the process plus the boot configuration: `config`, `mysql`, `elasticsearch`, `redis`. Using a backing service does not make something infra. Rate limiting stores counters in Redis but is our policy, so it is `platform/throttler`.
* `core/` holds internal interfaces only, such as `HealthIndicator`, `LlmProvider`, `EmbeddingProvider`. No `@Module`, no lifecycle, and nothing here knows what implements it.

Dependencies point one way: `app` to `platform` to `infra` to `core`. Nothing imports upward; if something seems to need to, invert it instead of writing down an exception. Any layer may import `contracts`, and `contracts` imports nothing from the rest of the API. Peers inside `app/` may depend on each other where the flow says so (`chat` uses `router`, `sql` and `retrieval`).

An interface never names its implementors. `HealthIndicator` lives in `core/`, the MySQL, Elasticsearch and Redis indicators live in their `infra/` folders, and `app/health` composes them. Provider choice for the LLM and embeddings is made in one place (the owning module's factory, driven by config), so adding a provider means one new class and one config value.

## Conventions

* **DI**: constructor injection with `@Injectable()`, injected members marked `private readonly`.
* **Config**: read through `ConfigService`, never `process.env`, outside `src/infra/config/`. Each namespace is registered with `registerAs` and validated with Zod at boot. The app refuses to start with missing or invalid config.
* **DI tokens**: non class providers get a `Symbol` in a `*.symbol.ts` next to the module that provides it, injected with `@Inject(TOKEN)`.
* **Data access**: the API reads MySQL through the read only connection in `infra/mysql`. There is no write path to property tables. Raw generated SQL only runs through the SQL feature's executor, after validation.
* **Errors**: throw `HttpException` subclasses and let the global filter shape the response. See [error-handling.md](error-handling.md).
* **Request id**: read it through `RequestContextService`, never by threading a parameter. See [request-context.md](request-context.md).
* **Modules**: each feature owns its `*.module.ts`, wired into `AppModule`.
* **Parallel work**: independent calls (SQL retrieval and kNN retrieval) run with `Promise.all`, never one after the other.
* **Timeouts**: every outbound call (model provider, embeddings, Elasticsearch, MySQL) has an explicit timeout from config.

## Tools

`api/tools/` holds one off command line tools, such as the data import. They sit outside `src/`, so they are not part of the server build, and they run straight from TypeScript (`node tools/<name>/<entry>.ts`). Relative imports there end in `.ts`, not `.js`. A tool may read the environment directly; the rules for `src/` do not apply to it, apart from code style and tests.

## Health

Every infra adapter ships a health indicator wired into `/health`. A new adapter without one reads as an oversight in review.
