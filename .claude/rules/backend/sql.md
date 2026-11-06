---
paths:
  - "api/src/app/sql/**/*"
  - "api/src/app/router/**/*"
  - "api/src/infra/mysql/**/*"
---

# Text to SQL

The model writes SQL. The validator decides whether it runs. This split is the security boundary of the whole app, so treat it as one.

## Validator

`SqlValidator` has no dependency on the LLM, the database or Nest, so every rule can be unit tested on its own. Every generated query passes all of these before it reaches MySQL:

1. Parses with `node-sql-parser` using the MySQL dialect. If it does not parse, reject it.
2. Exactly one statement, and it is a `SELECT`.
3. Every table and column is on the allow list. Unknown columns are rejected, since the model will invent them.
4. Subqueries, joins and CTEs are walked too. A forbidden table inside a subquery is still forbidden.
5. A `LIMIT` is always present and never above the configured cap (50). Add it when missing, lower it when too high.
6. No functions or clauses that read files, sleep or touch server state (`LOAD_FILE`, `SLEEP`, `BENCHMARK`, `INTO OUTFILE`, variable assignment).

The allow list is derived from `docs/schema.md` in one place and shared by the validator and the prompt builder, so they cannot disagree.

## Execution

* Runs only on the read only connection (`rag_ro`, `SELECT` grant only).
* Every query has `MAX_EXECUTION_TIME` set.
* Parameters from the router's structured filters are bound, never string concatenated.
* On an execution error, send the error back to the model once for a corrected query. A second failure throws.

## Prompts

* Prompt files live in `src/app/sql/generation/prompts/` with a version in the name (`sql.v1.md`). A change is a new version file so eval reports stay comparable.
* The prompt includes the schema description and few shot examples and asks for SQL only, no prose. Strip code fences defensively before parsing.

## Tests

* One test per rejection path, and one per rewrite (added LIMIT, lowered LIMIT).
* An injection suite covering at least `DROP`, `UPDATE`, stacked statements with `;`, comment tricks with `--` and `/* */`, `UNION` into forbidden tables and subqueries on forbidden tables. All must be rejected.
* Coverage on `app/sql/` stays at 90 percent or higher.
