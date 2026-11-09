# Real reviews

| Source | What it exercises |
| --- | --- |
| [dynamicppl-1529.json](dynamicppl-1529.json) | Type ownership, selected evaluation branches, overload signatures, before/after behavior and downstream migration evidence |
| [abstractmcmc-222.json](abstractmcmc-222.json) | A small error-path change, unchanged public callers and focused public API probes |

Render either JSON with `node bin/review-docs.js render examples/NAME.json --out output/NAME.html` from the checkout root.
Create `output/` first.
Generated HTML is excluded from Git because the bundled viewer makes each file about 5 MB.
Both reviews were inspected offline at desktop and narrow widths.

The AbstractMCMC example was produced by a fresh agent context using SKILL.md.
That exercise led to clearer checkout guidance, acceptance of ordinary UTC timestamp forms and closer checks of diagram label size.

## Reproduce the public examples

Create separate Julia environments for the exact base and head in each JSON's `review` object.
Install each target package's dependencies using its own repository instructions.
Keep the same dependency versions when comparing behavior.

```sh
julia --project=/path/to/dynamicppl-base-env examples/dynamicppl-1529.jl
julia --project=/path/to/dynamicppl-head-env examples/dynamicppl-1529.jl
REVIEW_REVISION=base julia --threads=2 --project=/path/to/abstractmcmc-base-env examples/abstractmcmc-222.jl
REVIEW_REVISION=head julia --threads=2 --project=/path/to/abstractmcmc-head-env examples/abstractmcmc-222.jl
```

[evidence.json](evidence.json) records the small outputs, revisions, environment fingerprints and scope of the checks.
The full dependency manifests and investigation logs stay outside this tool's repository.
Fingerprints identify the recorded evidence but are not enough to recreate an environment on their own.

The DynamicPPL review also reuses earlier paired Turing particle checks.
[particle-metadata.jl](particle-metadata.jl) is the original focused reproducer, copied byte for byte.
It needs Turing at `67a9f804e376a1fc18ed8362532458063f443864`, the corresponding DynamicPPL base or head, and the matching dependency migrations.
It is expected to fail on the head with those unchanged Turing hooks.
Its optional `PARTICLE_PORT=true` branch applies an experimental in-process observation adapter and does not edit package source.
The document's saved 60-check comparison was not repeated for this tool.
Those results concern the tested revisions and do not evaluate the author's separate local Turing changes.

The tool's own `npm test` suite uses Julia standard-library fixtures and renders both review JSON files offline.
It does not install target package environments or repeat the external PR probes.
