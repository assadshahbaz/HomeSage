# The data

Every listing in this repo is made up. `npm run db:seed` generates about 800 listings across Aberdeen and Aberdeenshire and loads them into MySQL. Nothing is downloaded, and no real addresses, people or phone numbers are involved.

## What is real and what is not

| Part | Real or made up |
|------|-----------------|
| Towns and postcode districts, such as Inverurie and AB15 | Real, so the questions read naturally |
| Streets and house numbers | Made up |
| Full postcodes | Made up. The inward code uses letters no real postcode uses (C, I, K, M, O, V), so none can exist |
| Prices, rooms and features | Made up |
| Seller answers and supplier names | Made up |

`workbench/guards/check-dummy-data.mjs` runs in CI and fails on any postcode that could exist, or on a phone number outside the ranges Ofcom sets aside for drama.

## How it is generated

`api/tools/seed/listing-generator.ts` uses a seeded random generator, so every run builds the same rows on any machine and the golden set stays valid. It writes rows in a raw, messy shape, and the cleaning code in `api/tools/seed/` turns them into the schema, the same path any other source would take:

* numbers arrive as text, and 0 means "not known" for a floor area
* yes and no answers vary in spelling, and some answers are whole sentences
* a seller may write a supplier's name instead of yes
* some listings repeat an address, and the repeat is dropped
* plots and commercial units sit beside homes
* about a third of listings have no seller questionnaire

A few rules keep certain questions honest. No home in Westhill costs under £50,000, no five bedroom home in Aberdeen costs under £100,000, and Stonehaven has no commercial units, so the golden questions about them have a true zero.

## What the data can and cannot say

Read this before touching the schema, the document builder or a prompt.

* **A false flag means "not stated", never "no".** The answer generator must never state a negative from a flag.
* **`unknown` means the seller did not answer.** A missing questionnaire is not a no either.
* **Nothing is estimated.** A missing floor area or council tax band stays `NULL`.
* **There are no EPC ratings**, only whether a certificate exists.
* **There are no pet, smoking or furnishing rules**, no coordinates, no photos, no listing dates and no listing status.
* **There are no listing descriptions.** Semantic search only has the structured fields and seller answers to work with, which is the main limit on recall for vague questions.

The cleaning code refuses personal data even though nothing here is real: anything that looks like a phone number is never stored, and free text showing signs of naming a person is dropped.

`docs/schema.md` has every column, and `docs/property-document.md` shows how a row becomes search text.

## Origin of the schema

The schema and the cleaning rules were designed on a private dataset from the author's MSc project. That data is not in this repo or its history.
