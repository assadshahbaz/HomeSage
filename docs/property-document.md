# Property document

Every property becomes one document in the search index. `PropertyDocumentBuilder` (`api/src/app/ingestion/document/`) builds it from a `properties` row and the listing's `property_disclosures` row, when it has one. The document holds a paragraph, which BM25 searches and the embedding model reads, and the hard facts that kNN is pre filtered on.

The listings have no descriptions, so the paragraph is written only from what the row states. It is a pure function of the row: no clock, no randomness and no host locale, so the same row always gives the same document, byte for byte.

## Rules

* **A missing fact is left out.** The text never contains "null", "undefined", "unknown", "N/A" or "NaN". Seller text containing one of those words is dropped, and the template's own phrase is written in its place.
* **Only set listing flags are written.** A flag of 0 means the listing did not mention it, not that the property lacks it, so it writes nothing.
* **A no comes only from the seller.** `unknown` and `not_applicable` answers write nothing. A `no` is written only for the answers listed with a no phrase below, where a no is worth searching for.
* **Nothing estimated.** A floor area or count of 0 is treated as missing, and no value is ever inferred.
* **`property_kind` is never stated.** It is a keyword guess from the address, so the paragraph always says "property", never "house", "flat" or "plot". It is still a filter field.
* **Seller text is untrusted.** It is tidied (whitespace collapsed, capitalised, closed with a full stop) but not otherwise changed. When it reaches the answer prompt through retrieval, the prompt must keep it delimited and out of the instructions.

## The paragraph

Sentences in this order, each only when its facts exist.

| # | Sentence | Written when |
|---|----------|--------------|
| 1 | `3 bedroom, 2 bathroom property with 2 public rooms at <full_address>.` Counts in the singular for 1, and any count that is missing or 0 left out. With no counts: `Property at <full_address>.` | Always |
| 2 | `Asking price £229,000.` | Always |
| 3 | `Floor area 97 m².` | `area_m2` above 0 |
| 4 | `Council tax band E.` | Band set |
| 5 | Listing features as one list: `Garden, double garage, off street parking and green energy.` | Any feature flag set |
| 6 | `New build.` `Self contained.` `Part of a development.` `Development opportunity.` | Each flag set |
| 7 | Heating, see below | Anything known about heating |
| 8 | `Parking: <parking_arrangements>` in the seller's words | Parking text present and clean |
| 9 | One sentence per seller answer, see below | Answer `yes`, or `no` where a no phrase exists |

Features, in list order: garden, double garage, garage (only without a double garage), land, off street parking, on street parking, parking (only when neither parking kind is set), a ground floor bedroom and bathroom, a granny flat, green energy, an electric vehicle charge point.

### Heating

Central heating counts as confirmed when the seller answered `yes` to `central_heating` or the listing flag `has_central_heating` is set. The heating type comes from `property_disclosures.heating_type`. `gas`, `oil` and `electric` are named; `other` and a missing type are not.

| Situation | Written |
|-----------|---------|
| Confirmed, with a named type | `Gas central heating.` |
| Confirmed, no named type | `Central heating.` |
| Not confirmed, with a named type | `Oil heating.` |
| Seller answered `no` and the flag is not set | `No central heating.` |
| `heating_type` is `none` | `No heating system reported.` |
| `central_heating` is `yes` or `no` and has a detail | `Heating: <detail>` |

### Seller answers

For a `yes` or a `no`, the seller's detail sentence is written when there is one, as `<label>: <detail>`, since the detail often starts "Yes, ..." and names no subject. A detail that is only "Yes" or "No", or that holds a forbidden word, falls back to the phrase. Without a detail, the phrase for the answer is written, or nothing when there is no phrase for it.

| Column | Label | Yes | No |
|--------|-------|-----|----|
| `conservation_area` | Conservation area | In a conservation area. | Not in a conservation area. |
| `listed_building` | Listed building | Listed building. | Not a listed building. |
| `windows_replaced` | Windows | Windows replaced. | |
| `maintenance_contract` | Maintenance contract | Maintenance contract in place. | |
| `structural_damage` | Structural damage | Structural damage reported. | No structural damage reported. |
| `asbestos` | Asbestos | Asbestos reported. | No asbestos reported. |
| `mains_drainage` | Drainage | Mains drainage. | Not on mains drainage. |
| `shared_cost_responsibility` | Shared repair costs | Shares the cost of common repairs. | No shared repair costs. |
| `major_roof_repairs` | Roof repairs | Major roof repairs reported. | No major roof repairs reported. |
| `common_building_insurance` | Buildings insurance | Common buildings insurance. | |
| `other_regular_charges` | Regular charges | Other regular charges apply. | No other regular charges. |
| `specialist_work` | Specialist work | Specialist work reported. | No specialist work reported. |
| `guarantee_available` | Guarantees | Guarantees available. | |
| `boundaries_moved` | Boundaries | Boundaries have moved. | |
| `received_notices` | Notices | Notices received. | No notices received. |
| `public_right_of_way` | Right of way | Public right of way. | No public right of way. |

