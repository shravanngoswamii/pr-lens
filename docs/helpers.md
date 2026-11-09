# Julia evidence helpers

These helpers use only Julia standard libraries, Node and Git.
They do not install the reviewed package or infer a complete call graph.
Use the target project's environment and record its Julia and dependency versions.
Keep setup output off stdout if you need to parse the resulting TOML.

## Changed lines

```sh
node scripts/changed-lines.js /path/to/repo BASE_SHA HEAD_SHA > changed.json
```

Both arguments must be full commit SHAs available in the repository.
The JSON records changed `.jl` paths, hunk ranges, added and removed lines, and Git's nearby context text.
It compares the two revisions directly.
Use the merge base as the first argument when inspecting the PR diff, and record that choice.
The context is a search hint, not a parsed method name.
Inspect enclosing definitions in source, especially for macros, nested modules and multiline signatures.
Deleted definitions require reading the base.

## Reflection

Create a small setup file that imports the package or defines the example.
Use concrete input types for compiler bodies.

```sh
julia --project=/path/to/env scripts/inspect.jl methods DynamicPPL.tilde_observe!! --setup probe.jl
julia --project=/path/to/env scripts/inspect.jl type DynamicPPL.BindingRoot --setup probe.jl
julia --project=/path/to/env scripts/inspect.jl lowered mycall --types 'Tuple{Int}' --setup probe.jl
julia --project=/path/to/env scripts/inspect.jl typed mycall --types 'Tuple{Int}' --setup probe.jl
```

The commands evaluate the expression and setup file as Julia code.
They are not a sandbox for untrusted PR code.
Do not put credentials or private values in a probe you plan to share.

| Command | Output |
| --- | --- |
| `methods EXPR` | Matching method signatures, defining modules, local files and lines. Optional `--types 'Tuple{...}'` filters the method table. |
| `type EXPR` | Fields and declared field types, immediate supertype, and immediate loaded subtypes. UnionAll types such as `Vector` retain type parameters. Unions are not supported. |
| `lowered EXPR --types ...` | Julia's lowered bodies for the selected input types. |
| `typed EXPR --types ...` | Inferred bodies with `optimize=false` for those types. |

Output is TOML and includes Julia's version and active project.
Local method locations must be checked against the source checkout before creating commit-pinned GitHub links.
Subtype lists cover loaded code only.
Neither `methods` filtering nor body inspection establishes every possible runtime dispatch.
Inference can evaluate generated functions and does not count as observing the user's public API.

The module can also be included and its `ReviewFacts.inspect_methods`, `inspect_type` and `inspect_body` functions called from an existing Julia session.

## Why compiler output needs a scope

For `caller(x::Int) = leaf(x)`, lowered code can retain the call to `leaf`.
Optimized typed code can inline its implementation and remove the call.
The helper deliberately requests unoptimized typed code, but even that is a compiler representation for selected types.
Read source and use execution probes for claims about actual behavior.
See the official [Julia reflection documentation](https://docs.julialang.org/en/v1/base/reflection/) for the underlying operations.
