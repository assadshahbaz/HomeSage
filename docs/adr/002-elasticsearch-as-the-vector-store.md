# ADR 002: Elasticsearch holds the vectors and the keyword index

Status: Accepted
Date: 22 September 2026

## Context

ADR 001 commits to a semantic path, so the vectors need somewhere to live. The shape of the job:

* A few thousand documents at most, one per listing, each a short paragraph built from structured columns plus questionnaire answers. At 1,024 dimensions that is roughly 18 MB of float32. This is a small index by any measure.
* Exact tokens matter as much as meaning. "AB15", "Kingswells", "Stonehaven", "Cults" are the words people actually type, and an embedding blurs a postcode district into the general idea of a postcode district. Lexical matching is not a fallback here, it is half the retrieval quality.
* The semantic path still needs to respect hard filters on price, bedrooms, town and the boolean flags, applied as a pre filter so kNN searches the right subset rather than returning ten neighbours that are then all filtered away.
* MySQL 8.4 has no vector type and its full text ranking is not competitive for this, so the index cannot simply live next to the data in the source of truth.

The choice is really about how many stores this needs. Fusing ranks across engines is only sane when both rankings come from the same document set, and every extra store is another thing to run locally, to provision on Render and to keep in sync with MySQL.

## Decision

Elasticsearch 8 is the retrieval index, and it holds both representations of every property document.

One index, one document per property, keyed by the MySQL property id. The mapping carries `embedding` as a `dense_vector` with cosine similarity and an HNSW index, `text` as an analysed field for BM25, and the filterable facts as `keyword`, `integer` and `boolean` fields. kNN and BM25 therefore run over exactly the same documents with the same filters applied, and RRF fuses their two rankings.

The vector dimension comes from config and has to match the embedding model. A model change means a new versioned index, a full rebuild and an alias swap. The mapping is never edited in place.

## Alternatives considered

### A dedicated vector database (Qdrant, Weaviate, Pinecone)

Better ergonomics for the vector half and, in Pinecone's case, nothing to run locally. All of them treat lexical search as a secondary feature or leave it out, so the keyword half would come from a second engine, and the fusion in ADR 001 would then span two systems with two copies of the corpus and two sync paths. Pinecone also puts a network hop and an account in the middle of a stack that otherwise comes up with one `docker compose up`.

### Postgres with pgvector

A genuine single store answer, and the one to pick if the relational database were already Postgres. It is not. The data arrives as a SQL Server dump, the source of truth is MySQL, and adding Postgres would mean two relational engines side by side for the sake of an extension. `tsvector` ranking is also a weaker lexical match than BM25 with real analysers.

### An in process index (hnswlib, FAISS, or a brute force scan)

Worth taking seriously at this size. A few thousand vectors is small enough that a flat cosine scan in Node would answer in single digit milliseconds with no dependency at all. It loses on everything around the search: the index dies with the process and has to be rebuilt at every boot, there is no BM25, filters become hand written array passes, and nothing works once a second instance exists. It would trade a container for a pile of retrieval code that has to be correct.

### MySQL full text search alone, no vectors

Would remove a service entirely. It also removes the semantic path, which is the reason ADR 001 exists.

## Consequences

* Elasticsearch runs in the local Docker stack and has to be provisioned in production. It is the heaviest service here, with 1 GB of JVM heap reserved locally, for an index measured in tens of megabytes. That is the price of getting kNN, BM25 and filters from one place.
* Another service means another failure mode. The degraded path in ADR 001 exists because of this one: Elasticsearch down means SQL only results and a flag on the response, never a 500.
* The embedding model and the index mapping are coupled through the dimension count. Changing `EMBED_MODEL` without changing the index is a class of bug the config validation has to catch at boot, and the recovery is always a rebuild, which ADR 003 makes cheap.
* kNN and BM25 scores are not on a comparable scale, so results are fused by rank, never by blending scores. This is a constraint on the retrieval code, not a preference.
* Retrieval tests run against a real Elasticsearch in Testcontainers. A mocked client would pass while the mapping is wrong, which is the failure most likely to happen.

## Revisit when

The corpus grows by an order of magnitude, or a second dataset with different fields arrives. Both change the calculation that made one general purpose index the cheap answer.
