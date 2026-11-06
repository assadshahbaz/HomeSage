# ADR 006: Generated SQL passes a parser based validator before it runs, on top of the read only grant

Status: Accepted
Date: 24 September 2026

## Context

The text to SQL path runs a query a language model wrote. The model reads the user's question, and in later milestones it also reads retrieved seller questionnaire text, so anything in either can steer what it writes. Treating its output as trusted code would make every prompt injection a database injection.

The database already refuses the worst of it. The API connects as `rag_ro`, which holds `SELECT` on the property tables and nothing else, so `DROP`, `UPDATE` and `INSERT` fail at the server. That grant is necessary and it stays. It is not enough on its own, because a read only account can still do real damage with reads:

* **Read what it should not.** `rag_ro` can read every column of `properties` and `property_disclosures`, including the ones the schema doc keeps out of generated SQL: the free text `*_detail` columns, the supplier names, `parking_arrangements` and the timestamps. The grant cannot tell a column the prompt describes from one it deliberately leaves out.
* **Tie up the server.** `SLEEP`, `BENCHMARK` and an unbounded result set are all reads. `GET_LOCK` and `SELECT ... FOR UPDATE` touch server state without writing a row.
* **Reach outside the tables.** `LOAD_FILE` and `INTO OUTFILE` depend on the `FILE` privilege and `secure_file_priv`, which are server configuration a deploy can get wrong. `information_schema` is readable by any account and describes the whole server.
* **Return more than a chat answer can use.** Nothing in the grant caps rows. The answer model reads at most a few dozen rows, and a query without a `LIMIT` over a table that grows with every import is a latency and cost problem long before it is a security one.
* **Fail without saying why.** A permission error from MySQL is a poor signal to feed back to the model for its one corrected attempt. "column house_floor is not on the allow list" is a good one.

## Decision

Every generated query passes `SqlValidator` before it reaches MySQL, and the read only grant stays underneath it as the second line.

The validator parses the query with `node-sql-parser` in the MySQL dialect and walks the tree. It has no dependency on Nest, the model or the database, and returns a result value, either the rewritten SQL or a rejection reason with a detail line, rather than throwing. The rules:

* The text parses, and it is exactly one statement, and that statement is a `SELECT`.
* Every table is on the allow list derived from `docs/schema.md`, or is a CTE or derived table defined in the same query. Database qualified names are refused.
* Every column reference resolves to a column on the allow list for the table it belongs to, or to a column a CTE or derived table exposes. This holds inside subqueries, joins, `ON`, `USING` and CTEs. `SELECT *` and `p.*` are refused, since a star reads columns the list keeps out.
* A select list alias counts as a column only in `ORDER BY`, the one clause where MySQL looks at aliases before table columns. In `WHERE`, `GROUP BY` and `HAVING` MySQL resolves a name against the tables first, so an alias named `house_floor` would read the real column.
* An unqualified name is looked up in the innermost query first. If that query reads a real table and the name is not an allowed column of it, the name is refused rather than matched against an outer query, because MySQL would bind it to the inner table's column of that name.
* Functions come from an allow list: aggregates, rounding, string handling, `COALESCE`, `IF`, `CASE`, `EXISTS` and a few more. `LOAD_FILE`, `SLEEP`, `BENCHMARK` and anything else not on the list are refused by default.
* User and system variables, variable assignment, `SELECT ... INTO` and locking reads are refused.
* `UNION`, `INTERSECT` and `EXCEPT` are refused.
* The outer query always carries a `LIMIT` no higher than `SQL_ROW_LIMIT` (50 by default). One is added when missing and lowered when too high. `LIMIT` and `OFFSET` must be whole number literals.

The SQL that runs is printed from the parsed tree, never the text the model returned. Comments, including MySQL's `/*! ... */` executable comments that the server would run but the parser skips, cannot survive the round trip.

## Alternatives considered

### The read only grant alone

The grant is what stops writes, and it is kept. On its own it leaves every problem in the context open: forbidden columns, sleeps and locks, file access where the server allows it, no row cap, and an error message the model cannot learn from. It also makes the grant a single point of failure, so a deploy that connects with the wrong account turns every model mistake into a write.

### Regular expressions over the query text

Refuse anything matching `DROP`, `;`, `SLEEP(` and so on. It is how most tutorials do it and it is easy to get past: comments inside keywords, executable comments, string literals that contain the forbidden words and trip false rejections, and identifiers quoted with backticks. A regex cannot tell which table a column belongs to, so the allow list could not be enforced at all.

### Parameterised query templates only

The model picks a template and fills in bound parameters, and never writes SQL. This is the safest option and it was seriously considered. It loses because the questions this app exists for ("average price per town for three bedroom houses with gas heating") combine filters, grouping and ordering in more ways than a template set can list, and the M1 eval set measures exactly that flexibility. Router supplied filters still go through bound parameters, as the SQL rules require.

### The parser's own `whiteListCheck`

`node-sql-parser` can check a query's tables and columns against a list of `select::table::column` authorities. It works on the flat table and column lists the parser extracts, so it cannot tell a select alias from a real column or follow scoping between an inner and an outer query, which are exactly the cases above where a forbidden column slips through. It also has no concept of functions, variables, `INTO` or `LIMIT`, so a walker was needed for those anyway.

### A deny list of functions

Refuse `LOAD_FILE`, `SLEEP` and `BENCHMARK` by name and allow everything else. MySQL has hundreds of functions, and the dangerous set changes between versions (`GET_LOCK`, `RELEASE_ALL_LOCKS`, `SOURCE_POS_WAIT`, `DATABASE`, `USER`). An allow list fails closed: a legitimate function the model reaches for gets refused with a clear reason, and adding it is a one line change with a test.

## Consequences

* The validator is the security boundary of the text to SQL path, and its tests are the proof. Every rejection path has a test, every rewrite has one, and the injection suite covers stacked statements, comment tricks, unions and subqueries on forbidden tables.
* It is stricter than MySQL. Some valid queries are refused: `SELECT *`, `UNION`, window functions, date functions, and an unqualified column that exists only in a derived table joined beside a real table. The model gets the reason and one retry, and the prompt can steer it away from these. A refusal that the eval set shows is common is a reason to widen a rule, with a test.
* The function allow list is a maintained list. A new prompt feature that needs a function means adding it here first.
* The SQL that runs is the parser's printing of the tree, with every identifier backticked. It is what goes in logs and traces, so it is not character for character what the model wrote.
* The validator depends on how `node-sql-parser` shapes its tree. A parser upgrade can move a field, which is why the walker checks every field it does not handle explicitly rather than only the ones it expects, and why the upgrade has to run the full injection suite.
* The row cap applies to the outer query only. A subquery may read more rows to compute its result, which is correct but means the cap bounds what comes back, not the work MySQL does. The statement timeout on the executor bounds the work.

## Revisit when

The model needs something the rules refuse often enough to show up in the eval reports, such as date arithmetic once listings carry dates. Or a second database dialect arrives, since every rule here is written against MySQL's name resolution.
