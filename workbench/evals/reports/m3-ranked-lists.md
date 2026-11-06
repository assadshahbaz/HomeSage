# M3 ranked lists eval

Written by `npm run evals` on 2026-11-04T15:02:14.731Z. Each question went through `RetrievalService` against the local Elasticsearch index and the configured embedding model, with the default filters, and both rankings were scored against the labelled ids.

## Configuration

| Setting | Value |
|---------|-------|
| Embedding model | nomic-embed-text |
| Index | homesage-properties |
| Top k | 8 |
| Questions | 10 |
| Run time | 1 s |

## Summary

| Ranking | Recall@8 |
|---------|-----------|
| kNN alone | 21 of 80 (26 percent) |
| BM25 alone | 46 of 80 (57 percent) |
| Either top 8 | 56 of 80 (70 percent) |

"Either" counts a relevant property found in the top 8 of kNN, of BM25 or of both. Fusing the two lists keeps 8 of them, so it is the most a fused top 8 could find.

## What it shows

On this data, keyword search (BM25) beats vector search (kNN): 57 percent against 26 percent recall at 8. The generated listings reuse fixed phrases, so a question that shares a word with them, such as "new" or "land", ranks well on keywords even when the vectors miss it. The two lists find different properties: together their top 8s hold 70 percent of the relevant ones, which is the most a fused top 8 could find. No ranking finds anything for "a building I could take on as a renovation project".

## Every question

| Question | kNN | BM25 | Either |
|----------|-----|------|--------|
| cosy flat with a garden and a quiet street | 8 of 8 | 7 of 8 | 8 of 8 |
| a home where I would not need stairs to reach a bedroom or a bathroom | 3 of 8 | 2 of 8 | 5 of 8 |
| a house with a separate annexe where a relative could live | 0 of 8 | 3 of 8 | 3 of 8 |
| somewhere I can charge my electric car at home | 4 of 8 | 8 of 8 | 8 of 8 |
| a home that runs on renewable energy | 2 of 8 | 3 of 8 | 5 of 8 |
| a house that comes with a bit of land around it | 0 of 8 | 8 of 8 | 8 of 8 |
| somewhere with room to keep two cars under cover | 2 of 8 | 1 of 8 | 3 of 8 |
| a home heated by oil rather than mains gas | 2 of 8 | 6 of 8 | 8 of 8 |
| a brand new home that nobody has lived in before | 0 of 8 | 8 of 8 | 8 of 8 |
| a building I could take on as a renovation project | 0 of 8 | 0 of 8 | 0 of 8 |
