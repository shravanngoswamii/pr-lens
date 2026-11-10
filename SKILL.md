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

Use [Julia helpers](docs/helpers.md) for reflection and diff facts.
They execute setup code in the target environment.
Use [the collector](docs/linked-work.md) for recursive issue/PR context.
Read items before explaining their relationships.
Keep cycles, shared references and collection limits visible.
A mention alone establishes no dependency.

## Write

- Start with **In plain English**: the problem, change and user-visible effect.
- Use short sentences and one running public example.
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

Include only useful blocks:

| Block | Use |
| --- | --- |
| `details` | Long signatures and supporting evidence |
| `diff` | A small proposed edit or PR change, with reason and verification scope |
| `proposal` | A better PR title or description, preserving key changes and migration links |
| `prompt` | A concrete next task with inputs, evidence and expected result |
| `linked-work` | Explained references with explicit unread items |

Keep the main explanation brief.
Avoid repeated caveats and generic test requests.
Review wording only when a replacement helps.

## Render

```sh
node bin/review-docs.js validate review.json
node bin/review-docs.js render review.json --out review.html
```

Open the HTML offline at desktop and phone widths.
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
