# ADR 003: MySQL is the source of truth and the Elasticsearch index is rebuildable

Status: Accepted
Date: 22 September 2026

## Context

After ADR 002 the same property facts exist in two places: the rows in MySQL and the derived documents in Elasticsearch. Two copies of anything eventually disagree, and a system that has not decided which copy wins has no repair procedure, only opinions. The question is not whether they drift, it is what happens the day they do.

The specifics here make the answer easier than it usually is:

* The data is a fixed snapshot taken on 13 April 2025, imported once from a dump. It does not change under the application, and the API connects to MySQL with an account that holds `SELECT` and nothing else, so it cannot change it either.
* Citations are MySQL ids. An answer says `[P-1234]`, and that number is the primary key of a row. The id is the contract between a claim and the thing that backs it.
* Everything in an Elasticsearch document is computed from MySQL: the paragraph comes from the columns and the questionnaire join, the vector comes from the paragraph, the filter fields are copies of columns. Nothing originates there.

## Decision

MySQL is the source of truth. The Elasticsearch index is a derived artefact that can be deleted and rebuilt at any time, and nothing is ever written to it that could not be regenerated from MySQL.

That rule has teeth in a few places:

* Retrieval may find a property in Elasticsearch, but the facts an answer states come from rows. A hit is a pointer to an id.
* Ingestion is a one way pipeline, MySQL to Elasticsearch, and never the reverse. `npm run ingest -- --full` rebuilds from empty, `npm run ingest -- --since <timestamp>` catches up. Both upsert keyed by property id, so a rerun converges rather than duplicating.
* When the two disagree, MySQL is right by definition and the fix is a rebuild, never a patch applied to the index.
* The seed rebuilds MySQL, and MySQL rebuilds the index. Elasticsearch is not backed up, because a restore and a rebuild are the same operation.

## Alternatives considered

### Elasticsearch as the only store

Tempting, since it can hold every field and would cut a service. It gives up exact aggregates and joins over the full table, which the SQL path in ADR 001 depends on, and it gives up the read only MySQL account, which is the reason a generated query cannot write anything no matter what the validator misses. It would also make the index its own master, so a bad mapping change would be data loss rather than an inconvenience.

### Both stores writable, kept in step by dual writes

Two masters, a partial failure between the two writes, and no way to tell afterwards which half is correct. The repair story is an argument.

### Change data capture from the binlog, with Debezium or similar

The right answer for a live transactional system. Here the data is frozen after import, so a scheduled or manual `--since` run covers every change that will ever happen, and a streaming pipeline would be a permanent moving part earning nothing.

## Consequences

* Ingestion has to be genuinely idempotent and resumable, because rebuilding is the standard repair and it will be run often. Running it twice produces the same index with no duplicates, and that is a test, not an aspiration.
* The index can be treated as disposable. A mapping change, a new analyser or a different embedding model is a rebuild and an alias swap, with no migration to write and nothing to lose if it goes wrong. This is what makes the versioned index in ADR 002 affordable.
* There is a staleness window between a MySQL change and the index catching up. It is acceptable here only because the snapshot does not change. A live listing feed would need this revisited before anything else.
* A document that fails to build or embed goes to the dead letter log and the run continues. A partially built index is still useful, and the missing rows are still reachable through the SQL path.
* The full rebuild is not free: every property has to be embedded again, which costs provider tokens. Cost per run is recorded so the number is known rather than assumed.

## Revisit when

The property data stops being a snapshot, or anything other than the import writes to MySQL. At that point the staleness window becomes a real problem and the sync strategy, not the ownership rule, is what has to change.
