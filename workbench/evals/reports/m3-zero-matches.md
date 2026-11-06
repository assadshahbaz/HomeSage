# M3 zero matches eval

Written by `npm run evals` on 2026-11-05T11:06:19.413Z. Every question in the golden set's zero matches slice went through `ChatService` on the real app, with the answer model watched for calls. Each golden reference query was run again first, through the validator, to confirm it still returns no rows.

## Configuration

| Setting | Value |
|---------|-------|
| Provider | groq |
| Router model | openai/gpt-oss-20b |
| SQL model | openai/gpt-oss-120b |
| Questions | 3 |
| Run time | 97 s |

## Summary

Answered as a no match, with no answer model call and no citation: 3 of 3.

## What it shows

All three questions with no matching listing got the fixed "no listings match" reply, naming the filters that ruled everything out. The answer model was never called, so it had no chance to invent a listing, and each reference query was confirmed to return no rows first.

## Every question

| Question | Intent | Fallback | Reference rows | Retrieval | Fixed message | Citations | Answer calls | Passed |
|----------|--------|----------|----------------|-----------|---------------|-----------|--------------|--------|
| Homes for sale in Westhill under £50,000 | structured | none | 0 | none: no_match | yes | 0 | 0 | yes |
| Five bedroom homes in Aberdeen for under £100,000 | structured | none | 0 | none: no_match | yes | 0 | 0 | yes |
| Commercial units for sale in Stonehaven | structured | none | 0 | none: no_match | yes | 0 | 0 | yes |

## Replies

**Homes for sale in Westhill under £50,000**

> No listings in this data match everything you asked for: in Westhill, up to £50,000. Loosening one of these may find some.

**Five bedroom homes in Aberdeen for under £100,000**

> No listings in this data match everything you asked for: in Aberdeen, up to £100,000, 5 bedrooms. Loosening one of these may find some.

**Commercial units for sale in Stonehaven**

> No listings in this data match everything you asked for: homes, plots, commercial units or other listings, in Stonehaven. Loosening one of these may find some.
