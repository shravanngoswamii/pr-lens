# Examples

| Review | Focus | Linked items read |
| --- | --- | --- |
| [DynamicPPL #1529](dynamicppl-1529.json) | Bindings, evaluation and Turing migration | 17/47, depth 2, budget 30 |
| [AbstractMCMC #222](abstractmcmc-222.json) | Input validation and unchanged callers | 2/10, depth 1, budget 10 |

Linked-work snapshots: 2026-11-10.
Unread items remain explicit.
AbstractMCMC also checked the skill from a fresh agent context.

```sh
mkdir -p output
node bin/review-docs.js render examples/dynamicppl-1529.json --out output/review.html
```

HTML is inspected offline and excluded from Git because each file bundles about 5 MB of assets.

## Reproduce

Use separate environments for the exact base/head in each JSON, with matching dependency versions.

```sh
julia --project=/path/to/base-env examples/dynamicppl-1529.jl
julia --project=/path/to/head-env examples/dynamicppl-1529.jl
REVIEW_REVISION=base julia --threads=2 --project=/path/to/base-env examples/abstractmcmc-222.jl
REVIEW_REVISION=head julia --threads=2 --project=/path/to/head-env examples/abstractmcmc-222.jl
```

[evidence.json](evidence.json) records results, revisions and environment fingerprints.
Full manifests and logs stay outside this repository.
Fingerprints identify environments but cannot recreate them.

[particle-metadata.jl](particle-metadata.jl) preserves the earlier Turing probe byte for byte.
It requires Turing `67a9f804e376a1fc18ed8362532458063f443864` and the matching DynamicPPL environment.
Its saved 60-check comparison was reused, not rerun.
It fails on the reviewed head with unchanged Turing hooks and does not test the author's local migration.
`PARTICLE_PORT=true` enables an experimental in-process adapter.

`npm test` checks this tool, not the external package probes.
