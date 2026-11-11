# Format

UTF-8 JSON, `version: 1`.
Unknown fields are rejected.
Prose is plain text with blank lines between paragraphs.

```json
{
  "version": 1,
  "id": "review-name",
  "title": "The design change",
  "summary": "Problem and approach.",
  "conclusion": {"decision": "approve", "summary": "No blocker in the checked scope.", "reasons": []},
  "review": {
    "url": "https://github.com/owner/repo/pull/1",
    "title": "Actual PR title",
    "base": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    "head": "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    "checkedAt": "2026-11-10T00:00:00Z"
  },
  "sources": [],
  "sections": [{
    "id": "overview",
    "title": "Overview",
    "blocks": [{"type": "text", "text": "What changes for users."}]
  }]
}
```

Replace placeholder SHAs with full commits.
`base` and `head` come from the PR API.
Add `review.diffBase` when the diff uses a different merge base.
Optional `review.agent` records `{ name, requestedModel, requestedEffort?, models, session? }`.
`requestedEffort` is `default`, `low`, `medium`, `high`, `xhigh` or `max`.
`models` contains names reported by the provider, or an empty list when unavailable.
`session` is the Claude cloud session URL.
Name the pair used for behavior checks.
Timestamps use UTC ISO with optional fractions and `Z` or `+00:00`.

IDs match `[a-zA-Z][a-zA-Z0-9_-]*` and stay stable across edits.
Section, source and diagram IDs are unique across the document.
Node and edge IDs are unique within a graph.

## Conclusion

New reviews include a merge recommendation:

```json
"conclusion": {
  "decision": "hold",
  "summary": "Confirm replay at a new input before merging.",
  "reasons": [{
    "text": "The changed replay path still needs a regression check.",
    "refs": ["source-id"]
  }]
}
```

Use `approve` with an empty `reasons` array when no blocking issue remains in the checked scope.
`hold` needs at least one reason with source references.
A reason can include `code` and a lowercase `language`, such as `julia`.
Bot replies use language-tagged code fences.
The recommendation is advice, not a GitHub approval action.
Older documents without a conclusion show Not assessed.

## Sources

Sources have `{ id, label, url }`.
Blocks and diagram nodes/edges cite them with `refs: ["source-id"]`.
Use HTTPS without credentials.
Pin `/blob/` and `/raw/` links to full SHAs, with `#LSTART-LEND` for lines.
Validation checks shape and references, not remote contents or design claims.

## Blocks

Sections have `{ id, title, group?, blocks }`.
`sections` and `blocks` must be nonempty.
All blocks accept optional `refs`.
`?` marks an optional field.
Set `group` on every section to use Overview, Changes, Design, Review and Details.
Values are `overview`, `changes`, `design`, `review` and `details`.
Empty groups are omitted.
Sections keep their order within each group.
Details stays outside Previous and Next.
Without groups, chapters follow source order.
Keep the main explanation visible in `text`, `compare` or `table` blocks.
Diagram links open a focused canvas and return to the same explanation.

| Type | Fields |
| --- | --- |
| `text` | `text` |
| `code` | `title`, `code`, `language?` |
| `compare` | `title`, `before`, `after` |
| `details` | `title`, `text` |
| `table` | `title`, `columns`, `rows` |
| `finding` | `title`, `text`, `status`: `verified`, `suggestion`, `question`, `unverified` |
| `check` | `title`, `text`, `status`: `passed`, `failed`, `unverified` |
| `diagram` | `id`, `title`, `text`, `nodes`, `edges`, `direction?`: `LR` (default), `TB`, `baseline?` |
| `diff` | `title`, `text`, `path`, `before`, `after`, `scope`, `verification` |
| `proposal` | `title`, `text`, `kind`, `current`, `suggested` |
| `prompt` | `title`, `text`, `instructions` |
| `linked-work` | See below |
| `inventory` | `title`, `text`, `data`, `links`, `omissions` |

Code is literal text.
`language` is metadata.
Tables use nonempty text headers and rows with one nonempty text cell per column.

### Diagrams

| Element | Fields |
| --- | --- |
| Node | `id`, `label`, `kind`, `text`, `signature?`, `refs?` |
| Edge | `id`, `from`, `to`, `label`, `status`, `text`, `refs?` |

Node `kind`: `type`, `function`, `method`, `macro`, `value`, `group`.
A group collects definitions and has no implicit call meaning.
Use short labels and full signatures for significant overloads.
Edges name existing nodes and label relationships such as `calls` or `stores`.
Cycles, self calls and parallel edges are supported.

| Edge status | Evidence required |
| --- | --- |
| `source` | Inspected source, with branch and dispatch limits |
| `observed` | A concrete execution example and observation method |
| `possible` | An uncertain path and its missing check |

Compiler bodies are source evidence, not execution observations.
Possible edges are dashed.
Mermaid is generated from nodes and edges.

See [design changes](design.md) for baseline snapshots and inventory fields.

### Suggestions

- `diff`: `before`/`after` are the only editable snippets and may be empty.
  `path` is repository-relative.
  `scope` is `pr` or `suggestion`.
  `verification` is `source-checked`, `tested` or `unverified`.
  Explain scope in `text`.
  The generated patch uses snippet line numbers, so check file context before applying it.
- `proposal`: `kind` is `title` or `description`.
  Keep the exact original in `current` and replacement in `suggested`.
  An empty current description is allowed.
  Copy preserves literal Markdown.
- `prompt`: `instructions` define the task.
  Copy adds PR revisions, cited sources and evidence checks.

Copying does not apply edits or contact an AI service.

### Linked work

Required: `id`, `title`, `text`, `root`, `checkedAt`, `scope`, `analysis`, `complete`, `limits`, `notes`, `nodes`, `edges`.
The ID shares the diagram namespace.

| Field | Meaning |
| --- | --- |
| `root` | Starting node ID |
| `scope`, `checkedAt` | Searched sources and UTC collection time |
| `analysis` | `draft` or agent-checked `reviewed` |
| `complete` | All discoverable items collected within the stated scope |
| `limits` | `{maxDepth, maxItems}`, each integer or `null` for unlimited |
| `notes` | Coverage problems, or `[]` |

Nodes have `{ id, url, title, kind, state, summary, status }` and optional `detail` for errors or limits.
URLs identify GitHub issues or PRs.

| Field | Values |
| --- | --- |
| `kind` | `pr`, `issue`, `unknown` |
| `state` | `open`, `closed`, `merged`, `unknown` |
| `status` | `read`, `partial`, `unread`, `unreadable` |

`status` describes collection, not code verification.
`summary` explains the item or marks its role unchecked.
Edges have `{ id, from, to, label, text, evidence }`.
`evidence` is a nonempty array of `{ url, text }` identifying reference locations.
A collected mention alone establishes no dependency.
Retain evidence when explaining a stronger relationship.

The viewer shows discovery paths with shared nodes and cycles.
`complete: true` requires every node read and no coverage notes.
Completeness remains limited by API visibility, recognized references and check time.
Use [the collector](linked-work.md) to gather facts before writing explanations.
