---
name: fishy
description: Sense check a piece of code that feels wrong. Trace the data flow to its sources and callers and explain why it is or is not correct, with a suggested fix.
---

# Fishy Code

You are given a piece of code that looks like it might be wrong. Trace every relevant piece of information about why it is or is not correct. Follow the data from where it enters the process to where it is used, and list every caller that can reach the line in question.

## How to answer

1. Say where the data comes from (request body, router output, MySQL row, ES hit, config) and every transformation on the way.
2. Say what guarantees exist along that path: Zod parsing, the SQL validator, the citation guard, types, tests.
3. Give a verdict: correct, incorrect or correct only by accident.
4. If there is a problem, show the smallest fix as a patch and ask before applying it.
5. List entry paths that have no test coverage and offer to add tests.

## Example questions

### Skipped null check

**Question**: `retrieval.service.ts` reads `hit._source.price` without a null check. Where is it guaranteed?

**Answer**: Documents are only written by `IngestionService`, which builds them with `PropertyDocumentBuilder`. The builder omits `price` when the MySQL column is null, so the field can be missing. The ES client types `_source` loosely, which is why this compiles. Parse hits with the shared property schema so `price` is typed as optional, and handle the missing case in the RRF input.

### Untyped value

**Question**: The `filters` argument of `SqlPromptBuilder.build` is typed `any`. What is it really?

**Answer**: There are two callers. One passes the router's parsed output, the other passes filters from the URL via the chat request. Both fit the shared `QueryFilters` schema, so the parameter can be typed as that and the `any` removed.

### Possible breaking change

**Question**: Changing the RRF constant in `rrf.ts` feels like it could break something. Can you check?

**Answer**: It is used by hybrid chat and by the eval runner. Chat is unaffected in shape, but ranking changes will move recall@8, so the eval gate may fail. Run the smoke eval subset before merging and record the before and after numbers in the experiment log.