Left out on purpose:

* `epc_available`: a sentence about an EPC reads like a rating, and the data has none.
* The utility answers (`gas_supply`, `water_supply`, `electricity_supply`, `telephone_line`, `broadband`, `cable_tv`) and the six supplier columns: little to search on, and the supplier names are spelled several ways.
* `ownership_months`, `house_floor` and both tables' timestamps.

### Example

A document for a listing with a questionnaire:

> 1 bedroom, 1 bathroom property with 1 public room at Flat D, 4 Cairnlea Place Southholm, Aberdeen, AB11 9CK. Asking price £50,000. Floor area 50 m². Council tax band A. On street parking. Gas central heating. Parking: Permit bays along the kerb. Not in a conservation area. Not a listed building. No structural damage reported. No asbestos reported. Mains drainage.

## Metadata

Filter fields beside the text, one to one with the index mapping. Nulls stay `null`, which Elasticsearch leaves out of a filter.

| Field | Type | Source |
|-------|------|--------|
| `id` | string | `properties.id`, also the index document id |
| `text` | string | The paragraph above |
| `price` | integer | `price` |
| `bedrooms`, `bathrooms`, `public_rooms`, `area_m2` | integer or null | The column, with 0 as null |
| `post_code`, `postcode_district`, `town`, `council_tax_band` | string or null | The column |
| `property_kind` | string | `property_kind`. A guess from the address, so use it to exclude obvious non homes only |
| `heating_type` | string or null | `property_disclosures.heating_type`, null without a questionnaire |
| `has_garden`, `has_off_street_parking`, `is_new_build` | boolean | The flag |
| `has_garage` | boolean | `has_garage` or `has_double_garage` |
| `updated_at` | ISO 8601 string | `properties.updated_at` |

**A `false` flag means "not stated".** Search may filter on `true` only. A filter such as `has_garden: false` would claim listings lack a garden when they simply did not say.

## Index mapping

The index lives in `api/src/app/ingestion/search-index/property-index-mapping.ts`, typed against the document, so a field added to the document without a mapping, or mapped without being in the document, fails to compile. `PropertyIndex.ensure()` creates the index when it is missing and checks it when it exists.

| Setting | Value | Why |
|---------|-------|-----|
| Name | `ES_INDEX`, default `homesage-properties` | Config, so tests and later versioned indexes can use another |
| Shards and replicas | 1 and 0 | One node and a few thousand documents. A replica could never be assigned on one node and would keep the index yellow |
| `dynamic` | `strict` | A document carrying an unmapped field is refused rather than guessed at |

| Field | Elasticsearch type |
|-------|--------------------|
| `id` | `keyword`, also the document `_id` |
| `text` | `text`, standard analyzer |
| `embedding` | `dense_vector`, `dims` from `EMBED_DIMENSIONS`, `similarity: cosine`, `index_options: { type: hnsw }` |
| `price`, `bedrooms`, `bathrooms`, `public_rooms`, `area_m2` | `integer` |
| `post_code`, `postcode_district`, `town`, `council_tax_band`, `property_kind`, `heating_type` | `keyword` |
| `has_garden`, `has_garage`, `has_off_street_parking`, `is_new_build` | `boolean` |
| `updated_at` | `date` |

Two choices that are easy to undo by accident:

* **The standard analyzer, not `english`.** The English analyzer drops "no" and "not" as stop words, so "No structural damage reported" would match a search for structural damage.
* **Plain `hnsw`, set explicitly.** Without `index_options`, Elasticsearch 8.19 quantises vectors to `int8_hnsw`. That saves memory a few thousand vectors do not need, and costs some recall.

### An index that does not match

When the index exists, its live mapping is compared field by field with the code's. Elasticsearch adds defaults of its own (HNSW's `m` and `ef_construction`), and those are not differences; a missing field, an extra field, a different type or setting, or `dynamic` other than `strict` are. Any difference stops the run before anything is written, with a message naming each difference, for example:

> Elasticsearch index "homesage-properties" does not match the property mapping: embedding.dims is 1536 in the index, expected 768. It was built for vectors of another size, and EMBED_DIMENSIONS is 768, so this model's vectors cannot go into it or search it. Nothing was written. The index is derived from MySQL, so delete it and run a full ingestion to rebuild it.

The index is never changed in place. To apply a new mapping or embedding model, delete the index and run a full ingestion. Versioned index names with an alias swap, so a rebuild does not take search offline, come later.
