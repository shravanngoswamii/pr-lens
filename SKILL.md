---
name: review-docs
description: Create source-linked interactive HTML design reviews from pull requests, including selected type relationships, call paths, behavior comparisons and review findings.
---

Produce an editable JSON document and a standalone HTML review.
Use the renderer in this skill's checkout for presentation.
The agent is responsible for the analysis and evidence.
Read [the format](docs/format.md) before writing JSON and [setup](README.md#use) if the commands are not installed.
Resolve commands and supporting paths relative to this SKILL.md, not the target repository.

## Inspect the PR

Inputs are a PR URL and access to its source revisions.
Read applicable repository instructions.
Read the current title, body, discussion, inline reviews and relevant linked issues before explaining the design or proposing alternatives.
Use the project's own names and check whether its authors already have a migration or follow-up plan.

Any GitHub reader is suitable.
With `gh`, useful read-only commands are:

```sh
gh pr view PR_URL --json title,body,baseRefOid,headRefOid,url
gh api --paginate repos/OWNER/REPO/issues/NUMBER/comments
gh api --paginate repos/OWNER/REPO/pulls/NUMBER/reviews
gh api --paginate repos/OWNER/REPO/pulls/NUMBER/comments
```

Record exact base and head SHAs and the metadata check time.
Inspect `git status` before using local source.
Use separate checkouts when the local revision or work differs.
Do not update, reset or clean an existing working tree to make evidence fit.
Check `git merge-base BASE HEAD` and record `review.diffBase` if it differs from the PR base used in `review.base`.
State the actual source pair used for comparisons.

Inspect changed definitions and the callers that explain their effect, including unchanged callers and relevant downstream hooks.
Search the full relevant consumer surface of changed names.
For Julia, [the helpers](docs/helpers.md) collect selected reflection and diff facts without building a call graph.
Run inspection code only in a repository environment you are willing to execute.
The helper accepts Julia expressions and setup files as code.

## Write the review

Choose a few questions a reviewer needs answered.
Explain the problem, approach and internal names in plain English.
Use one running public API example when useful.
Choose focused diagrams after reading the code.
Small type relationships and selected call paths usually explain more than a whole-repository graph.
Omit sections that add no useful information.

Use stable IDs and structured nodes and edges as the graph's only source of truth.
Distinguish methods from types and give overloads full signatures when dispatch matters.
Label edges explicitly, such as `calls`, `stores` and `subtype of`.
Include branch conditions and dispatch limits in the edge explanation.
Recursion and cycles are supported.
Link definitions and supporting source to exact commit SHAs and line ranges.

Separate source-checked relationships, execution observations for concrete examples, and possible relationships.
Compiler output needs interpretation and is not an execution trace.
Inlining can hide a source call, and dynamic dispatch can leave its target unresolved.
Do not promote a possible edge because a source line was linked.

Put long signatures and supporting checks in node explanations or `details` blocks.
Use before/after descriptions with the same input and name the revisions tested.
Reproduce bug claims on both sides when possible.
Otherwise label them `unverified` and state the missing check.
Use `suggestion` or `question` for design advice, separate from demonstrated defects.
Do checks proportionate to the document's claims.
A design explanation alone does not require a full downstream test campaign.

Reuse prior evidence only after checking its revisions, environment and scope.
Include a small reproducible example or concise evidence record with the document when needed.
Keep tests of particular source revisions separate from an author's report of local changes.
State what was checked and what remains unverified.

## Render and inspect

From this checkout:

```sh
node bin/review-docs.js validate /path/to/review.json
node bin/review-docs.js render /path/to/review.json --out /path/to/review.html
```

Validation catches structural mistakes, not incorrect design claims.
Open the generated HTML itself in a browser with network disabled.
Check every section, graph and expandable area for readable text, clipping and useful explanations.
Try zoom, pan, fit, keyboard node selection and source links.
Check that code links use the reviewed SHAs and correct lines.
Open links online separately when necessary.
The HTML must work without a server or CDN.
Return links or paths to both HTML and editable JSON, the reviewed revisions, important limits and concise usage instructions.
Creating a review does not authorize posting it, changing the target repository, or publishing anything.
