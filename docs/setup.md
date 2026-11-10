# Set up a hosted bot

Use a separate GitHub bot account and your own Claude subscription.
Fork [PR Lens](https://github.com/shravanngoswamii/pr-lens) into your account and clone the fork.
The worker stays off until you enable it.

## Reports repository

As the bot, create a public repository with a README.
Create a `gh-pages` branch from its default branch.
In **Settings > Pages**, select **Deploy from a branch**, `gh-pages`, `/ (root)`.
Add an empty `.nojekyll` file on that branch.
The bot needs push access.
Keep this repository separate from the tool.

## Configuration

In your tool checkout, resolve the allowed requesters' account IDs:

```sh
node scripts/configure-bot.js YOUR-BOT YOUR-BOT/pr-lens-reports YOUR-LOGIN
```

Add more requester logins as arguments.
Commit `bot.hosted.json` and push to your fork's default branch.
The script assumes a project Pages URL without a custom domain.
Edit `publish.url` if yours differs.

## Credentials

Add these Actions secrets to the tool fork:

| Secret | Value |
| --- | --- |
| `REVIEW_BOT_TOKEN` | The bot's GitHub token with `public_repo` and `notifications` scopes |
| `CLAUDE_CODE_OAUTH_TOKEN` | Subscription token from `claude setup-token` |

Use hidden prompts with `gh secret set NAME --repo OWNER/TOOL`.
Never commit tokens.
An optional `REPORTS_DEPLOY_KEY` can replace token-based publishing to the reports repository.

## Enable

Enable Actions in your fork, then enable the worker:

```sh
gh variable set PR_LENS_ENABLED --body true --repo OWNER/TOOL
gh workflow run review-bot.yml --repo OWNER/TOOL
```

Check the run in Actions.
Then mention the bot on a public PR from an allowed account.
For reviewer requests, the bot must be an eligible reviewer in that repository.
Keep its review-request and mention email notifications enabled.
The polling cursor starts one day before the first run.
Keep the fork's default branch and workflow changes under your control.
No model or publishing secrets are used in contributor test runs.

The worker runs source review and report checks.
It does not run package tests or publish private PRs.
See [the flow and limits](bot.md).
