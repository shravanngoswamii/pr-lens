# Design changes

Use a scoped design graph at the reviewed base, then update it from the PR's code.
A graph can cover one subsystem.
State that scope and include unchanged callers or types that explain the change.
A file group can collect many declarations without claiming calls between them.

## Inventory

For Julia, collect declarations before choosing diagrams:

```sh
node bin/reviary.js inventory /path/to/repo --base BASE_SHA --head HEAD_SHA --out inventory.json
```

Use the merge base for `BASE_SHA` and record `review.diffBase` when needed.
Read the scope, parser version and collection notes.
The helper parses written declarations, not the set of methods that will exist at runtime.
Macros, quotes, aliases and generated code need separate inspection.
See [helper limits](helpers.md#definition-inventory).

Add one inventory block to the review:

```json
{
  "type": "inventory",
  "title": "Definitions",
  "text": "Source changes in the selected subsystem.",
  "data": {},
  "links": [{"definition": "def-ID", "diagram": "bindings", "node": "model"}],
  "omissions": [{"definition": "def-OTHER", "reason": "Why this definition is left out."}]
}
```

Replace `data` with the helper's full output.
A link can name a head node or a removed node in the baseline.
Use a `group` node for several declarations and explain the grouping.
Complete signatures and base/head locations remain in the inventory and node details.
Every recorded declaration should have a placement or an omission reason.
Unassigned entries remain visible and searchable.
Placement proves neither a call edge nor complete runtime coverage.

## Baseline

A diagram may carry a `baseline` with `revision`, `scope`, `nodes`, `edges` and optional `direction` and `refs`.
Its revision must match the reviewed diff base.
The diagram's normal nodes and edges describe head.
Use stable node and edge IDs across revisions.
Mermaid and change labels are derived from these two graphs.

The viewer offers Base, Changes and Head.
Changes shows added and removed nodes and edges, edited descriptions/signatures and nodes linked to changed declarations.
A changed edge target retains both routes.
Source-link updates alone do not mark a node changed.
These labels describe the scoped graph and its linked syntax changes.
Check runtime effects separately.

## Reuse

Export the reviewed head graph:

```sh
node bin/reviary.js snapshot review.json --diagram bindings --out design.json
```

Add `--view base` to export the embedded baseline instead.
The snapshot keeps one revision, stable IDs and its source references.
To reuse it in a later review with the same diagram ID:

```sh
node bin/reviary.js baseline next-review.json --from design.json --out with-baseline.json
node bin/reviary.js render with-baseline.json --out review.html
```

Import checks the repository and exact diff-base revision and handles source-ID collisions.
If the revision differs, inspect intervening changes and reconcile the graph first.
After a merge, pin the maintained graph to the actual main commit.
Squash and rebase merges can change that revision.
Keep historical review snapshots intact.

When no maintained graph exists, build a small baseline from the base code and label its scope.
Do not present it as a complete graph of main.
