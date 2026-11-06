# MySQL schema

The `homesage` database holds two tables of made up listings, both filled by `npm run db:seed`. The schema itself lives in `api/tools/seed/schema.sql`, and `docs/data.md` explains how the listings are generated.

This file is the description fed into the text to SQL prompt, and the SQL allow list is derived from it, so it has to stay accurate. Update it in the same change as any schema change, and keep every column name spelled exactly as the migration spells it.

## What the data can and cannot say

Read this before writing a query or a prompt.

* **A `false` flag means the listing did not mention it, not that the property lacks it.** Never answer "this property has no garden" from `has_garden = 0`.
* **`unknown` in a disclosure means the seller did not answer.** It is not a no, and it is the default for every listing that has no questionnaire row at all.
* **Nothing is estimated.** A missing floor area or council tax band is `NULL`, never filled in from a guess.
* **There are no EPC ratings** anywhere. `epc_available` only says whether a certificate exists. A question about an EPC band cannot be answered from this data.
* **There is no pet, smoking or furnishing policy.** "Pets allowed" is unanswerable.
* **There are no coordinates.** Location questions can use `post_code`, `postcode_district` or `town` only. "Near the university" cannot be a SQL filter.
* **The data never changes on its own.** See "Timestamps" below for what `updated_at` really means.
* **Not every listing is a home.** Use `property_kind` to keep plots and commercial units out of answers about homes, and read the warning on that column before trusting it.
* **Only some listings have a questionnaire.** About two thirds do, so a join that filters on a disclosure column silently drops the rest.

## Table: properties

One row per listing. Ids are whole numbers with a few gaps, which are the repeated addresses the seed drops.

The "SQL" column says whether the column is on the text to SQL allow list.

| Column | Type | Null | Meaning, units and example values | SQL |
|--------|------|------|-----------------------------------|-----|
| `id` | INT UNSIGNED, PK | no | The listing id, cited as `[P-1]` | yes |
| `full_address` | VARCHAR(255) | no | Street address, town and postcode as listed: "20 Larkfield Rise Eastholm, Aberdeen, AB21 9CK". There is no separate street or house number | yes |
| `post_code` | VARCHAR(10) | yes | Full postcode: "AB21 9CK". Null where the listing held no postcode | yes |
| `postcode_district` | VARCHAR(5) | yes | Outward code taken from `post_code`: "AB15" | yes |
| `town` | VARCHAR(60) | yes | Matched against a fixed list of known towns, so never free text. Null where no known town appears in the address | yes |
| `price` | INT UNSIGNED | no | Asking price in whole pounds | yes |
| `area_m2` | SMALLINT UNSIGNED | yes | Floor area in whole square metres. Null means the listing gave no area | yes |
| `council_tax_band` | CHAR(1) | yes | Scottish band, `A` to `H`. Null where the listing said `NA`, `none` or `TBC` | yes |
| `bedrooms` | TINYINT UNSIGNED | yes | Count. Null mostly on plots and commercial units | yes |
| `bathrooms` | TINYINT UNSIGNED | yes | Count | yes |
| `public_rooms` | TINYINT UNSIGNED | yes | Lounges, dining rooms and similar | yes |
| `property_kind` | ENUM('residential','plot','commercial','other') | no | What the listing is. Derived while loading, not a listing field. See the warning below | yes |
| `house_floor` | TINYINT UNSIGNED | yes | Listed as 1 or 2 with no definition. It is probably storeys, not the floor a flat sits on | no |
| `has_garage` | BOOLEAN | no | Stated on the listing | yes |
| `has_double_garage` | BOOLEAN | no | Stated on the listing | yes |
| `has_garden` | BOOLEAN | no | Stated on the listing | yes |
| `has_land` | BOOLEAN | no | Paddocks, fields and similar | yes |
| `has_central_heating` | BOOLEAN | no | Under reported, so prefer `property_disclosures.central_heating` | yes |
| `is_parking_available` | BOOLEAN | no | Parking of any sort | yes |
| `has_on_street_parking` | BOOLEAN | no | Stated on the listing | yes |
| `has_off_street_parking` | BOOLEAN | no | Stated on the listing | yes |
| `has_ground_floor_bedroom_bathroom` | BOOLEAN | no | The closest thing the data has to an accessibility signal | yes |
| `has_granny_flat` | BOOLEAN | no | Stated on the listing | yes |
| `has_green_energy` | BOOLEAN | no | Solar, heat pump or similar. The kind is not recorded | yes |
| `has_electric_vehicle_charge_point` | BOOLEAN | no | Stated on the listing | yes |
| `is_self_contained` | BOOLEAN | no | Stated on the listing | yes |
| `is_new_build` | BOOLEAN | no | Stated on the listing | yes |
| `is_development` | BOOLEAN | no | Stated on the listing | yes |
| `is_development_opportunity` | BOOLEAN | no | Stated on the listing | yes |
| `created_at` | TIMESTAMP | no | When the seed first wrote this row. Not a listing date | no |
| `updated_at` | TIMESTAMP | no | When the seed last changed this row. Not a listing date. Drives incremental ingestion | no |

