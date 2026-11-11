# Reviary

Source-linked PR reviews with interactive diagrams.
An agent writes JSON.
The renderer builds offline HTML.

[Skill](SKILL.md) | [Format](docs/format.md) | [Bot setup](docs/setup.md) | [Examples](examples/README.md)

## Use

Node.js 22.12+ is required.
Julia 1.10+ is needed for Julia helpers.

```sh
npm ci
node bin/reviary.js render examples/dynamicppl-1529.json --out review.html
```

Use the [skill](SKILL.md) to prepare a review from a PR URL.

## Bot

A shared workflow coordinates reviews from your bot's repository.
Use [Claude cloud](docs/cloud.md) to keep one session per PR.
That repository owns its credentials, settings and reports.
Reviews inspect source and check the HTML.
Package tests are not run.

## Test

```sh
npx playwright install --with-deps chromium
npm test
```
