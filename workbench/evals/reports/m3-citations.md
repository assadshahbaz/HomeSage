# M3 citations eval

Written by `npm run evals` on 2026-11-05T12:32:40.341Z. Every golden set question went through the router, hybrid retrieval and the guarded answer on the real app. Questions the router declined got no answer.

## Configuration

| Setting | Value |
|---------|-------|
| Provider | groq |
| Answer model | openai/gpt-oss-120b |
| Questions | 35 |
| Run time | 2173 s |

## Summary

| Measure | Result |
|---------|--------|
| Answered | 33 of 35 |
| Answers with an id outside the retrieval in the streamed text | 0 |
| Answers whose streamed text differs from the guarded text | 0 |
| Markers removed by the guard | 0 |

## What it shows

Of 35 golden questions, 33 were answered and 2 were declined by the router. The EPC question was rightly declined. The double garage question should not have been, and the router report shows the same question routed correctly in another run. No answer cited a property outside its retrieval, the streamed text always matched the guarded text, and the guard had no marker to remove. On this run the model never invented an id, so the guard was a backstop that was not needed, not a filter doing work.

## Every question

| Question | Intent | Retrieved | Cited | Removed | Ids outside the retrieval | Stream matches |
|----------|--------|-----------|-------|---------|---------------------------|----------------|
| How many listings are there in Stonehaven? | structured | aggregate | SQL | none | none | yes |
| What is the average asking price of homes in Banchory? | structured | aggregate | SQL | none | none | yes |
| What are the five cheapest 3 bedroom homes in Ellon? | structured | 5 | P-728, P-318, P-553, P-308, P-133 | none | none | yes |
| Homes in AB15 with five or more bedrooms for under £500,000 | structured | 8 | P-142, P-20, P-149, P-731, P-420, P-428, P-622, P-372 | none | none | yes |
| Which properties in Peterhead have a double garage? | out_of_scope | 0 | declined | none | none |  |
| Houses in Westhill with three bathrooms | structured | 3 | P-324, P-477, P-214 | none | none | yes |
| Which towns have more than 150 listings, and how many does each have? | structured | aggregate | SQL | none | none | yes |
| The average asking price of 1, 2, 3 and 4 bedroom homes in Aberdeen, by number of bedrooms | structured | aggregate | SQL | none | none | yes |
| What is the most expensive property in Inverurie? | structured | 1 | P-218 | none | none | yes |
| Listings in AB10 with a garden priced between £100,000 and £150,000 | structured | 7 | P-521, P-535, P-653, P-551, P-326, P-101, P-174 | none | none | yes |
| Which properties have an electric vehicle charge point? | semantic | 8 | P-800, P-644, P-115, P-14, P-18, P-622 | none | none | yes |
| Homes in Ellon under £300k with at least three public rooms | structured | 0 | none | none | none | yes |
| Properties in Stonehaven with a bedroom and bathroom on the ground floor | structured | 8 | P-272, P-107, P-487, P-566, P-368, P-742, P-14, P-430 | none | none | yes |
| Listings in Banchory where the seller says the heating is oil | semantic | 8 | P-138, P-602, P-467 | none | none | yes |
| How many Aberdeen listings are in a conservation area, according to the seller? | hybrid | aggregate | SQL | none | none | yes |
| Properties in Inverurie where the seller reported asbestos | hybrid | 8 | P-576, P-395, P-256, P-405, P-126, P-719, P-385, P-520 | none | none | yes |
| All two bedroom homes in Westhill, showing the seller's answer on mains drainage where there is one | structured | 8 | P-751, P-388, P-484, P-411, P-315, P-108, P-796 | none | none | yes |
| Two bedroom homes in Stonehaven, with the seller's heating type where they gave one | structured | 8 | P-213, P-424, P-172, P-544, P-509, P-368, P-747, P-187 | none | none | yes |
| Homes in Stonehaven where the seller says there is no mains drainage | structured | 4 | P-213, P-544, P-742, P-24 | none | none | yes |
| How many plots of land are for sale? | structured | aggregate | SQL | none | none | yes |
| Which homes in Aberdeen have an EPC rating of B or better? | out_of_scope | 0 | declined | none | none |  |
| Show me pet friendly flats within a mile of the university | semantic | 8 | none | none | none | yes |
| cosy flat with a garden and a quiet street | semantic | 8 | P-29, P-454, P-118, P-438, P-290, P-177, P-224 | none | none | yes |
| a home where I would not need stairs to reach a bedroom or a bathroom | structured | 8 | P-272, P-288, P-280, P-275, P-579, P-791, P-107, P-387 | none | none | yes |
| a house with a separate annexe where a relative could live | semantic | 8 | P-289 | none | none | yes |
| somewhere I can charge my electric car at home | semantic | 8 | P-800, P-115, P-644, P-14, P-679, P-18, P-622 | none | none | yes |
| a home that runs on renewable energy | semantic | 8 | P-735, P-395, P-159, P-310 | none | none | yes |
| a house that comes with a bit of land around it | semantic | 8 | P-50, P-732, P-105, P-46 | none | none | yes |
| somewhere with room to keep two cars under cover | semantic | 8 | none | none | none | yes |
| a home heated by oil rather than mains gas | structured | 8 | P-135, P-474, P-272, P-716, P-530, P-486, P-484, P-602 | none | none | yes |
| a brand new home that nobody has lived in before | hybrid | 8 | P-175, P-441, P-751, P-305, P-30, P-327, P-649, P-781 | none | none | yes |
| a building I could take on as a renovation project | semantic | 8 | P-228, P-271, P-568, P-623 | none | none | yes |
| Homes for sale in Westhill under £50,000 | structured | 0 | none | none | none | yes |
| Five bedroom homes in Aberdeen for under £100,000 | structured | 0 | none | none | none | yes |
| Commercial units for sale in Stonehaven | structured | 0 | none | none | none | yes |
