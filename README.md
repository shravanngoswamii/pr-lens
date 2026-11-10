# Review docs

Source-linked PR reviews with interactive diagrams, suggested edits and reviewer comments.
An agent writes JSON.
The renderer produces one offline HTML file.

## Use

Requires Node.js 22.12+ and npm.
Julia 1.10+ is needed for reflection and tests.

```sh
npm ci
mkdir -p output
node bin/review-docs.js render examples/dynamicppl-1529.json --out output/review.html
```

Open `output/review.html` in a browser.
Read the explanation in order, then explore diagrams for node details.
Overview, Changes, Design and Review form the reading path.
Details holds the full inventory and supporting material.
Use **Save > HTML with comments** to share it.
Comments stay local until exported.
Source links need internet access.
For a full change inventory and a reusable base graph, see [Design changes](docs/design.md).
Run `npm link` for the shorter `review-docs` command.

Ask an agent:

> Use the review-docs skill to explain this PR's design, behavior and findings: PR_URL

Load [SKILL.md](SKILL.md) here, or copy this checkout into your agent's skill directory and run `npm ci`.

For mention-triggered reviews using Claude Code and a separate GitHub account, see [Review bot](docs/bot.md).

[Format](docs/format.md) · [Helpers](docs/helpers.md) · [Linked work](docs/linked-work.md) · [Feedback](docs/feedback.md) · [Sharing](docs/sharing.md) · [Examples](examples/README.md) · [DrawShare](docs/drawshare.md)

## Test

```sh
npx playwright install --with-deps chromium
npm test
```

Runs Node, Julia and offline browser checks.
Validation checks structure, not design claims.
The agent verifies the evidence.
