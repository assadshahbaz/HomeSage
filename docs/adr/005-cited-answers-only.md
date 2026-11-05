# ADR 005: Every answer cites property ids, and uncited ids are stripped before it leaves the API

Status: Accepted. The structured output part is superseded by ADR 008
Date: 22 September 2026

## Context

A retrieval pipeline puts real rows in front of a model. It does not stop the model writing a sentence that is not in them, and in a streamed chat answer an invented fact is typographically identical to a true one. "Offers over 245,000 for a three bedroom semi in Cults" reads the same whether it came from row 1,234 or from the model's sense of what Aberdeen prices look like. The user has no way to tell, which means the interface is quietly asking them to trust prose.

This dataset makes the problem sharper than usual, because it is full of holes a fluent model will want to fill:

* There are no EPC ratings anywhere, only a flag saying whether a certificate exists. A question about an EPC band has no answer in this data, and a plausible band is easy to produce.
* A boolean flag set to false means the listing did not mention the feature, not that the property lacks it. A listing can leave out central heating while its questionnaire confirms it, so "this property has no garden" is a claim the data cannot make.
* Missing floor areas and council tax bands are NULL and are never imputed. The source project estimated both, and an estimate is not a fact, so nothing here fills a gap.
* Questionnaire text is free prose written by sellers. It is retrieved, so it is also a place where an instruction could be written and later read by a model.

The exposure is therefore wider than invented listings. It includes confident statements about properties that do exist, on questions this data cannot answer at all.

## Decision

An answer states facts only from the retrieved context, and every fact carries a citation in the form `[P-1234]`, where the number is the MySQL property id.

The answer model returns `{ answer, citedIds, confidence }` rather than free text. A `CitationGuard` then runs on every answer before it leaves the API. It is a pure function with its own unit tests, and it removes any cited id that was not in the retrieved set, logging a hallucination event with the request id. What reaches the client in `citedIds` is, by construction, a subset of what was actually retrieved.

Two supporting rules follow from the same reasoning. The prompt states plainly what this data cannot say, so the model declines rather than guesses, and says so when nothing matches. Retrieved property text is passed as delimited data and never merged into system instructions, because a sentence in a seller questionnaire is content, not a command.

## Alternatives considered

### Trust the prompt

Ask for citations, expect citations. It costs nothing and it mostly works, which is the trap. There is no runtime signal when it does not work, no number for how often, and the failure surfaces as a user quoting a price that does not exist. A guard turns "it usually cites" into something with a count attached.

### A second model call to judge groundedness

Feed the answer and the context to a cheap model and ask whether every claim is supported. Stronger than a guard in what it can catch, and rejected for the request path on two counts: it adds a model call, its latency and its cost to every answer, against a p50 budget of 4 seconds; and it checks the output of one language model with another, which is a weaker guarantee than a set membership test. It belongs in the eval harness, offline, where latency does not matter and a disagreement can be read by a human.

### Reject the whole answer when an unknown id appears

The strict reading, and it was considered. The common failure is a single stray id in an answer that is otherwise correct and useful, and throwing all of it away to punish one citation is worse for the user than dropping the citation. The event is logged either way, so a model that does this repeatedly still shows up.

### Verify each sentence against its cited row

The strongest option and the honest limit of this decision. It needs claim extraction, which is another model call and a hard problem in its own right. Recorded in the backlog rather than built now.

## Consequences

* The web app can render cited properties as cards without checking anything, because `citedIds` cannot contain an id that was not retrieved.
* The guard removes ids, not sentences. A claim whose citation was stripped stays in the text without one, so "no uncited claim survives" is a property of the prompt and the eval set, not something the guard alone can enforce. The M3 definition of done measures exactly that.
* A correctly cited but misread fact is not caught at all. The guard proves a citation points at a retrieved property, never that the sentence around it is true. The eval harness is where that gets measured.
* ~~The answer model has to produce structured output, so the streamed text and the citation list come from one parsed object rather than free prose.~~ Superseded by ADR 008: the answer streams as plain text with inline markers, and the citation list is derived from the guarded text.
* Hallucination events carry the request id, which turns a vague worry into a rate that can be watched and compared across prompt versions.
* The prompt carries an explicit list of what the data cannot support. That list is tied to the schema, so a schema change means a prompt change, and prompts are versioned so eval results stay comparable.

## Revisit when

A dataset with real listing descriptions arrives. Citations would then point at text a user can read and check for themselves, which changes what the guard has to prove.
