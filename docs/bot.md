# Review bot

Run on your PC with Claude Code and a separate GitHub account through [gh-sandbox](https://github.com/shravanngoswamii/gh-sandbox).
No API key is used.
Claude must be signed in with your subscription.
Runs use its allowance.

## Start

Copy [bot.example.json](../bot.example.json) to `output/bot.json` and set the absolute paths.
Use a clean checkout of your Pages branch for publishing.
Git pushes from that checkout use your regular account.
Reactions and review comments use the configured bot account.

```sh
npm ci
npx playwright install chromium
node bin/review-bot.js doctor output/bot.json
node bin/review-bot.js watch output/bot.json
```

Comment on a public PR from the configured requester account:

```text
@shravangoswami-bot review
```

Keep the whole comment to that command.
The worker polls the bot account's notifications at GitHub's allowed interval, at least 60 seconds.
It reacts with eyes, collects the exact revisions and discussion, asks Claude for source context, writes the report, checks it offline, deploys it and posts a short reply.
No installation in the target repository is needed for a public conversation the bot can access.
Only PR conversation comments are supported.
Inline review comments are not triggers.

The PC must stay awake and the worker must remain running.
Ctrl+C stops it.
New requests are watched from the first start with a two-minute overlap.
For an earlier request, use its comment URL:

```sh
node bin/review-bot.js run output/bot.json --comment COMMENT_URL
node bin/review-bot.js retry output/bot.json --comment COMMENT_URL
```

`retry` resumes a failed request.
Completed replies are detected before posting again.
Failures stay in `stateDir/state.json` and the terminal log.
They are not retried automatically.
A changed base or head needs a new request.

## Scope

The agent uses the generic [review skill](../SKILL.md).
Julia PRs include a parsed declaration inventory when the helper succeeds.
Other languages use the same document format.
Small documentation PRs can omit graphs.

This version reviews source.
It reads Git blobs without checking out or executing PR code.
Claude has no execution tools, hooks or MCP servers and receives no GitHub credentials.
It can request more files from either reviewed revision.
Runtime tests, reflection and bug reproductions remain unverified.
The report states these limits.

Private PRs and private linked repositories are excluded.
Linked work has a depth limit of 2 and an item budget of 15.
Large diffs or source contexts stop with a request for interactive review.
The requester is allowlisted and jobs run one at a time.
The GitHub token stays in `ghsb` and the Claude login stays in Claude Code.
Keep state and logs out of Git.

Reports and editable JSON get permanent paths under `reviews/OWNER/REPO/PR/HEAD/COMMENT/`.
The worker checks deployment CI and the live revision before replying.
HTML comments remain local until exported.

[Claude CLI](https://code.claude.com/docs/en/headless) · [Subscription authentication](https://code.claude.com/docs/en/github-actions#manual-setup) · [GitHub polling](https://docs.github.com/en/rest/activity/notifications)
