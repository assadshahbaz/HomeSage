# The chat stream

`POST /chat` answers with a server sent events stream. This page describes the wire format. The schemas are the source of truth: `api/src/contracts/chat.contract.ts`, whose design is recorded in ADR 008.

## Request

```json
{ "question": "2 bed flats in AB24 with a garden", "sessionId": "2f1c9a4e-8b7d-4c3a-9e6f-1a2b3c4d5e6f" }
```

* `question` is trimmed and between 1 and 500 characters, the same rule as `POST /sql`.
* `sessionId` is a UUID the browser makes once and keeps. It keys the conversation memory, which holds the last three turns for 30 minutes after the most recent one.

## Framing

Each event is one SSE message: an `event:` line naming its type, and a `data:` line holding the whole event as JSON, `type` included, so a client parses `data` with `chatEventSchema` and needs nothing from the `event:` line.

```
event: token
data: {"type":"token","text":"Two flats match [P-496]"}

```

Heartbeats are SSE comment lines (starting with `:`), sent every 15 seconds while the stream is open. Clients ignore them.

## Before the stream opens

A body that does not match the request schema is a `400` and a caller over the per IP limit is a `429`, both as ordinary JSON errors. `POST /chat` has its own rate limit counters, apart from `POST /sql`. Once the `200` and the event stream headers have gone out, every failure is an `error` event instead, with the fixed message "Something went wrong while answering. Please try again." The cause goes to the logs with the request id, never to the client.

A client that closes the connection stops the turn: the API stops writing and the model stream behind it is aborted.

## Events

| `type` | Carries | When |
|--------|---------|------|
| `route` | `intent`, `filters` as applied, `standaloneQuestion`, `fallback` | First, always |
| `retrieval` | `kind: 'properties'` with up to 8 `PropertySummary` objects and `ranking`, or `kind: 'aggregate'` with `sql`, `values` and `listingCount`, or `kind: 'none'` with a `reason` | After `route`, unless the question is out of scope |
| `token` | `text`, already through the citation guard | One or more, as the answer is written |
| `citations` | `kind: 'properties'` with `ids` in order of first citation, or `kind: 'aggregate'` with `sql` and `listingCount` | After the last token |
| `done` | nothing | Last event of an answered stream |
| `error` | `message`, safe to show | Instead of any event after the stream opens; nothing follows it |

`ranking` says how the properties were put in order: `fused` when they were merged from every search that ran with Reciprocal Rank Fusion, or `sql_order` when the question asked for an order ("the five cheapest") and the SQL's order was kept without fusion. When the SQL computes an aggregate, the retrieval is `kind: 'aggregate'` and no property is retrieved, even for a hybrid question.

`kind: 'none'` means retrieval left nothing to answer from, and `reason` says why. `no_match` means every search ran and no listing met the question. `search_failed` means a search could not finish (it timed out, failed, or the SQL was declined or refused), so whether anything matches is unknown. A failed search that still left properties gives `kind: 'properties'` and an answer from those.

`fallback` is null when the router read the question. When the router timed out, the provider failed, or its reply could not be read or did not fit the schema, it is `timeout`, `provider_error`, `parse_failure` or `schema_failure`, and the question went to hybrid search as asked, with only the default filters.

Token text carries citation markers inline: `[P-3501]` for a property, `[SQL]` for an aggregate result. A marker only reaches the client when it is valid for the turn, always in that plain form, so a client can turn every marker it sees into a link.

## Order

* **An answer:** `route`, `retrieval`, `token` events, `citations`, `done`.
* **Nothing to answer from:** `route`, `retrieval` with `kind: 'none'`, one fixed token, an empty `properties` citation, `done`. The answer model is not called. For `no_match` the token names the filters that were applied, such as "in Westhill, up to £50,000", so the user can loosen one. For `search_failed` it says the search could not finish, and never that nothing matched.
* **Out of scope:** `route` with `intent: 'out_of_scope'`, the decline as tokens, an empty `properties` citation, `done`. There is no `retrieval`.
* **A failure:** any of the above cut short by one `error` event.

The schemas check each event on its own. The order is the consumer's to enforce, and a stream that ends without `done` or `error` counts as failed.

## Example

```
event: route
data: {"type":"route","intent":"hybrid","filters":{"postcodeDistricts":["AB24"],"hasGarden":true,"propertyKinds":["residential"]},"standaloneQuestion":"2 bed flats in AB24 with a garden","fallback":null}

event: retrieval
data: {"type":"retrieval","kind":"properties","properties":[{"id":"496", ...}, {"id":"1142", ...}],"ranking":"fused"}

event: token
data: {"type":"token","text":"Two flats match. Flat B, 21 Ashlar Crescent has a garden and "}

event: token
data: {"type":"token","text":"a ground floor bedroom and bathroom [P-496]."}

event: citations
data: {"type":"citations","kind":"properties","ids":["496"]}

event: done
data: {"type":"done"}

```

The web app keeps full example streams as test fixtures in `web/src/app/chat/chat-stream.fixture.ts`, checked against the schemas by a spec.
