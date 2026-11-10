# Review docs

Turn an agent's PR analysis into a source-linked HTML review with focused, interactive graphs.
The agent writes JSON with named nodes and edges.
The fixed renderer generates Mermaid and bundles the viewer into one offline HTML file.

## Use

Requires Node.js 22.12 or newer and npm.
Julia 1.10 or newer is needed only for the reflection helper.

```sh
npm ci
node bin/review-docs.js validate examples/dynamicppl-1529.json
node bin/review-docs.js render examples/dynamicppl-1529.json --out review.html
```

Open `review.html` directly in a browser.
It needs no server or CDN.
Source links need internet access.
Use the graph buttons, drag to pan, or select a node to read its signature, explanation and evidence.
Focus the graph to pan with arrow keys, zoom with `+` and `-`, and fit with `0`.
The node selector also works with a keyboard.
“Save editable JSON” recovers the original document from the HTML.

Reports can include a plain-English overview, proposed edits as readable diffs, shorter PR wording and specific next-step prompts.
Each suggestion has a copy button with a selectable-text fallback.
An expandable, searchable hierarchy explains linked issues and PRs, including cycles, shared links and unread items.
Use [the read-only GitHub collector](docs/linked-work.md) to gather recursive context before writing those explanations.

Use Comments to leave questions, suggestions or issues on the review, a section or a graph node.
Select feedback and copy an agent prompt with its source context.
Save > HTML with comments writes one file that another reviewer can open offline.
See [feedback and prompt export](docs/feedback.md) and [sharing options](docs/sharing.md).

For the shorter `review-docs` command, run `npm link` locally.
There is no package publication step.

## Agent workflow

Load [SKILL.md](SKILL.md) from this checkout, or copy the whole checkout without `node_modules` into an agent's skill directory and run `npm ci` there.
The skill needs file and command access and a way to read the PR.
It uses no proprietary connector.

Example request:

> Use the review-docs skill to explain this PR's design, show the important type relationships and call paths, compare old and new behavior, and include review findings: https://github.com/TuringLang/DynamicPPL.jl/pull/1529

See [the input format](docs/format.md), [Julia helpers](docs/helpers.md), and [the DrawShare integration note](docs/drawshare.md).
Small real review sources live in `examples/`.
Generated HTML belongs in `output/` or outside the checkout.

## Checks

```sh
npm ci
npx playwright install chromium
npm test
```

The full suite runs Node, Julia and offline Chromium checks.
On Linux, `npx playwright install --with-deps chromium` can install missing browser libraries.
Rendering itself needs no browser installation.

## Limits

Validation checks structure, references, statuses and link shape.
It cannot prove a source location exists or that a call can occur.
The agent must check those claims and distinguish source inspection, example observations and possible relationships.
The Julia helper reports compiler representations, not execution traces or a complete call graph.
Prose is plain text, code is literal text, and raw HTML or hand-written Mermaid is not accepted.
Graphs render when the HTML opens and require JavaScript.
Comments use browser storage where available and can be carried in a saved HTML or feedback JSON file.
They do not synchronize between reviewers.
The static node and relationship list remains readable if a graph cannot render.
The bundled Mermaid library makes each export about 5 MB.
