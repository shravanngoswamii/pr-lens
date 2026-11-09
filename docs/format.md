# Input format

The renderer accepts UTF-8 JSON with `version: 1`.
Unknown fields are rejected to catch misspellings.
Strings are plain text, not Markdown or HTML.
Separate paragraphs with a blank line.

```json
{
  "version": 1,
  "id": "review-name",
  "title": "What the design changes",
  "summary": "The problem and the approach in two short sentences.",
  "review": {
    "url": "https://github.com/owner/repo/pull/1",
    "title": "The actual PR title",
    "base": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    "head": "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    "checkedAt": "2026-11-10T00:00:00Z"
  },
  "sources": [],
  "sections": [{
    "id": "approach",
    "title": "Approach",
    "blocks": [{"type": "text", "text": "Explain one useful idea."}]
  }]
}
```

The SHAs above are placeholders for this format example.
Use real, full commit SHAs in a review.
`review.base` records the PR API's base revision.
If the diff uses a different merge base, record its SHA in optional `review.diffBase` and explain which pair the behavior checks used.
`checkedAt` records when the PR metadata was read, in UTC.
Document, section, diagram, node, edge and source IDs start with a letter and contain only letters, digits, `_` and `-`.
Keep IDs stable when revising a document.
Section IDs, diagram IDs and source IDs are each unique across the document.
Node and edge IDs are each unique within their graph.

## Evidence

Each source is `{ "id": "definition", "label": "Model fields", "url": "https://..." }`.
Every block, node and edge may cite it with `"refs": ["definition"]`.
URLs must use HTTPS without credentials.
Code URLs containing `/blob/` or `/raw/` must use a full commit SHA.
Use `https://github.com/OWNER/REPO/blob/SHA/PATH#LSTART-LEND` for code.
PR discussions, issues and other evidence may use normal HTTPS URLs.
The renderer checks URL shape and reference IDs, not remote contents or line ranges.

## Blocks

`sections` is a nonempty array of `{ id, title, blocks }`.
Each `blocks` array is nonempty.
All fields below are required unless marked optional.
Every block also accepts optional `refs`.

| `type` | Fields | Purpose |
| --- | --- | --- |
| `text` | `text` | Main explanation |
| `code` | `title`, `code`, optional `language` | Small public API example |
| `compare` | `title`, `before`, `after` | Two plain-text descriptions |
| `details` | `title`, `text` | Expandable evidence or long checks |
| `finding` | `title`, `text`, `status` | `verified`, `suggestion`, `question` or `unverified` |
| `check` | `title`, `text`, `status` | `passed`, `failed` or `unverified` |
| `diagram` | `id`, `title`, `text`, `nodes`, `edges`, optional `direction` | Focused graph, direction `LR` (default) or `TB` |

`language` is metadata for future importers.
The renderer shows code as literal text without syntax highlighting.

## Graphs

A node is `{ id, label, kind, text }` with optional `signature` and `refs`.
`kind` is `type`, `method` or `value`.
Use short labels and put complete signatures in `signature`.
Give overloaded methods separate IDs when dispatch matters.
`text` explains the name and its role to a new reader.

An edge is `{ id, from, to, label, status, text }` with optional `refs`.
`from` and `to` refer to node IDs in the same diagram.
`label` names the relationship, such as `calls`, `stores` or `subtype of`.
`text` explains its scope and evidence.
Cycles, self calls and parallel edges are allowed.

| Edge status | Meaning |
| --- | --- |
| `source` | The agent checked the relationship in source. State any branch or dispatch condition. |
| `observed` | Seen while running a named example. State the input types and observation method. |
| `possible` | A candidate or uncertain relationship. State what remains unchecked. |

Lowered or typed code is compiler evidence.
Use `source` with that scope stated, or `possible` if dispatch is unresolved.
Use `observed` only for an execution observation.
The renderer draws possible edges dashed and shows all statuses in the inspector and text list.
Graph labels are escaped before generating Mermaid.
The structured graph is the only editable graph representation.
The Mermaid disclosure is derived output.
