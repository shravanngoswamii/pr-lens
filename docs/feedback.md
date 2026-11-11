# Feedback

Add a question, suggestion or issue to the review, a section or a node.
Names are optional, unverified labels.
Select comments and copy a prompt to revise the document or investigate the code.
The prompt includes revisions, targets and source links.
If clipboard access fails, copy the selected text manually.

Use **Save > HTML with comments** or **Export feedback** to keep comments.
Browser storage is local and may be unavailable for files.
Saved HTML excludes unsaved drafts.
Share the HTML file or publish it with the [bot](bot.md).
For several reviewers, collect their exported feedback files and import them into one copy.
Browser copies do not sync.
Import adds new IDs and keeps the newer `updatedAt` for matching IDs.
Equal-timestamp conflicts are rejected.
Keep separate files for independent edits to the same comment.

## Format

Feedback stays separate from generated review JSON.

```json
{
  "version": 1,
  "documentId": "review-name",
  "reviewUrl": "https://github.com/owner/repo/pull/1",
  "comments": [{
    "id": "note",
    "target": {"section": "design", "diagram": "calls", "node": "method"},
    "kind": "question",
    "text": "Which overload runs?",
    "author": "",
    "status": "open",
    "base": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    "head": "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    "createdAt": "2026-11-10T00:00:00Z",
    "updatedAt": "2026-11-10T00:00:00Z"
  }]
}
```

Replace placeholder SHAs with the comment's actual revisions.

| Field | Values |
| --- | --- |
| `target` | `{}` for review, `{section}`, `{section, diagram}`, or `{section, diagram, node}` |
| `kind` | `question`, `suggestion`, `issue` |
| `status` | `open`, `resolved` |
| `text`, `author` | Up to 10000 and 80 characters |
| Timestamps | UTC ISO, `Z` or `+00:00` |

Old revisions and missing targets are flagged and retained.
Comments are requests to check, not verified findings.

```sh
node bin/review-docs.js render review.json --feedback feedback.json --out review.html
node bin/review-docs.js prompt review.json --feedback feedback.json --out prompt.txt
node bin/review-docs.js extract saved.html --out review.json --feedback-out feedback.json
```

CLI prompts include open comments by default.
Add `--purpose code` for code investigation.
Extraction reads embedded JSON without executing scripts.
