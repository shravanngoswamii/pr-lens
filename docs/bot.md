# Review bot

Comment `@shravangoswami-bot review` on a public PR.
The whole comment must be that command.
Only `shravanngoswamii`, `yebai` and `sunxd3` can request reviews.
Their GitHub account IDs are pinned in [the hosted config](../bot.hosted.json).
Inline review comments are not triggers.

## Hosted

[Review PR mentions](https://github.com/shravanngoswamii/review-docs/actions/workflows/review-bot.yml) runs on GitHub's servers.
The laptop can be off.
It polls notifications, reacts as the bot, reviews with Claude Code, checks the HTML offline, deploys it and replies.
Idle checks skip Claude and browser setup.
Claude uses the subscription allowance.
Private-repository runner use counts against GitHub's separate Actions allowance.

Use **Run workflow** for an immediate check or enter a conversation comment URL.
Select **retry** only for a failed request.
A changed base or head needs a new comment.
Manual dispatches are restricted to the same three accounts.

The workflow needs three private Actions secrets:

| Secret | Use |
| --- | --- |
| `CLAUDE_CODE_OAUTH_TOKEN` | Subscription token from `claude setup-token` |
| `REVIEW_BOT_TOKEN` | GitHub actions as the bot |
| `REPORTS_DEPLOY_KEY` | Push reports to the existing site repository |

Reports and editable JSON keep permanent paths under `reviews/OWNER/REPO/PR/HEAD/COMMENT/`.
Deployment CI and the live revision are checked before replying.
A private Actions cache retains the cursor and request results.
Completed replies are detected before posting again.
Failed artifacts stay available for an explicit retry.
Credentials stay outside the cache.

## Local

Copy [bot.example.json](../bot.example.json) to `output/bot.json` and set absolute paths.
The optional `sandbox` uses [gh-sandbox](https://github.com/shravanngoswamii/gh-sandbox) without changing your regular GitHub login.
Sign in to Claude Code with your subscription.

```sh
npm ci
npx playwright install chromium
node bin/review-bot.js doctor output/bot.json
node bin/review-bot.js watch output/bot.json
```

Keep the PC awake and the worker running.
Ctrl+C stops it.
Use `once` for one polling pass, or `run` and `retry` with `--comment COMMENT_URL`.
Failures appear in `stateDir/state.json` and the log.
Keep state and logs out of Git.

## Scope

The generic [review skill](../SKILL.md) applies across Julia packages and other languages.
Julia changes include a parsed declaration inventory when available.
Small reviews can omit graphs.
This version reviews source without executing PR code.
Runtime checks remain unverified.
Private repositories are excluded.
Linked work has depth 2 and an item budget of 15.
Large diffs or contexts need interactive review.
HTML comments remain local until exported.

[Working example](https://shravangoswami.com/experimental/reviews/mcmcjs/mcmcjs/172/8baf68352d0bad0985bb2b7381c7e683623eecf6/6777647256/) · [Claude subscription support](https://code.claude.com/docs/en/github-actions#manual-setup) · [GitHub polling](https://docs.github.com/en/rest/activity/notifications)
