---
name: cleancode
description: Clean code checklist to run before and after writing code in this repo. Covers duplication, speculative abstraction, swallowed errors, typing and verifying real behaviour.
---

# Clean Code Checklist

Each rule is a smell to notice and the fix for it. When a rule and "do not over engineer" pull in different directions, the tie breaker is simple: would a reviewer flag this either way? If yes, fix it. If it is only taste, leave it.

## Duplication inside one function

If the same object shape or block appears twice in one function, only across branches (if/else, try/catch, switch cases), extract it straight away. That is one thing with a varying tail, not two similar things.

```ts
// smell: same fields twice, only the tail differs
try {
  const rows = await this.executor.run(sql);
  this.trace.record({ question, sql, model, attempt, status: 'ok', rowCount: rows.length });
} catch (error) {
  this.trace.record({ question, sql, model, attempt, status: 'failed', error });
  throw error;
}

// fix: build the shared part once, vary the tail
const entry = { question, sql, model, attempt };
try {
  const rows = await this.executor.run(sql);
  this.trace.record({ ...entry, status: 'ok', rowCount: rows.length });
} catch (error) {
  this.trace.record({ ...entry, status: 'failed', error });
  throw error;
}
```

The "rule of three" is for duplication across separate files and call sites. Inside one function, twice is already the smell.

## Duplication versus premature abstraction

Both are real risks and they pull against each other.

* Duplication across branches of one function: extract now, usually as a local variable, not a new class.
* Duplication across two separate call sites: usually fine to leave once. A third one is the trigger.
* A field, parameter, option or abstraction with no current caller: do not add it "for later". A second embedding provider interface method nobody calls, or a config flag nothing reads, is a cost paid for a future that may never arrive.

## Before calling a function done

* Does the same shape, condition or block appear twice in it? Extract.
* Does an error path repeat the happy path fields and vary only one or two? Extract the shared object and spread it.
* Any field, parameter or branch with no caller? Delete it.
* Guard clauses over nesting. Return early at the top instead of wrapping the body in `if (valid) { ... }`.
* Any swallowed error? A catch that logs or falls back must still let the caller know, unless the caller truly does not need to.
* Any `any`, explicit or from an untyped generic? Find the real type. Model SDK responses and ES client results often default to loose types; narrow them with the proper generic or a Zod schema.
* Type only imports for types, since decorator metadata can turn a value import into a runtime error.
* Any bare number that is really a limit or a timeout? Name it.

## Consistency over local optimisation

Before introducing a pattern, search for how the repo already solves the same kind of problem and match it, even if another approach looks slightly nicer in isolation. Every infra adapter has a health indicator; a new adapter without one looks like an oversight, not a choice, unless the reason is written down.

## Verify behaviour, not just types

Passing `tsc`, lint and mocked unit tests proves the code agrees with itself. It does not prove the feature works. Anything that touches MySQL, Elasticsearch, Redis or a model provider gets run for real at least once against the local Docker services, and the output is shown before it is called done. Mocks only exercise the control flow you already believe is right; they cannot catch a wrong index mapping, a vector dimension mismatch or a SQL dialect quirk.

## Comments

* No comment that restates the code. If deleting it would confuse nobody, do not write it.
* A comment is earned by a non obvious reason: a hidden constraint, a workaround, an invariant you cannot see from the line itself. Put the reason where the code is, not a pointer to a doc.
