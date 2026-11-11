# Julia helpers

Use the reviewed project's environment and record its Julia and dependency versions.

## Linked work

```sh
node scripts/linked-work.js PR_URL --out facts.json
```

Uses read-only `gh` calls to collect issue/PR bodies, comments, reviews, inline reviews and incoming timeline references.
Recognizes GitHub URLs, `#123`, `owner/repo#123` and short ranges.
Defaults to depth 3 and 60 fetched items, with the root at depth zero.
Use `--max-depth all --max-items all` for unlimited traversal.
The hosted bot uses smaller limits.

Output contains `block` for the document and `records` for the agent to read.
Write short item and relationship explanations, set `block.analysis` to `reviewed`, then insert the block into the review.
Keep evidence when describing a stronger relationship than a mention.
Cycles are visited once and limits, access failures and unread items stay visible.
Websites, attachments, source files and commit messages are outside collection scope.
Keep private records outside the public reports repository.

## Changed lines

```sh
node scripts/changed-lines.js /path/to/repo BASE_SHA HEAD_SHA > changed.json
```

Compares two full SHAs and reports changed `.jl` paths, hunks and lines.
For a PR diff, use the merge base and record that choice.
Git's nearby context is a search hint, not a parsed definition.
Read enclosing code on both revisions.

## Reflection

Put package imports or probe definitions in `probe.jl`.

```sh
julia --project=/path/to/env scripts/inspect.jl methods DynamicPPL.tilde_observe!! --setup probe.jl
julia --project=/path/to/env scripts/inspect.jl type DynamicPPL.BindingRoot --setup probe.jl
julia --project=/path/to/env scripts/inspect.jl lowered mycall --types 'Tuple{Int}' --setup probe.jl
julia --project=/path/to/env scripts/inspect.jl typed mycall --types 'Tuple{Int}' --setup probe.jl
```

| Command | TOML output |
| --- | --- |
| `methods` | Signatures, modules and source locations. Optional `--types` filters methods. |
| `type` | Fields, supertype and loaded immediate subtypes. Supports UnionAll, not unions. |
| `lowered` | Lowered bodies for concrete input types. |
| `typed` | Inferred bodies with `optimize=false`. |

Output includes Julia version and active project.
Keep setup output off stdout when parsing TOML.
Verify local source locations before making commit links.
The module also exposes `ReviewFacts.inspect_methods`, `inspect_type` and `inspect_body`.

These commands execute Julia expressions and setup code.
Inference may run generated functions.
Compiler bodies show selected representations, not runtime traces or complete call graphs.
Inlining can remove calls and dispatch may remain unresolved.
See [Julia reflection](https://docs.julialang.org/en/v1/base/reflection/).

## Definition inventory

```sh
node bin/reviary.js inventory /path/to/repo --base BASE_SHA --head HEAD_SHA --out inventory.json
```

Parses changed Julia files at both commits without loading the project.
The default scope is `src/` and `ext/`.
Use `--scope .` for all changed Julia files, or comma-separated paths for a smaller area.

Lists added, changed and removed written type, generic-function, method and macro declarations.
Whitespace, line numbers and leading docstrings outside a declaration do not count as body changes.
Identity uses the file, lexical scope and source signature, or name for types.
Moves and method signature edits can appear as removal and addition.
Each record includes source locations and normalized syntax hashes.
Lines start the enclosing parsed statement, including annotations or documentation wrappers.

Macros and quoted code remain unexpanded.
The output records places that need manual inspection.
Anonymous functions remain part of their enclosing body and type aliases have no separate entry.
This is a source inventory, not proof of loaded methods, runtime behavior or call relationships.
