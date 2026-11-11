---
name: reviary
description: Turn a PR into an editable, source-linked HTML design review.
---

Return review JSON and standalone HTML.
The agent analyzes the PR and the renderer handles presentation.
Resolve tool paths from this checkout.
See [usage](README.md#use) and [format](docs/format.md).

## Inspect

Read repository instructions, the current PR title, body, discussion, inline reviews and linked work.
Treat the request as questions to investigate, not evidence about the code.
Use the project's terms and check published migration plans.
Record base, head and check time, plus `review.diffBase` if the merge base differs.

```sh
gh pr view PR_URL --json title,body,baseRefOid,headRefOid,url
gh api --paginate repos/OWNER/REPO/issues/NUMBER/comments
gh api --paginate repos/OWNER/REPO/pulls/NUMBER/reviews
gh api --paginate repos/OWNER/REPO/pulls/NUMBER/comments
```

Any equivalent reader is suitable.
Check `git status` and use separate checkouts to preserve existing work.
Inspect changed definitions, relevant unchanged callers, downstream hooks and code behind documentation claims.

Use [Julia helpers](docs/helpers.md) for reflection and diff facts.
Collect the [definition inventory](docs/design.md#inventory) before selecting Julia diagrams.
Check additions, changes, removals and unresolved macro/generated code.
Use [linked-work collection](docs/helpers.md#linked-work) for recursive issue/PR context.
Read items before explaining relationships and keep unread items and collection limits visible.
A mention alone establishes no dependency.

## Design

Follow [design changes](docs/design.md) to reuse a graph pinned to the diff base.
If no graph exists, build a scoped baseline from that code.
Include unchanged types and callers needed to explain the change.
Place every inventoried declaration in a diagram or give an omission reason.
Group overloads when individual nodes would be unreadable.
Keep full signatures and dispatch limits in node details.

Use stable IDs and structured nodes/edges as the only graph source.
Distinguish types, methods and significant overloads.
Label relationships, such as `calls`, `stores` and `subtype of`.
Pin code links to exact commits and lines.
Separate source checks, observed example behavior and uncertain paths.
Compiler bodies are not execution traces and diagram coverage is not runtime coverage.

## Write

Write for someone new to the PR: problem, change, example, design, impact and conclusion.
Scale the structure to the change.
Use section groups `overview`, `changes`, `design`, `review` and `details` as needed.
Put the inventory, linked-work browser and wording edits in Details.
Small reviews may need only Overview and Review.

- Start with what the project does, why the change matters and who it affects.
- Use one public example to compare the same inputs before and after.
- Explain internal names, each diagram's question and what it shows.
- Keep API, compatibility and downstream effects in visible prose or tables.
- Distinguish design tradeoffs, findings, suggestions and open questions.
- Reproduce bug claims or mark them `unverified`.
  Match checks to claims and state material limits once.
- Reuse evidence only after checking revisions, environment and scope.
  Keep tested revisions separate from an author's local migration.

Use only blocks that help:

| Block | Use |
| --- | --- |
| `details` | Long signatures and evidence |
| `table` | Role rules, migration steps or tradeoffs |
| `inventory` | Declaration changes and diagram coverage |
| `diff` | A proposed edit or PR change with verification scope |
| `proposal` | A better PR title or description that preserves scope and migration links |
| `prompt` | A concrete next task with inputs and expected result |
| `linked-work` | Explained references and unread items |

Include `conclusion` with `approve` or `hold` for the checked scope.
Hold only for a material defect or essential unresolved check.
Give each hold reason a source and a clear way to resolve it.
Keep nonblocking suggestions in Review.
Use one short sentence for the recommendation summary.
A source-only review must not imply runtime verification.

Use simple headings, short sentences and plain text prose.
Put code in code blocks.
Avoid slogans, metaphors, semicolons and repeated caveats.
Omit a linked-work tree containing only the PR itself.
Review wording only when a replacement helps.

## Render

```sh
node bin/reviary.js validate review.json
node bin/reviary.js render review.json --out review.html
```

Open offline at desktop and phone widths.
Read through Next, then check every view, disclosure and source link.
The reader should understand the problem, change, design and outcome without opening node details.
Try graph controls, node selection, copy actions and linked-work branches.
Split diagrams whose labels become too small.
Validation proves structure only.
Return both files, reviewed revisions and material limits.
Posting, publishing and source changes need separate authorization.

## Revise

Follow [feedback](docs/feedback.md) for comments, feedback JSON or saved HTML.
Check requests against their target and revision before acting.
Preserve stable IDs and keep human feedback separate from generated content.
Report addressed requests and unresolved checks.
