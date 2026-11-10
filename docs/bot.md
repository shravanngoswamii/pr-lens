# Review bot

Comment `@YOUR-BOT review` on a public PR, or request the bot as a reviewer.
Only accounts listed in `bot.hosted.json` can trigger it.
The whole comment must be the command.
Inline comments are not triggers.
Reviewer requests require the bot to be a repository collaborator.
The requester also needs GitHub's permission to assign reviewers.

## Where it runs

| Step | Location |
| --- | --- |
| Find requests and collect source | GitHub-hosted Ubuntu runner |
| Analyze the PR | Claude Code on that runner, using your subscription |
| Parse Julia declarations | Julia on the runner, without loading the package |
| Validate and inspect HTML | Node and offline Chromium on the runner |
| Serve HTML and editable JSON | The bot's public GitHub Pages repository |
| Run the PR's package tests | Not part of this worker |

The laptop can be off.
The worker checks every 30 minutes, subject to GitHub delays.
GitHub disables public schedules after 60 days without repository activity.
Re-enable them with `gh workflow enable review-bot.yml --repo OWNER/TOOL`.
Idle checks do not call Claude.
Use **Run workflow** for an immediate check.
An optional comment or `#event-ID` request URL selects one request.
Use **retry** only after a failed run.
New revisions need a new comment or reviewer request.

Comment requests get an eyes reaction and a reply.
Reviewer requests get a comment review pinned to the checked head.
The bot never approves or requests changes.
Reports use `reviews/OWNER/REPO/PR/HEAD/REQUEST/`.
Deployment and the live revision are checked before replying.

## Set up your bot

Follow [setup](setup.md) with your own accounts and credentials.
The included configuration allows `shravanngoswamii`, `yebai` and `sunxd3`.
GitHub account IDs pin their identities.

The hosted worker currently supports Claude subscriptions.
The skill also works with Codex interactively.
OpenAI's account-auth CI guide excludes public repositories.
A hosted Codex adapter is not included.
See [Claude authentication](https://code.claude.com/docs/en/github-actions#manual-setup) and [Codex CI authentication](https://learn.chatgpt.com/docs/auth/ci-cd-auth).
Subscription limits and GitHub Actions limits apply separately.

## Local

Copy [bot.example.json](../bot.example.json), replace its accounts and set absolute paths.
Use `gh api users/LOGIN --jq .id` for each requester ID.
Sign in to Claude Code with your subscription.
The optional `sandbox` uses [gh-sandbox](https://github.com/shravanngoswamii/gh-sandbox).

```sh
npm ci
npx playwright install chromium
node bin/review-bot.js doctor output/bot.json
node bin/review-bot.js watch output/bot.json
```

Keep the PC awake and the worker running.
Use `once` for one pass, or `run` and `retry` with `--comment REQUEST_URL`.
Do not run local and hosted workers for the same bot together.

## Limits

The worker reads source and does not execute PR code, setup hooks or runtime tests.
Julia inventories describe written declarations, not runtime dispatch.
Private repositories are excluded.
Linked work has depth 2 and a budget of 15 items.
Large changes need interactive review.
HTML comments stay local until exported.

State keeps the polling cursor and request results.
Posted replies are checked before posting again.
Failed jobs need an explicit retry.
Public Actions logs and caches must be treated as public.
Credentials stay outside the cache and the model's evidence.
