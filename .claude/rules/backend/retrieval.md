---
paths:
  - "api/src/app/retrieval/**/*"
  - "api/src/app/embeddings/**/*"
  - "api/src/app/ingestion/**/*"
  - "api/src/infra/elasticsearch/**/*"
---

# Retrieval, Embeddings and Ingestion

MySQL is the source of truth. The Elasticsearch index is derived from it and can be deleted and rebuilt at any time. Nothing is ever written to ES that could not be rebuilt from MySQL.

## Property document

`PropertyDocumentBuilder` turns one property row plus its joined data into a readable paragraph for embedding and BM25:

> 3 bedroom, 2 bathroom home at 20 Larkfield Rise, Eastholm, Aberdeen AB21 9CK. Asking price £229,000. Floor area 97 m², council tax band E. Garden, garage and off street parking. Gas central heating. Parking: in the driveway. Windows replaced in 2021 under a ten year warranty.

* The data has no listing descriptions, so the paragraph is built from structured fields plus the questionnaire answers that carry detail. See `docs/data.md` and `docs/schema.md` for what each column really means.
* Handle nulls explicitly. Leave a missing fact out; never write "null", "unknown" or "N/A" into the text.
* A listing flag of 0 means "not stated", not "no". Only positive flags go into the text.
* Estimated values (such as an imputed floor area) never go into the text.
* Output is deterministic for the same row so golden string tests stay stable.
* Hard facts that users filter on (price, bedrooms, bathrooms, district, town, council tax band, key flags) also go into metadata fields, so kNN can be pre filtered instead of relying on the vector to understand a number.

## Index mapping

| Field | Type | Purpose |
|-------|------|---------|
| `id` | keyword | Property id, also the document `_id` |
| `text` | text | Built paragraph for BM25 |
| `embedding` | dense_vector, cosine, HNSW | Semantic search |
| `price`, `bedrooms`, `bathrooms`, `public_rooms`, `area_m2` | integer | Filters |
| `post_code`, `postcode_district`, `town`, `council_tax_band`, `property_kind`, `heating_type` | keyword | Filters |
| `has_garden`, `has_garage`, `has_off_street_parking`, `is_new_build` | boolean | Filters |
| `updated_at` | date | Sync tracking |

The vector dimension comes from config and must match the embedding model. A model change means a new versioned index, a full rebuild and an alias swap, never an in place change.

## Embeddings

* Callers depend on the `EmbeddingProvider` contract. No feature imports a provider SDK directly.
* Batch requests (around 100 texts), retry with exponential backoff on rate limits and transient errors.
* Record tokens and cost for every run.

## Ingestion

* `npm run ingest -- --full` and `npm run ingest -- --since <timestamp>`.
* Upserts keyed by property id, so reruns never duplicate.
* Resumable: progress is checkpointed and a crashed run continues where it stopped.
* A document that fails goes to the dead letter log and the run carries on.

## Retrieval

* SQL retrieval and kNN run in parallel.
* Results merge with Reciprocal Rank Fusion, dedupe by property id, keep the top 8. RRF is a pure function with its own unit tests.
* If ES is unavailable, return SQL only results and flag the response as degraded. Never a 500 for this.

## Tests

* Document builder: golden string tests, including rows with missing fields.
* Ingestion: running twice produces the same index with no duplicates.
* Search: integration tests against Elasticsearch in Testcontainers, not a mock.
