# Reviewer feedback

Open Comments, or use Comment beside a section or Comment on this node in a graph inspector.
Choose Question, Suggestion or Issue and write a request.
A name is optional and is a label supplied by the reviewer, not a verified identity.
Comments can be edited, resolved, reopened or removed with an undo action.

Select the comments to send back to an agent.
Choose whether to revise the document or investigate the PR code.
Copy agent prompt includes the PR URL, exact revisions, comment locations, available signatures and pinned source links.
Preview prompt shows the text before copying.
If clipboard access is blocked, the prompt opens selected for manual copying.
The tool does not send the prompt or run an agent.

## Keep and share comments

Browser storage keeps a local working copy where available.
It does not synchronize reviewers.
Storage for files opened directly in a browser varies between browsers, so use Save > HTML with comments or Export feedback to retain the feedback.
The saved HTML includes the review, its editable JSON, the feedback, fonts and viewer scripts.
Another person can download it and open it offline.
Unsaved text in the comment form is excluded.

Export feedback writes a small JSON file for an agent or another reviewer.
Import feedback combines it with the current comments.
New IDs are added and matching IDs use the newer updatedAt.
Conflicting edits with the same timestamp are rejected without changing the current comments.
This file merge is not a concurrent editing protocol.
Keep separate reviewer files when people edit the same comment independently.

## Format

Feedback is separate from the generated review JSON.
It has its own version and names the review it belongs to.

```json
{
  "version": 1,
  "documentId": "review-name",
  "reviewUrl": "https://github.com/owner/repo/pull/1",
  "comments": [{
    "id": "comment-stable-id",
    "target": {"section": "design", "diagram": "calls", "node": "method-id"},
    "kind": "question",
    "text": "Explain which overload is called for this input.",
    "author": "",
    "status": "open",
    "base": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    "head": "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    "createdAt": "2026-11-10T00:00:00Z",
    "updatedAt": "2026-11-10T00:00:00Z"
  }]
}
```

The SHAs above are format placeholders.
Use the real revisions on which the comment was recorded.
Target `{}` means the whole document.
A section target needs `section`.
A diagram target needs `section` and `diagram`.
A node target also needs `node`.
The kind is `question`, `suggestion` or `issue` and status is `open` or `resolved`.
Text may contain up to 10000 characters and author up to 80.
Timestamps use UTC ISO form with `Z` or `+00:00`.

Rendering a newer document with old feedback keeps the old recorded SHAs.
The viewer marks older revisions and missing targets instead of dropping comments or silently moving them.
The prompt asks the agent to re-establish that context.

```sh
node bin/review-docs.js render review.json --feedback feedback.json --out review.html
node bin/review-docs.js prompt review.json --feedback feedback.json --out prompt.txt
node bin/review-docs.js prompt review.json --feedback feedback.json --purpose code --out prompt.txt
node bin/review-docs.js extract saved-review.html --out review.json --feedback-out feedback.json
```

The CLI prompt includes open comments by default.
Extract reads the embedded records without executing the HTML's scripts.
The viewer lets a reviewer choose individual comments.
An issue comment is a request to check a claim, not proof of a defect.