Indexes: `idx_properties_price`, `idx_properties_bedrooms`, `idx_properties_district`, `idx_properties_kind`, `idx_properties_town`, `idx_properties_updated_at`, one column each. `property_disclosures` has its primary key only.

**`property_kind` is a keyword guess, not a fact.** The cleaning code reads the address. A commercial word (`commercial`, `premises`, `shop`, `retail`, `office`, `unit` followed by a digit, `public house`, `hotel`) wins first, then a plot word (`plot`, `site of`, `site at`, `land at`, `development site`, `steading`). A listing with no bedroom count and neither keyword becomes `other`, and everything else is `residential`. So a house on Commercial Wharf is filed as `commercial`, and a converted steading with five bedrooms is filed as `plot`. Use it to exclude obvious non homes, never to state what a property is.

## Table: property_disclosures

One row per listing that has a seller questionnaire.

The answers are written as free text and normalised by the cleaning code in `api/tools/seed/`. Every answer column is one of `yes`, `no`, `unknown` and `not_applicable`, is never null, and defaults to `unknown`. Those four columns are written as "ENUM answer" below.

| Column | Type | Null | Meaning, units and example values | SQL |
|--------|------|------|-----------------------------------|-----|
| `property_id` | INT UNSIGNED, PK, FK | no | Join key to `properties.id`, cascades on delete | yes |
| `heating_type` | ENUM('gas','oil','electric','none','other') | yes | Bucketed from many raw spellings: `gas` includes "gas fired" and "gch", `electric` includes storage heaters | yes |
| `parking_arrangements` | TEXT | yes | The seller's own words: "Own driveway with room for one car". Good embedding text, poor filter text | no |
| `ownership_months` | SMALLINT UNSIGNED | yes | How long the seller owned the property, in months. Null where the answer was a start date such as "Since 1997" rather than a duration | yes |
| `conservation_area` | ENUM answer | no | The seller's answer | yes |
| `listed_building` | ENUM answer | no | The seller's answer | yes |
| `windows_replaced` | ENUM answer | no | The seller's answer | yes |
| `central_heating` | ENUM answer | no | More reliable than `properties.has_central_heating` | yes |
| `maintenance_contract` | ENUM answer | no | A supplier name in the answer counts as yes | yes |
| `epc_available` | ENUM answer | no | Whether a certificate exists, not a rating | yes |
| `structural_damage` | ENUM answer | no | Storm, flood and leak damage | yes |
| `asbestos` | ENUM answer | no | Usually outbuildings | yes |
| `gas_supply` | ENUM answer | no | The seller's answer | yes |
| `water_supply` | ENUM answer | no | The seller's answer | yes |
| `electricity_supply` | ENUM answer | no | The seller's answer | yes |
| `mains_drainage` | ENUM answer | no | A no usually means a septic tank | yes |
| `telephone_line` | ENUM answer | no | Whether a line exists | yes |
| `broadband` | ENUM answer | no | The seller's answer | yes |
| `cable_tv` | ENUM answer | no | Cable or satellite | yes |
| `shared_cost_responsibility` | ENUM answer | no | Shares the cost of common repairs. Mostly flats | yes |
| `major_roof_repairs` | ENUM answer | no | The seller's answer | yes |
| `common_building_insurance` | ENUM answer | no | The seller's answer | yes |
| `other_regular_charges` | ENUM answer | no | Factor fees and similar | yes |
| `specialist_work` | ENUM answer | no | Damp, rot or roof work | yes |
| `guarantee_available` | ENUM answer | no | The seller's answer | yes |
| `boundaries_moved` | ENUM answer | no | The seller's answer | yes |
| `received_notices` | ENUM answer | no | Mostly neighbouring planning applications | yes |
| `public_right_of_way` | ENUM answer | no | Shared paths and driveways | yes |
| 24 `*_detail` columns | TEXT | yes | The seller's own sentence, kept only where it said more than yes or no: "Yes, every window changed to double glazing around 2010" | no |
| `gas_supplier` | VARCHAR(100) | yes | Company name | no |
| `electricity_supplier` | VARCHAR(100) | yes | Company name | no |
| `water_supplier` | VARCHAR(100) | yes | Company name | no |
| `broadband_supplier` | VARCHAR(100) | yes | Company name | no |
| `heating_supplier` | VARCHAR(100) | yes | Company name | no |
| `cable_tv_supplier` | VARCHAR(100) | yes | Company name | no |
| `created_at` | TIMESTAMP | no | When the seed first wrote this row. Not a listing date | no |
| `updated_at` | TIMESTAMP | no | When the seed last changed this row. Not a listing date. Drives incremental ingestion | no |

