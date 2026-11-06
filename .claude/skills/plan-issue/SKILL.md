---
name: plan-issue
description: Plan a GitHub issue before implementation. Post a structured, security first plan as an issue comment for review before any code is written.
---

# Plan an Issue

## When to use

Before real work on a non trivial issue: anything spanning more than one file or layer, or adding a new endpoint, index, prompt, schema or UI flow. Skip it for a one line fix or a cosmetic tweak.

The output is a plan only. Do not create branches, sub issues, milestones or code while running this. Those come after the plan is reviewed and the user asks to proceed.

## Before writing

1. Read the issue in full: description, labels, milestone and comments (`gh issue view <n> --comments`).
2. Read the milestone description. It carries the definition of done this issue is part of.
3. Follow any linked issues rather than relying on a summary.
4. Look at what already exists in the codebase for the area. The plan builds on real code.
5. Load the rule files for every layer the plan touches, so the plan matches existing conventions instead of inventing new ones.

## Plan structure

Fixed order, data and backend first, tests last:

1. **Data**: MySQL schema changes (through migrations only), Elasticsearch mapping changes, allow list updates, `docs/schema.md` updates. Assume the frontend can be bypassed entirely.
2. **Backend**: shared Zod contracts, services, controllers, prompts (new version files), validation, error handling, rate limits, tracing. Also treated as the security boundary.
3. **Frontend**: components, store changes, resources, UX. Client validation is user experience only and never the only place a rule is enforced. Say so in the plan.
4. **Evals**: which golden questions are added or affected, and which metric could move.
5. **Tests**: always last. A concrete list per module touched, not a generic "add tests".

Only include a UI mockup when the issue is purely UI work.

Add a **Scoping note** near the top, outside any collapsed section, whenever the issue's boundaries or relationship to another issue are unclear. State the assumption and invite correction rather than blocking.

## Security checklist (Data and Backend sections)

* No path from user input or model output to MySQL skips the SQL validator.
* Router filters are bound as parameters, never concatenated.
* User text and retrieved text stay delimited and out of system instructions.
* Every answer path goes through the citation guard.
* New endpoints have rate limits and a size limit on the body.
* Nothing secret reaches logs, traces or responses.

## Formatting

* Open the comment with one line marking it as a draft for review: `> **Implementation plan (draft for review)**`.
* Wrap each major section in a collapsible block:

  ```markdown
  <details>
  <summary><strong>Backend</strong></summary>

  ...

  </details>
  ```

* Short snippets only (a schema shape, one validator rule). Prefer bullet lists of what will exist over pasted code.

## Posting

Post the plan as one comment on the issue: `gh issue comment <n> --body-file <file>`. Do not open issues, edit milestones or touch code as part of this skill.

## After review

Two more comments on the issue keep a record of what was decided and what was built.

1. **The approval comment**, posted once the plan is approved and before any code. List each decision the plan left open and the answer it got, one line each. If the plan was approved as written, one line saying so is enough.
2. **The changes comment**, posted when the PR merges. List what was built differently from the plan and why, and any follow up written into another issue or `docs/backlog.md`, with its link. If nothing changed, say so in one line.

Keep both short. They are a record, not a second plan.
