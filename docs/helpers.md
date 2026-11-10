# Julia helpers

Use the reviewed project's environment and record its Julia and dependency versions.

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