Each `*_detail` column is named after its answer column, so `asbestos` pairs with `asbestos_detail`. The detail only ever explains an answer, and it is never the answer on its own.

The 24 detail columns in full, in table order: `conservation_area_detail`, `listed_building_detail`, `windows_replaced_detail`, `central_heating_detail`, `maintenance_contract_detail`, `epc_available_detail`, `structural_damage_detail`, `asbestos_detail`, `gas_supply_detail`, `water_supply_detail`, `electricity_supply_detail`, `mains_drainage_detail`, `telephone_line_detail`, `broadband_detail`, `cable_tv_detail`, `shared_cost_responsibility_detail`, `major_roof_repairs_detail`, `common_building_insurance_detail`, `other_regular_charges_detail`, `specialist_work_detail`, `guarantee_available_detail`, `boundaries_moved_detail`, `received_notices_detail`, `public_right_of_way_detail`.

## Relationships and join keys

There is one relationship. `property_disclosures.property_id` is both the primary key of that table and a foreign key to `properties.id`, with `ON DELETE CASCADE`.

* The join is always `properties.id = property_disclosures.property_id`.
* It is one to zero or one. Not every listing has a disclosure row, and no disclosure row exists without a listing.
* Use `LEFT JOIN property_disclosures d ON d.property_id = p.id` by default. An `INNER JOIN` narrows the result set to the listings with a questionnaire without saying so.
* A `LEFT JOIN` followed by a disclosure condition in `WHERE` is an inner join again, because the condition drops the null rows. Whether that is right depends on what the question asks for a seller's answer:
  * **To filter on it** ("homes where the seller says the heating is oil"). The condition belongs in `WHERE`, and dropping listings with no questionnaire is correct, since nobody confirmed the fact for them.
  * **Only to show it** ("3 beds in AB15, and show their heating where known"). `LEFT JOIN` with no condition on the disclosure table in `WHERE`, not even `IS NOT NULL`. Listings with no questionnaire stay in the result with `NULL` for the answer; filtering here would silently drop them.
* A condition in the `ON` clause of a `LEFT JOIN` never drops listings, only the answers that do not match, so it suits neither case above by itself.
* Nothing else joins. There is no lookup table, no agent table and no geography table.

## What a property card shows

`propertySummarySchema` in `api/src/contracts/property.contract.ts` is the shape a property card is drawn from, read from a listing's row with a `LEFT JOIN` to its questionnaire for `heatingType`. It carries `full_address` as `address`, the price, the four counts, town, district, council tax band, and ten feature flags: garden, land, garage, double garage, off street parking, EV charge point, ground floor bedroom and bathroom, granny flat, green energy and new build. A card shows a flag only when it is true, never as a no.

