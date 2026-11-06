# M3 hybrid retrieval eval

Written by `npm run evals` on 2026-11-04T15:07:58.188Z. Semantic questions went through `HybridRetrievalService` routed as semantic, with no model call. Hybrid questions went through the real router first, then SQL, kNN and BM25 side by side, fused with RRF.

## Configuration

| Setting | Value |
|---------|-------|
| Provider | groq |
| Router model | openai/gpt-oss-20b |
| SQL model | openai/gpt-oss-120b |
| Embedding model | nomic-embed-text |
| Branch deadline | 15000 ms |
| Top k | 8 |
| Run time | 340 s |

## Summary

| Measure | Result |
|---------|--------|
| Fused recall@8, semantic slice | 37 of 80 (46 percent) |
| Hybrid questions with 8 unique properties from SQL and a search | 0 of 8 |

## What it shows

Fusing kNN and BM25 with RRF gives 46 percent recall at 8 on the semantic questions. That is well above kNN alone (26 percent) but below BM25 alone (57 percent): with equal weights, the weaker vector list takes places from the keyword list on this data.

No hybrid question combined SQL with a search. Four times the SQL model declined the question, and the two searches answered alone. In the other four the SQL ran, and the search lists were dropped. Asking `POST /sql` the first three questions again on 6 November showed why: the model added `ORDER BY price` to each, and retrieval keeps an order it takes to be the user's, so the descriptive words ("quiet", "bright", "charming") did not shape the result. This is in the backlog.

## Hybrid questions

Each column counts the properties that branch placed, so a property two branches found counts in both.

| Question | Routed as | Properties | Unique | SQL | kNN | BM25 | Failed branches | ms |
|----------|-----------|------------|--------|-----|-----|------|-----------------|----|
| a quiet 3 bed family home in Inverurie under £250k | hybrid | 8 | 8 | 8 | 0 | 0 | none | 1099 |
| a bright, spacious flat in AB10 with off street parking | hybrid | 8 | 8 | 8 | 0 | 0 | none | 1238 |
| charming cottage in Banchory with a garden for under £350,000 | hybrid | 8 | 8 | 8 | 0 | 0 | none | 1328 |
| a low maintenance 2 bedroom flat in Aberdeen that would suit a first time buyer, band A or B | hybrid | 8 | 8 | 0 | 6 | 6 | sql: declined | 1122 |
| spacious detached house in Stonehaven with a garage and at least 4 bedrooms | hybrid | 8 | 8 | 0 | 8 | 0 | sql: declined | 1149 |
| a new build in Ellon that feels light and airy | hybrid | 1 | 1 | 0 | 1 | 1 | sql: declined | 961 |
| a peaceful rural home with some land in Huntly under 400k | hybrid | 1 | 1 | 1 | 0 | 0 | none | 1236 |
| a characterful period property in AB15 between £300k and £500k | hybrid | 8 | 8 | 0 | 7 | 8 | sql: declined | 1402 |

## Semantic questions

| Question | Fused recall@8 |
|----------|-------------------|
| cosy flat with a garden and a quiet street | 7 of 8 |
| a home where I would not need stairs to reach a bedroom or a bathroom | 2 of 8 |
| a house with a separate annexe where a relative could live | 2 of 8 |
| somewhere I can charge my electric car at home | 7 of 8 |
| a home that runs on renewable energy | 2 of 8 |
| a house that comes with a bit of land around it | 4 of 8 |
| somewhere with room to keep two cars under cover | 3 of 8 |
| a home heated by oil rather than mains gas | 6 of 8 |
| a brand new home that nobody has lived in before | 4 of 8 |
| a building I could take on as a renovation project | 0 of 8 |
