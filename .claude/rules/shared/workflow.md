# Workflow

## Before writing code

* Find the GitHub issue and its milestone. The milestone description holds the definition of done the issue is part of.
* Check what already exists for the area you are touching. Match the patterns already in the repo before inventing a new one, even if the new one looks slightly nicer on its own.
* Read the rule files for every layer the change touches.

## While writing code

* One logical change per branch and per PR, tied to one issue.
* Tests go in the same change as the code they cover.
* If a prompt, schema, index mapping or config shape changes, update the matching file in `docs/` in the same PR.
* A decision with real tradeoffs gets an ADR in `docs/adr/`.
* New ideas that are outside the current milestone go into `docs/backlog.md`, not into the branch.
* No new dependency without a stated reason in the PR description.

## Before calling it done

* Re-read the issue and check every requirement against what was built. "The code I set out to write is written" is not the same as done.
* Passing types, lint and mocked tests shows the code is consistent with itself. It does not show the feature works. Anything that touches MySQL, Elasticsearch, Redis or a model provider gets run for real at least once against the local Docker services, and the result is shown.
* Post the changes comment on the issue: what differed from the plan, and any follow ups. See "After review" in `.claude/skills/plan-issue/SKILL.md`.

## Git

* Branch names are the issue number followed by a short kebab case summary of the issue: `4-monorepo-scaffold`, `9-health-endpoint`.
* Conventional commits: `feat(sql): force LIMIT on generated queries`, `fix(retrieval): dedupe before RRF`.
* A commit message is the subject line only, with no body. The explanation of what changed and why goes in the PR description.
* One commit per issue branch. Follow up changes are amended into it.
* CI must be green before merge. Never skip hooks.