Left out on purpose: `property_kind` (a guess from the address, never a fact), `has_central_heating` (badly under reported; `heating_type` from the questionnaire says more), `is_parking_available` (the two parking flags cover it), and `is_self_contained`, `is_development` and `is_development_opportunity`, whose meaning the data never documented.

## Router filter values

The router reads `SELECT DISTINCT town` and `SELECT DISTINCT postcode_district` once, on the first question, and keeps them for the life of the process. They go into the router prompt as the only places it may name, and a town or district the model names anyway that is not among them is dropped from the filters and logged. Towns are matched ignoring case and come back in the spelling stored here; districts are matched in capitals.

## SQL allow list

The validator rejects any table or column that is not listed here, because a generated query will otherwise invent columns that sound plausible. The allow list is derived from this file in one place, `api/src/app/sql/validation/sql-allow-list.ts`, and shared by the validator and the prompt builder. Its spec parses the two tables above and fails when a column is on the allow list but not marked `yes` here, or marked `yes` here and missing from the allow list.

Tables on the allow list: `properties` and `property_disclosures`. Nothing else, including anything in `information_schema`, `mysql` or `performance_schema`.

Columns on the allow list: every column marked `yes` in the two tables above. That is all of `properties` except `house_floor`, `created_at` and `updated_at`, and all of `property_disclosures` except the 24 `*_detail` columns, `parking_arrangements`, the six supplier columns and the two timestamps.

Columns that never go on the allow list, and why:

| Column | Why not |
|--------|---------|
| `properties.house_floor` | Nothing documents what it counts. A filter on it reads as "which floor the flat is on" and answers a different question from the one the number supports |
| `created_at` and `updated_at` on both tables | Our own write timestamps. A model given a date column will use it as the listing date and claim a property came to market yesterday |
| The 24 `*_detail` columns | Free text that a `LIKE` cannot search reliably. They belong to the Elasticsearch document, and the answer column beside each one already carries the fact |
| `property_disclosures.parking_arrangements` | The same reason, with many phrasings of the same few arrangements. `is_parking_available`, `has_off_street_parking` and `has_on_street_parking` are the filterable form |
| The six supplier columns | One supplier can be spelled several ways, so an equality filter misses rows and a `LIKE` filter guesses. They are display and embedding text |

Those columns still exist and the retrieval path and property cards read them. The restriction applies to generated SQL only.

## Timestamps

The data carries no listing date, no first seen date and no updated date. Nothing can say when a listing appeared or how long it has been on the market, and no answer should imply otherwise.

`created_at` and `updated_at` belong to the seed. It upserts with `ON DUPLICATE KEY UPDATE`, so:

* A first run sets both columns to the time of that run.
* A rerun over the same listings writes identical values back. MySQL counts a row whose values did not change as untouched, so `updated_at` keeps its old value and an unchanged rerun looks unchanged.
* A rerun over changed listings moves `updated_at` on the rows that really changed, and only those.

That is what makes `npm run ingest -- --since <ts>` work. The rows with an `updated_at` after the last sync are exactly the rows Elasticsearch needs again, and `idx_properties_updated_at` serves that query.

Three details keep a sync from missing a row:

* **The bound comes from the database's clock.** Every ingestion run ends by printing `next --since`: MySQL's `NOW()`, taken just before the run started reading. A row changed while the run was reading is at or after it. A full run that resumes reports the bound its first attempt recorded, not the moment it resumed.
* **The comparison is `updated_at >= since`.** The column has second precision, so a row changed in the same second the bound was taken would slip past a strict `>`. At worst a row is indexed twice, which is harmless since documents are upserted by id.
* **Times are UTC end to end.** The API's pool reads and writes `TIMESTAMP` values as UTC and sets each session to UTC. Without that, the driver reads them as the machine's local time, and on a machine an hour off UTC every `updated_at` is an hour off, and so is the bound. `--since` refuses a timestamp without a zone for the same reason.

## Personal data

The cleaning code refuses personal data even though these listings are made up: anything that looks like a phone number is never stored, and free text showing signs of naming a person is dropped. The answer column beside it still carries the fact that matters.
