---
name: review-docs
description: Turn a PR into an editable, source-linked HTML design review.
---

Return review JSON and standalone HTML.
The agent analyzes the PR.
The renderer handles presentation.
Resolve tool paths from this checkout.
See [setup](README.md#use) and [format](docs/format.md).

## Inspect

Read repository instructions and the current PR title, body, discussion, inline reviews and linked work.
Treat the request as questions to investigate, not evidence about the code.
Use the project's terms and check published migration plans.
Record base, head and check time.
Record `review.diffBase` if the merge base differs from the PR base.

```sh
gh pr view PR_URL --json title,body,baseRefOid,headRefOid,url
gh api --paginate repos/OWNER/REPO/issues/NUMBER/comments
gh api --paginate repos/OWNER/REPO/pulls/NUMBER/reviews
gh api --paginate repos/OWNER/REPO/pulls/NUMBER/comments
```

Any equivalent reader is suitable.
Check `git status` and use separate checkouts for different revisions or existing work.
If needed, fetch `refs/pull/NUMBER/head` without changing the working tree.
Inspect changed definitions, relevant unchanged callers and downstream hooks.
For changed documentation claims, read the code or data they describe.

Use [Julia helpers](docs/helpers.md) for reflection and diff facts.
Reflection executes setup code in the target environment.
For Julia, collect the [definition inventory](docs/design.md#inventory) before selecting diagrams.
Check every recorded addition, change and removal.
Keep source scope and unresolved macro/generated code visible.
Use [the collector](docs/linked-work.md) for recursive issue/PR context.
Read items before explaining their relationships.
Keep cycles, shared references and collection limits visible.
A mention alone establishes no dependency.

## Design context

Read [design changes](docs/design.md) to reuse a commit-pinned baseline and show the PR's changes.
Check that the baseline matches the diff base.
If no graph exists, build a scoped baseline from that code and state its limits.
Include unchanged context needed to explain the change.
Place every inventoried declaration in a diagram or record an omission reason.
Use named groups when individual overloads would make a diagram unreadable.
Check important relationships in source or examples.
Keep assumptions and inferences explicit.
Do not infer runtime coverage from inventory or diagram coverage.

## Write

- Write a review a newcomer can read in order: problem, change, example, design, impact and conclusions.
  Scale the chapters to the PR.
  A small change can use just Overview and Review.
  Prose blocks are plain text.
  Put code in code blocks.
- Group sections under `overview`, `changes`, `design`, `review` and `details`.
  Use only the groups the PR needs.
  Put the full inventory, linked-work browser and wording edits in Details.
  Keep the main path readable without opening them.
- Start with **Overview**: what the project does, why this change matters and who it affects.
- Use one running public example to compare the same inputs before and after.
- Explain internal names before using them.
  Introduce each diagram's question and reading order.
  Follow it with the result or design implication.
- Cover material API, compatibility and downstream changes in visible prose or tables.
  Keep the main explanation out of `details` blocks.
- Explain the design's benefits, costs and open decisions.
  Label review judgments and distinguish findings from proposed edits.
- Choose focused diagrams after reading the code.
- Use stable IDs and structured nodes/edges as the graph's only source.
- Distinguish types, methods and overloads.
  Put full signatures, branch conditions and dispatch limits in node or edge details.
- Label relationships: `calls`, `stores`, `subtype of`.
  Pin source links to exact commits and lines.
- Separate source checks, observed example behavior and uncertain paths.
  Compiler output is not an execution trace.
  Inlining may hide calls and dynamic dispatch may leave targets unknown.
- Compare the same input on both revisions.
  Reproduce bug claims or mark them `unverified`.
  Keep suggestions separate from demonstrated defects.
- Reuse evidence only after checking revisions, environment and scope.
  Distinguish tested revisions from an author's local migration.
- State checks and remaining limits.
  Match testing to the claims.
  State each limit once.

Include only useful blocks:

| Block | Use |
| --- | --- |
| `details` | Long signatures and supporting evidence |
| `table` | Role rules, migration steps or design tradeoffs |
| `inventory` | Declaration changes, diagram placements and coverage gaps |
| `diff` | A small proposed edit or PR change, with reason and verification scope |
| `proposal` | A better PR title or description, preserving key changes and migration links |
| `prompt` | A concrete next task with inputs, evidence and expected result |
| `linked-work` | Explained references with explicit unread items |

Use simple headings such as Overview, Example, Design, Changes, Findings and Checks.
Omit a linked-work tree that contains only the PR itself.
Keep wording direct and factual.
Avoid slogans, metaphors and dramatic phrasing.
Keep the main explanation brief.
Avoid repeated caveats and generic test requests.
Review wording only when a replacement helps.

## Render

```sh
node bin/review-docs.js validate review.json
node bin/review-docs.js render review.json --out review.html
```

Open the HTML offline at desktop and phone widths.
Read from the first chapter with Next before exploring diagrams.
Check that a reader can explain the problem, changed behavior, design and review outcome without opening node details.
Open every view and check its disclosures and source links.
Try graph controls, node selection, copy actions and linked-work branches.
Split diagrams whose labels become too small.
Validation proves structure only.
Return both files, reviewed revisions and material limits.
Posting, publishing and source changes require separate authorization.

## Revise

Read [feedback](docs/feedback.md) for comments, feedback JSON or a saved HTML.
Treat comments as requests to check.
Restore missing targets or older revision context before acting.
Preserve stable IDs and keep human feedback separate from generated content.
Report addressed requests and unresolved checks.
