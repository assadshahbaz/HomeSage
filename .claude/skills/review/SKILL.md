---
name: review
description: Review a GitHub pull request against its issue, milestone and the repo's rules.
---

# Review a Pull Request

## Before looking at the diff

1. Run `gh pr view <n>` and read the base branch.
2. `git fetch origin <base>` if the local copy may be stale.
3. Use `origin/<base>...HEAD` (three dots) as the base for every `git diff` and `git log` in the review.

Work out the base branch fresh for each PR.

## Review

* Read the PR description and comments for testing instructions. Do not run them, but check them for gaps or logical mistakes.
* If the PR and the prompt name different issue numbers, point out the mismatch.
* Read the linked issue, any plan comment on it and the milestone description. Check every requirement against the diff and list any that are missing or changed.
* Load the rule files for every layer the diff touches and check the change follows them.

## HomeSage specific checks

* Any new path from user input or model output to MySQL goes through the SQL validator.
* Every answer path still goes through the citation guard.
* Prompt changes are new version files, not edits in place.
* Request and response shapes live in `api/src/contracts/`, the web app imports them through `@api/contracts`, and nothing is redeclared on the web side.
* New outbound calls have a timeout and a health or failure story.
* Tests cover the rejection and fallback paths, not only the happy path.
* If retrieval or prompts changed, eval numbers are included in the PR.

Beyond that, review as you normally would for correctness, clarity and fit with the issue.
