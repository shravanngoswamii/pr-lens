# Trace linked work

The read-only collector follows GitHub issue and PR references with authenticated `gh`.
It searches bodies, paginated issue comments, submitted reviews, inline review comments and incoming cross-references in issue timelines.
It recognizes full GitHub issue/PR URLs, `#123`, `owner/repo#123` and short ranges such as `#1502–#1504`.
It does not follow arbitrary websites, source-code links, attachments, or links found only in commit messages.

```sh
gh auth status
node scripts/linked-work.js https://github.com/OWNER/REPO/pull/123 --out facts.json
node scripts/linked-work.js https://github.com/OWNER/REPO/pull/123 --max-depth all --max-items all --out facts.json
```

Defaults are depth 3 and 60 fetched items.
The starting PR has depth zero.
Every newly discovered reference becomes a node even when it falls outside the limits.
Cycles are visited once and cross-repository references are supported.
Unlimited traversal can reach a large connected history and consume many API requests.
Collection stops starting new item reads after a rate limit.
Unreadable items and incomplete discussion reads remain visible.

The output contains `version`, `block` and `records`.
`block` is a valid `linked-work` block with draft explanations and explicit coverage.
`records` holds the collected bodies, discussion, timestamps and PR revisions for the agent to inspect.
It can be large and can contain private discussion.
Keep it outside the tool repository.
Only include context that belongs in the shared review.

Read the records before writing summaries or changing a discovery edge to a design relationship.
A mention inside quoted text or a code example can be incidental.
An incoming timeline reference does not establish a dependency.
A linked issue's bug claim is not a reproduced finding.
Write short explanations for read items and retain explicit uncertainty for the unread frontier.
Set `analysis` to `reviewed` after checking those explanations.
Place the edited block in a document section and validate it normally.

Use greater limits or rerun from an unread frontier item when more context matters.
Reconcile graphs by stable node IDs and retain evidence when combining results.
Never label limited collection as "all related work".
The viewer shows the coverage count, scope, limits and errors beside the hierarchy.
Search covers every collected node, including those outside the expanded branches.
