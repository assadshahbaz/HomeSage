# M3 filters eval

Written by `npm run evals` on 2026-11-06T22:17:26.576Z. Every question went through the router and hybrid retrieval on the real app, with no answer call. Each returned property was then read again from MySQL and checked against the router's filters.

## Configuration

| Setting | Value |
|---------|-------|
| Provider | groq |
| Router model | openai/gpt-oss-20b |
| SQL model | openai/gpt-oss-120b |
| Questions | 20 |
| Run time | 909 s |

## Summary

| Measure | Result |
|---------|--------|
| Returned properties that fail a filter | 0 |
| Properties caught outside the filters and dropped | 0, in 0 questions |
| Router fallbacks, which test no filter | 0 |

## What it shows

Every one of the 20 questions was routed with no fallback, so every filter was tested. Not one returned property broke a filter the router set, checked by reading each one again from MySQL, and the guard in retrieval never had to drop one. The SQL model declined one hybrid question ("suit a first time buyer, band A or B"), and the searches answered it alone, still inside the filters.

## Every question

| Question | Source | Intent | Fallback | Filters | Returned | Failed branches | Caught and dropped | Failing a filter |
|----------|--------|--------|----------|---------|----------|-----------------|--------------------|------------------|
| a quiet 3 bed family home in Inverurie under £250k | cases: hybrid | hybrid | none | maxPrice; minBedrooms; maxBedrooms; towns | 8 | none | none | none |
| a bright, spacious flat in AB10 with off street parking | cases: hybrid | hybrid | none | postcodeDistricts; hasOffStreetParking | 8 | none | none | none |
| charming cottage in Banchory with a garden for under £350,000 | cases: hybrid | hybrid | none | maxPrice; towns; hasGarden | 8 | none | none | none |
| a low maintenance 2 bedroom flat in Aberdeen that would suit a first time buyer, band A or B | cases: hybrid | hybrid | none | minBedrooms; maxBedrooms; towns; councilTaxBands | 8 | sql: declined | none | none |
| spacious detached house in Stonehaven with a garage and at least 4 bedrooms | cases: hybrid | hybrid | none | minBedrooms; towns; hasGarage | 8 | none | none | none |
| a new build in Ellon that feels light and airy | cases: hybrid | hybrid | none | towns; isNewBuild | 1 | none | none | none |
| a peaceful rural home with some land in Huntly under 400k | cases: hybrid | hybrid | none | maxPrice; towns | 1 | none | none | none |
| a characterful period property in AB15 between £300k and £500k | cases: hybrid | hybrid | none | minPrice; maxPrice; postcodeDistricts | 8 | none | none | none |
| Homes in AB15 with five or more bedrooms for under £500,000 | golden: structured_filters | structured | none | maxPrice; minBedrooms; postcodeDistricts | 8 | none | none | none |
| Which properties in Peterhead have a double garage? | golden: structured_filters | structured | none | towns; propertyKinds; hasGarage | 5 | none | none | none |
| Houses in Westhill with three bathrooms | golden: structured_filters | structured | none | towns | 3 | none | none | none |
| Listings in AB10 with a garden priced between £100,000 and £150,000 | golden: structured_filters | structured | none | minPrice; maxPrice; postcodeDistricts; propertyKinds; hasGarden | 7 | none | none | none |
| Which properties have an electric vehicle charge point? | golden: structured_filters | semantic | none | none | 8 | none | none | none |
| Homes in Ellon under £300k with at least three public rooms | golden: structured_filters | hybrid | none | maxPrice; towns | 0 | none | none | none |
| Properties in Stonehaven with a bedroom and bathroom on the ground floor | golden: structured_filters | structured | none | towns | 8 | none | none | none |
| Listings in Banchory where the seller says the heating is oil | golden: structured_filters | structured | none | towns; propertyKinds | 3 | none | none | none |
| Properties in Inverurie where the seller reported asbestos | golden: structured_filters | hybrid | none | towns; propertyKinds | 8 | none | none | none |
| All two bedroom homes in Westhill, showing the seller's answer on mains drainage where there is one | golden: structured_filters | structured | none | minBedrooms; maxBedrooms; towns | 8 | none | none | none |
| Two bedroom homes in Stonehaven, with the seller's heating type where they gave one | golden: structured_filters | structured | none | minBedrooms; maxBedrooms; towns | 8 | none | none | none |
| Homes in Stonehaven where the seller says there is no mains drainage | golden: structured_filters | structured | none | towns | 4 | none | none | none |
