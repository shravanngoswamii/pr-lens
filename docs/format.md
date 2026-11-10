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
UTC timestamps may use fractional seconds and either `Z` or `+00:00`.
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
| `diff` | `title`, `text`, `path`, `before`, `after`, `scope`, `verification` | Colored unified diff and copyable patch |
| `proposal` | `title`, `text`, `kind`, `current`, `suggested` | Copyable PR title or description suggestion |
| `prompt` | `title`, `text`, `instructions` | Copyable agent task with exact PR revisions and cited sources |
| `linked-work` | See below | Expandable issue/PR hierarchy with search, explanations and coverage |

`language` is metadata for future importers.
The renderer shows code as literal text without syntax highlighting.
Use a normal section titled "In plain English" for a short overview without internal names.

## Suggestions and tasks

A `diff` keeps only the `before` and `after` snippets as editable truth.
The renderer generates the displayed rows and unified patch from them with jsdiff.
Either snippet may be empty for an addition or deletion.
`path` is a repository-relative file path.
Line numbers are relative to the snippets, so check the patch context against the real file before applying it.
`scope` is `pr` for a change already in the PR or `suggestion` for a proposed edit.
`verification` is `source-checked`, `tested` or `unverified`.
Use `text` to explain the reason and the precise verification scope.
Neither rendering nor copying applies a patch.

A `proposal` has `kind: "title"` or `"description"`.
`current` is the exact original text and `suggested` is the proposed replacement.
An empty current description is allowed.
`text` explains why the replacement helps.
Copy exports only the suggested text, including literal Markdown if present.
The renderer does not edit the PR.

A `prompt` describes one useful next task in `instructions`.
Copy adds the PR URL, exact revisions, block source URLs and evidence checks.
It does not send anything to an AI service.
Reviewer-selected comments can also produce a prompt through the Comments panel.

## Linked work

A `linked-work` block is a graph displayed as a hierarchy of discovery paths.
It supports shared references and cycles without treating them as a dependency order.
Its fields are `id`, `title`, `text`, `root`, `checkedAt`, `scope`, `analysis`, `complete`, `limits`, `notes`, `nodes` and `edges`.
The ID shares the document's diagram ID namespace so comments can target its nodes.

| Field | Meaning |
| --- | --- |
| `root` | The starting node ID |
| `checkedAt` | UTC collection timestamp |
| `scope` | What sources and reference forms were searched |
| `analysis` | `draft` for raw collected facts or `reviewed` after the agent writes and checks explanations |
| `complete` | Whether collection reached every discoverable item within the stated scope at that check time |
| `limits` | `{ "maxDepth": 3, "maxItems": 60 }`, with `null` meaning unlimited for either value |
| `notes` | Array of coverage problems, empty when none were reported |

Each node has `{ id, url, title, kind, state, summary, status }` and optional `detail`.
`url` identifies a GitHub issue or PR.
`kind` is `pr`, `issue` or `unknown`.
`state` is `open`, `closed`, `merged` or `unknown`.
`summary` explains the item's role, or says its role remains unchecked.
`status` is `read`, `partial`, `unread` or `unreadable`.
These statuses describe collection, not source-code verification.
`detail` explains a limit or error.

Each edge has `{ id, from, to, label, text, evidence }`.
`evidence` is a nonempty array of `{ url, text }` for the reference's location.
Collected labels such as `mentions` and `referenced by` record discovery only.
After reading the items, the agent may explain a specific relation such as `replaces` or `built on` and cite the supporting body or comment.
Keep the original evidence when refining the explanation.
An unread item or coverage note prevents `complete: true`.
Even complete collection is limited by API visibility, recognized reference forms and the snapshot time.
Use [the collector](linked-work.md) to prepare this block, then write the analysis.

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
