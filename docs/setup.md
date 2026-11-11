# Set up a hosted bot

Use a separate GitHub bot account and your own Claude subscription.
The bot's reports repository runs the worker and hosts its output.
Reviary supplies the reusable workflow, skill and renderer.
No fork or credentials in the Reviary repository are needed.

## Reports repository

As the bot, create a public repository with a README and enable issues.
Create a `gh-pages` branch and make it the default branch.
In **Settings > Pages**, select **Deploy from a branch**, `gh-pages`, `/ (root)`.
Add an empty `.nojekyll` file on that branch.
Create an issue for review requests.

## Configuration

Clone Reviary alongside your bot repository.
From the bot repository checkout, generate its configuration:

```sh
node ../reviary/scripts/configure-bot.js YOUR-BOT YOUR-BOT/reviary-reports YOUR-LOGIN > bot-config.json
```

Add more requester logins as arguments.
Add `"inbox": { "repo": "YOUR-BOT/reviary-reports", "issue": 1 }` to `bot-config.json` with your issue number.
Generated settings use Sonnet and medium effort.
Change those values for a different default.
Request comments can [override these defaults](bot.md#review-options).
Edit `publish.url` for custom domains.

As the bot, save the configuration:

```sh
gh variable set REVIARY_CONFIG --repo YOUR-BOT/reviary-reports < bot-config.json && rm bot-config.json
```

Copy [review-inbox.yml](../examples/review-inbox.yml) to `.github/workflows/review-inbox.yml` in the reports repository.
Replace `OWNER/TOOL` with `shravanngoswamii/reviary` or your fork.
Replace both `COMMIT_SHA` values with the same full tool commit.
Commit the workflow on the bot repository's default branch.
Keep settings in `REVIARY_CONFIG` under **Settings > Secrets and variables > Actions > Variables**.

## Credentials

Add these Actions secrets to the reports repository:

| Secret | Value |
| --- | --- |
| `REVIEW_BOT_TOKEN` | The bot's GitHub token with `public_repo` and `notifications` scopes |
| `CLAUDE_CODE_OAUTH_TOKEN` | Runner reviews only: subscription token from `claude setup-token` |

Generate the Claude token locally with `claude setup-token`.
For Claude cloud reviews, use [cloud setup](cloud.md) instead of the inference token.
Use hidden prompts with `gh secret set NAME --repo YOUR-BOT/reviary-reports`.
Never put tokens in the JSON or commit them.
Replace the matching Actions secret when a credential expires.
When using a minimal runtime token, add the workflow through GitHub's web editor as the bot.
Pushing workflow files by CLI also requires GitHub's `workflow` scope.

## Enable

```sh
gh variable set REVIARY_ENABLED --body true --repo YOUR-BOT/reviary-reports
gh workflow enable review-inbox.yml --repo YOUR-BOT/reviary-reports
```

Post a public PR URL as the whole comment on the inbox issue.
Its creation starts a review without waiting for the poller.
GitHub may queue the job.
The bot reacts in the inbox and replies on the PR.
Only configured requester IDs are allowed.
The authorized worker uses `cache-mode: write` to save retry checkpoints for inbox events.

PR mentions and reviewer requests are polled every 30 minutes.
Reviewer requests need the bot as a repository collaborator.
Comment triggers do not need collaborator access.
Keep the bot's mention and review-request notifications enabled.
Run one worker instance per bot so state and publishing stay serialized.

Use **Run workflow > Check Claude subscription** for an authentication and model check.
The worker reviews source and checks HTML.
It does not run package tests or publish private PRs.
See [flow and limits](bot.md).
