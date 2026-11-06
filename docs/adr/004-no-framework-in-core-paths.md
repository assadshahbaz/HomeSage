# ADR 004: Call provider SDKs directly, no LangChain in the core paths

Status: Accepted
Date: 22 September 2026

## Context

Everything ADR 001 describes is a pipeline someone has already written a framework for. LangChain, LangGraph and LlamaIndex all ship a SQL agent, an Elasticsearch retriever, an ensemble retriever that does Reciprocal Rank Fusion, a citation chain and a streaming callback handler. Wiring those together would reach a working demo in a fraction of the time it takes to write them.

The catch is which parts they own. The pieces this project cannot afford to hand over are exactly the pieces a framework abstracts:

* The SQL path is safe because a generated query passes a validator and an allow list before it reaches a read only connection. A SQL agent that builds and executes a query in one call is the thing that guard exists to stand in front of.
* Every model call has to record model, input and output tokens, latency and cost. Per call accounting through a framework's callback system is indirect at best, and it is the only way the cost of a run is ever known.
* The streamed event order (route, retrieval, token, citations, done) is a wire contract defined with Zod in `api/src/contracts/` and compiled by both apps. A framework that owns the stream owns that contract.
* Retries, timeouts and the circuit breaker are behaviour under failure. Debugging them through a layer that was not written here means reading someone else's source anyway, with the added step of working out which version is installed.

There is a second reason, and it is not a technical one. This repository is meant to show that the mechanics are understood. A configured chain does not demonstrate that.

## Decision

Features call provider SDKs directly, behind interfaces owned by this codebase. No LangChain, LangGraph, LlamaIndex or comparable orchestration framework appears under `api/src/app/`.

Concretely: `LlmProvider` and `EmbeddingProvider` live in `core/` and name no implementation. `LlmService` is the only code that calls a chat model, and it is where timeouts, the circuit breaker, cost recording and tracing live. Provider choice happens once, in the owning module's factory, driven by config. Prompts are versioned markdown files next to the feature that owns them. Routing, fusion and the citation guard are plain functions with unit tests.

This is a rule about control flow, not about dependencies in general. The official provider SDK, the Elasticsearch client, `mysql2` and Zod are all dependencies and all fine. The line sits at anything that wants to own the shape of a request.

## Alternatives considered

### LangChain or LangGraph for the whole pipeline

The fastest route to something that answers questions, and the ecosystem is where the examples live. Rejected on control: it owns the hot path, it hides the SQL execution step behind an agent, and its abstractions move between minor versions, so an upgrade becomes a rewrite of code that was never really this project's to begin with. Every bug becomes a two layer investigation.

### LlamaIndex for ingestion and retrieval only

A narrower, more defensible version, and its document and node model is genuinely good. It is built around chunking long documents, and there is nothing to chunk here: one property is one short paragraph, already the right size to embed. The part that earns its keep does not apply, leaving an abstraction over a bulk upsert.

### The Vercel AI SDK for the streaming half

The most tempting of the three, because streaming and backpressure are fiddly and it handles them well. Rejected because the SSE event contract is already defined in `contracts/` and shared with the web app, and handing the wire format to a library would put it in permanent tension with the rule that the API owns every request and response shape.

## Consequences

* The orchestration is written here: retries, timeouts, the circuit breaker, streaming, token and cost accounting, RRF, the router contract. That is more code than the alternative, and all of it is unit testable without stubbing a framework's internals.
* Provider SDK changes land directly on this code. The blast radius is one adapter class per provider, and versions are pinned.
* Nothing comes for free from the ecosystem. The eval harness in M6 is written by hand rather than taken from a framework's evaluation module.
* Adding a second provider is one class implementing the interface plus a config value, with no wait for anyone else's integration to support it.
* Tests mock `LlmService` and nothing below it, because there is nothing below it but an SDK call.

## Revisit when

The product needs a real agent loop: a model choosing tools over several turns, with planning and backtracking. Hand writing that is a different proposition from hand writing a fixed pipeline, and the argument above would need making again rather than assuming.
