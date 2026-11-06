# M3 aggregates and ordering eval

Written by `npm run evals` on 2026-11-05T11:56:25.233Z. Every question in the golden set's aggregates and ordering slice went through the router, hybrid retrieval and the guarded answer on the real app. Retrieval is scored against the golden reference query with the M1 row scorer, in order for an ordered question.

## Configuration

| Setting | Value |
|---------|-------|
| Provider | groq |
| Answer model | openai/gpt-oss-120b |
| Questions | 8 |
| Run time | 450 s |

## Summary

Correct path, retrieval and citations: 8 of 8.

## What it shows

All eight questions took the right path. Counts and averages came back as one SQL result cited as `[SQL]`, and "cheapest" and "most expensive" kept the order the SQL gave. Every result matched the reference query's rows.

## Every question

| Question | Expected | Intent | Path | Retrieval against the reference | Cited | Citations fit |
|----------|----------|--------|------|---------------------------------|-------|---------------|
| How many listings are there in Stonehaven? | aggregate | structured | aggregate | pass: 1 rows match | SQL | yes |
| What is the average asking price of homes in Banchory? | aggregate | structured | aggregate | pass: 1 rows match | SQL | yes |
| What are the five cheapest 3 bedroom homes in Ellon? | ordered rows | structured | sql_order | pass: 5 rows match | P-728, P-318, P-553, P-308, P-133 | yes |
| Which towns have more than 150 listings, and how many does each have? | aggregate | structured | aggregate | pass: 1 rows match | SQL | yes |
| The average asking price of 1, 2, 3 and 4 bedroom homes in Aberdeen, by number of bedrooms | aggregate | structured | aggregate | pass: 4 rows match | SQL | yes |
| What is the most expensive property in Inverurie? | ordered rows | structured | sql_order | pass: 1 rows match | P-218 | yes |
| How many Aberdeen listings are in a conservation area, according to the seller? | aggregate | structured | aggregate | pass: 1 rows match | SQL | yes |
| How many plots of land are for sale? | aggregate | structured | aggregate | pass: 1 rows match | SQL | yes |
