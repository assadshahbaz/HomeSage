# M3 answer eval

Written by `npm run evals` on 2026-11-05T11:09:56.884Z. Each question went through the router, hybrid retrieval and the answer model on the real app, against the Docker MySQL and Elasticsearch. The answers are raw model text: the citation guard is not applied yet.

## Configuration

| Setting | Value |
|---------|-------|
| Provider | groq |
| Answer model | openai/gpt-oss-120b |
| Prompt | answer.v1 |
| Questions | 4 |
| Run time | 214 s |

## Summary

| Question | Routed as | In context | Cited | Cited outside the context | First token ms | Total ms |
|----------|-----------|------------|-------|---------------------------|----------------|----------|
| structured | hybrid | 8 | 8 | none | 1379 | 1815 |
| semantic | hybrid | 8 | 0 | none | 941 | 1478 |
| hybrid | hybrid | 8 | 8 | none | 6899 | 7430 |
| EPC rating, router skipped | hybrid, set by hand | 8 | 0 | none | 806 | 867 |

Every citation in the context: 4 of 4 answers.

## What it shows

All four answers cite only properties that were in their context. The answer to the EPC question says the data holds no EPC ratings, rather than guessing. The semantic answer wrote its markers with spaces, as `[ P-623 ]`. This report counts raw text, so it shows them as no citations, but the citation guard accepts that form and sends it on as `[P-623]`; the citations report measures the guarded text.

Time to the first token was under 1.4 seconds for three questions and 6.9 seconds for the hybrid one.

## Answers

### structured

**Question:** Properties in Inverurie where the seller reported asbestos

**Context:** P-395, P-256, P-405, P-126, P-719, P-385, P-520, P-28. **Cited:** P-395, P-256, P-405, P-126, P-719, P-385, P-520, P-28. **Tokens:** 2906 in, 640 out.

> 44 Rowanlea Street, Inverurie, AB51 2VV – the seller reports asbestos [P-395]  
> 173 Pinefold Street, Inverurie, AB51 7IV – the seller reports asbestos [P-256]  
> 25 Brackenhurst Crescent, Inverurie, AB51 2IO – the seller reports asbestos [P-405]  
> Flat A, 1 Merrow Court, Inverurie, AB51 2KI – the seller reports asbestos [P-126]  
> 31 Westerlea Gardens, Inverurie, AB51 3KV – the seller reports asbestos [P-719]  
> Flat E, 52 Cairnlea Avenue, Inverurie, AB51 2CO – the seller reports asbestos [P-385]  
> 81 Hazelmoor Crescent, Inverurie, AB51 5KV – the seller reports asbestos [P-520]  
> 51 Dunmarrow Gardens, Inverurie, AB51 4MK – the seller reports asbestos [P-28]

### semantic

**Question:** cosy flat with a garden and a quiet street

**Context:** P-623, P-224, P-287, P-118, P-55, P-513, P-29, P-451. **Cited:** none. **Tokens:** 1736 in, 559 out.

> Flat B, 60 Sandpiperhill Crescent, Inverurie has a garden [ P-623 ]  
> Flat A, 158 Kinlarrow Street, Laurencekirk has a garden [ P-224 ]  
> Flat F, 89 Juniperhall Lane, Aberdeen has a garden [ P-287 ]  
> Flat A, 101 Larkfield Crescent, Aberdeen has a garden [ P-118 ]  
> Flat D, 102 Selwick Street, Inverurie has a garden [ P-55 ]  
> Flat A, 154 Kestrelhill Crescent, Fraserburgh has a garden [ P-513 ]  
> Flat C, 42 Orchardleigh Terrace, Aboyne has a garden [ P-29 ]  
> Flat A, 71 Yarrowfield Drive, Aberdeen has a garden [ P-451 ]

> The listings do not mention whether any of these flats are on a quiet street, so that part of the request cannot be answered from the data.

### hybrid

**Question:** a quiet 3 bed family home in Inverurie under £250k

**Context:** P-9, P-245, P-357, P-719, P-28, P-520, P-269, P-661. **Cited:** P-9, P-245, P-357, P-719, P-28, P-520, P-269, P-661. **Tokens:** 2513 in, 683 out.

> The data includes several 3-bedroom homes in Inverurie priced below £250,000, but none of the listings mention whether the property is quiet.

> - 159 Orchardleigh Drive, Inverurie, priced at £189,500, 3 bedrooms [P-9]  
> - 40 Ashlar Court, Inverurie, priced at £224,500, 3 bedrooms [P-245]  
> - Flat D, 86 Lochmarrow Crescent, Inverurie, priced at £192,500, 3 bedrooms [P-357]  
> - 31 Westerlea Gardens, Inverurie, priced at £205,500, 3 bedrooms [P-719]  
> - 51 Dunmarrow Gardens, Inverurie, priced at £244,000, 3 bedrooms [P-28]  
> - 81 Hazelmoor Crescent, Inverurie, priced at £218,000, 3 bedrooms [P-520]  
> - 16 Gorsewick Crescent, Inverurie, priced at £211,500, 3 bedrooms [P-269]  
> - 148 Pennant Crescent, Inverurie, priced at £197,000, 3 bedrooms [P-661]  

### EPC rating, router skipped

**Question:** Which homes in Aberdeen have an EPC rating of B or better?

**Context:** P-362, P-185, P-568, P-676, P-664, P-332, P-72, P-132. **Cited:** none. **Tokens:** 2196 in, 146 out.

> The provided data does not include EPC ratings, so it cannot identify any homes in Aberdeen with an EPC rating of B or better.
