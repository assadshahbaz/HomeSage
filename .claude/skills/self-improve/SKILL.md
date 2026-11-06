---
name: self-improve
description: A task was done poorly. Reflect on what went wrong, why, and what change to the rules, memory or process would prevent it next time.
---

# Reflect and Improve

A task was done poorly. Work out what went wrong, where things left the expected path, how that affected the rest of the task and what should change for next time. Treat this as an investment: trace each piece of information to its source so the same mistake is not repeated.

## Gather context

* Follow the full issue chain: the issue, any plan comment on it, linked issues and the milestone.
* Read the PR diff to see what was actually built.
* Read the PR review comments.
* Re-read the original requirements in full instead of relying on memory.
  * In a new session, ask the user for the issue or PR number and what went wrong.
  * In the same session, the conversation is context, but still re-read the source material fresh.

## Scope the failure

First list what went right. That sets the baseline and stops over correction. The rest of the analysis covers only the gap between what was delivered and what was expected.

## Analysis

### Project rules

1. Which rule files were loaded for the task?
   1. Were they the right ones?
   2. Did anything in them push the task in the wrong direction?
   3. What was missing that would have helped, and where should it live?
2. Which rule files were not loaded but would have helped? Skip this if none apply.

### The request

* Assume the request was free text, so misreading was possible.
* Note useful information that was missing from it.
* Note anything in it that added noise.
* Note any answers to clarifying questions that led the wrong way.

### Requirements

If the task came from an issue:

* Point out ambiguities and missing acceptance criteria.
* Point out requirements scattered across issue, comments and linked issues.

List every discrete requirement and mark each one as done correctly, done incorrectly (how), missed (why) or deferred (and whether that was said).

### Implementation versus verification

* Which requirements were known at the start but dropped along the way?
* When did scope narrow, for example after a hard sub problem took all the attention?
* Was "done" judged against the full requirement list or against "the code I planned is written"?
* Where would a re-read of the requirements have caught the miss?

For each, say whether a process change (such as a requirements re-check before opening the PR) would have prevented it.

## Output

1. **Category**: missed requirement, wrong interpretation, rule gap, scope creep, tooling issue or communication gap.
2. **Root cause**: two or three sentences.
3. **Detailed analysis** following the sections above.
4. **Memory update**: if a finding should persist, save it and tell the user.
5. **Rule changes**: exact text for the change and where it goes (the root context file, a file under `.claude/rules/`, or a skill). Project level files only.
6. **Process check**: if the failure was procedural, a specific checklist item to add.
