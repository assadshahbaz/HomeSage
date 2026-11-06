# Evals

Everything HomeSage is measured on lives here, all of it run on the made up listings: one golden set that every milestone grows, the hostile inputs for the SQL path, and the committed reports.

| Path | What it holds |
|------|---------------|
| `golden-set.json` | Every golden question, from every milestone |
| `sql/injection-cases.json` | Hostile SQL the validator must reject |
| `sql/question-injections.json` | Hostile questions the whole `POST /sql` path must refuse |
| `router/router-cases.json` | Questions only the router is scored on, for kinds the golden set does not hold yet: hybrid, out of scope, and places or bands the data does not have |
| `reports/` | One committed report per milestone, written by `npm run evals`. The router report, `m3-router.md`, routes every golden entry with a `route` and every router case through `QueryRouter`, paced for a free tier (`EVAL_PACE_MS`, default 30 seconds), and can be run on its own with `npm run evals -- router`. The M2 report scores the index as it is; with `EVAL_REINGEST=1` it first runs a full ingestion twice and checks the index against MySQL after each. Its "What it shows" section is written by hand and kept when the report is rewritten |
| `labelling/` | The questions behind `relevant_ids` entries, each with the rule its labels come from |

The runner code is in `api/tools/evals/`. `golden-set.ts` there holds the schema every entry is parsed with, and a run stops on the first entry that fails it, naming that entry.

## Why one golden set

If each milestone started its own question file, no two reports would measure the same thing. Instead there is one file. A milestone adds entries, tagged with its own name, and never edits another milestone's entries. A report picks entries by milestone and slice, so the M1 report keeps running the same questions after M2 and M3 add theirs, and its numbers stay comparable.

## An entry

```json
{
  "id": "banchory-oil-heating",
  "slice": "structured_filters",
  "milestone": "M1",
  "category": "disclosures join",
  "question": "Listings in Banchory where the seller says the heating is oil",
  "expected": { "kind": "rows", "reference": "SELECT p.id FROM properties p JOIN ..." }
}
```

| Field | Meaning |
|-------|---------|
| `id` | Kebab case and unique across the file. Never reused, even when an entry is removed |
| `slice` | The kind of question, from the list below |
| `milestone` | The milestone that added the entry: `M1`, `M1.1`, `M2` and so on |
| `category` | Free text naming what the question exercises, such as `postcode district, price range`. Reports show it, and specs check that each report covers the categories it should |
| `question` | Exactly what a user would type |
| `expected` | The right outcome, in one of the four kinds below |
| `route` | Optional. How the router should read the question: `intents` lists every intent that fairly fits, and `filters` the filters that must come back with exactly these values, in the data's spelling. Scored by the router report |

### Slices

| Slice | What belongs in it |
|-------|--------------------|
| `structured_filters` | Questions a `WHERE` clause answers: price, rooms, district, town, flags, seller answers |
| `aggregates_and_ordering` | Counts, averages, grouped totals, cheapest, most expensive |
| `semantic` | Questions answered by meaning rather than a filter, such as "cosy flat with a garden" |
| `hybrid` | A filter plus meaning, such as "quiet 2 bed in AB15 under £200k" |
| `unanswerable` | Questions the data cannot answer: EPC bands, pets, distances, listing dates. The right result is a refusal |
| `out_of_scope` | Questions that are not about the listings at all, and questions that would steer by a protected characteristic, which fair housing rules forbid |
| `follow_ups` | A question that only makes sense after an earlier turn, such as "which of those has a garage?" |
| `zero_matches` | Fair questions no listing meets, such as a price below anything in the town. The reference query returns no rows, and the right result is a plain statement that nothing matched |

### Expected outcomes

| `kind` | Fields | Scored by |
|--------|--------|-----------|
| `rows` | `reference`, and `ordered: true` when the question asks for an order | Running the reference query through the validator and comparing the rows returned, never the SQL text, since several queries can be right |
| `aggregate` | `reference` | The same, for a count, an average or a grouped total |
| `decline` | none | The pipeline refuses instead of answering |
| `relevant_ids` | `ids`, `uncertainIds` when there are any, `labelledBy`, `labelledOn` | Recall of the labelled ids in the top results, with uncertain ids taken out of the results first. Labelled by a rule, as below |

A reference query is run against the local MySQL at scoring time, so it stays right if the data is reimported. It must not reach the 50 row cap, or it cannot be compared.

## Labelling relevant ids

Semantic and hybrid questions have no reference query, because what counts as "cosy" or "quiet" is a judgement. For this made up data, the relevant properties are the candidates a question's rule accepts, so a label means "the record states what the question asks", with no human judgement on top.

1. **Write the question first**, and only ask what the data can support. There are no listing descriptions, coordinates or EPC bands, so "near the beach" or "EPC B" belong in `unanswerable`, not here.
2. **Pool the candidates.** Take the top 20 from each of the three retrieval paths: SQL (with the filters the question states), BM25 over the document text, and kNN over the embeddings. Merge them and drop repeats. Whatever the paths cannot find is not in the pool, so a system that later finds a relevant property outside it is not penalised for it, only unrewarded until the pool is extended.
3. **Label the pool.** `npm run evals:pool` applies each question's rule to the pool. To review a label, read each candidate's full record in MySQL, not the index document, and mark it relevant only when the record supports every part of the question. When the record points to a match but cannot prove it, such as "5 Chalmers Flats" for a flat, where "Flats" may only be the building's name, it is uncertain. Uncertain ids count neither way: they are dropped from the results before the top k is taken, so finding one earns nothing and costs no slot. When nothing in the record points to a match, it is not relevant. A part of the question that no record can speak to, such as "cosy" or "a quiet street", is left out of the judgement rather than failing every candidate, and the entry's `category` names it, so a reader knows the label does not cover it.
4. **Record the label.** `ids` holds the relevant property ids, `uncertainIds` the uncertain ones (left out when there are none), `labelledBy` the rule or person that labelled them, and `labelledOn` the date, as `YYYY-MM-DD`.
5. **Extend, never rewrite.** When a later milestone surfaces a candidate in its top results that the pool never held, label that candidate, add it if relevant, and update `labelledBy` and `labelledOn`. Existing labels change only when they were wrong, and the pull request says why.

An entry whose pool held nothing relevant is not added. A question with no right answer measures nothing.

## Adding entries

* Tag each entry with the milestone adding it, and never move an entry between milestones.
* A report that should keep its numbers must not pick up new entries. The SQL report picks milestones `M1` and `M1.1` only; a later SQL entry gets its own report or a deliberate change to that selection, stated in the pull request.
* Check a new `rows` or `aggregate` reference by running it once against the local MySQL, and say what it returned in the pull request.
