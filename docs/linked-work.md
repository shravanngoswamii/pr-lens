# Linked work

Collect issue/PR references with authenticated, read-only `gh` calls:

```sh
node scripts/linked-work.js PR_URL --out facts.json
```

Defaults: depth 3, 60 fetched items, root at depth zero.
Set `--max-depth all --max-items all` for unlimited traversal.
This may consume many API requests.
Rate limits stop new item reads.

| Searched | References |
| --- | --- |
| Bodies, paginated comments, submitted reviews and inline reviews | GitHub issue/PR URLs, `#123`, `owner/repo#123`, short ranges |
| Issue timelines | Incoming cross-references |

Websites, attachments, source links and commit messages are outside this scope.
Cycles are visited once.
Discovered items beyond a limit remain visible as unread.
Access failures and incomplete reads remain explicit.

The output contains `version`, `block` and `records`.
Read `records`, write short item and relationship explanations, then set `block.analysis` to `reviewed`.
Insert the edited block into the review JSON.
Keep large or private raw records outside this repository.

A mention is not a dependency or a reproduced bug.
Retain discovery evidence when explaining stronger relationships.
Never call limited collection complete.
To extend it, increase limits or start from an unread item and combine results by stable IDs.
