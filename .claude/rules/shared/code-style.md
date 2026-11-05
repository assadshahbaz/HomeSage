# Code Style

Applies to both apps in the repo: `api` and `web`. The ESLint and Prettier configs are the source of truth, and this file summarises the intent behind them.

## TypeScript

* `strict` everywhere. No `any`, explicit or inherited from an untyped generic. Find the real type first, and only fall back to `unknown` plus narrowing when the value genuinely comes from outside.
* Every function has an explicit return type (short inline arrow callbacks are exempt).
* Every class member has an explicit `public`, `protected` or `private` modifier.
* Use `import type { X }` for anything used only as a type. NestJS decorator metadata needs this to avoid runtime import errors.
* No magic numbers in production code. Limits that matter (the SQL `LIMIT` cap of 50, top k of 8, cache TTL, timeouts) live in named constants or config, never as bare literals. Tests are exempt.
* Use TypeScript enums or `as const` objects for fixed value sets, owned by the folder that uses them.

## Narrowing untrusted input

Anything from outside the process is untrusted: request bodies, env vars, Redis reads, Elasticsearch hits, MySQL rows from a generated query and, above all, LLM output.

* Parse it with a Zod schema at the boundary. After that point the value is typed and trusted.
* Prefer a schema to a cast. `JSON.parse(text) as RouterResult` asserts something nobody checked, and the failure shows up far away with a type that says it cannot happen.
* The backend is the source of truth. Schemas that describe the wire contract live in `api/src/contracts/`, and both sides derive their types from that one definition with `z.infer`.
* Add a schema when something parses that shape, not before.

## Structure

* There is no `utils/`, `helpers/` or `common/` folder anywhere. A folder named for what it is not collects unrelated code forever. A file that seems homeless lives with the concern it serves, even if it is the only file there.
* One concept per file. Keep files small and focused.
* Kebab case filenames. Avoid generic names like `helpers.ts` or `utils.ts`.

## Imports

* `api` never imports from `web`.
* `web` imports from `api` only through the `@api/contracts` alias, which points at `api/src/contracts/`. Nothing else in the API is reachable from the web app.
* `api/src/contracts/` is framework free. Files there import only `zod` and each other: no NestJS, no Angular, no Node built ins, nothing from the rest of the API. Both apps compile these files.
* A contract changes in the API first. The web app then follows the new type; it never defines its own copy of a request or response shape.
* No duplicate imports from the same module, no self imports, no anonymous default exports.

## Naming

* camelCase by default, PascalCase for types and classes, UPPER_CASE for enum members and module level constants.
* Classes are named for what they are: `SqlValidator`, `CitationGuard`, `PropertyDocumentBuilder`.
* Env vars are SCREAMING_SNAKE_CASE, grouped by prefix: `MYSQL_`, `ES_`, `REDIS_`, `LLM_`, `EMBED_`, `LANGFUSE_`.

## Comments

* Keep them short. One line is the default; a block only when one line cannot carry the point.
* Write a `/** ... */` doc comment for exported functions, classes and public methods. Say what it does and why if that is not obvious. Do not restate the signature.
* Use plain `//` for notes on a piece of implementation.
* A comment is earned by a non obvious reason: a hidden constraint, a workaround, an invariant you cannot see from the code. If deleting it would confuse nobody, do not write it.
* A comment describes the code it sits on. No pointers to markdown docs, milestones, ADR numbers or issue numbers. They go stale. Put the reasoning inline instead.
