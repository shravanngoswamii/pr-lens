# Claude cloud setup

Cloud-session control needs a Claude subscription login with `user:sessions:claude_code` scope.
The one-year `setup-token` credential covers inference.
Cloud login grants last up to 30 days and need interactive renewal.
See [Anthropic's CI authentication guide](https://code.claude.com/docs/en/self-hosted-environments-testing#authenticate-from-ci).

## GitHub access

Connect your GitHub account in Claude Code.
Give that account Write access to your bot's reports repository.
Cloud sessions save review JSON on `claude/` branches.
The bot account handles report publication and PR replies.
Its classic GitHub token needs `repo` and `notifications` scopes.
Cloud login renewal updates an Actions secret, which [requires `repo` scope](https://docs.github.com/en/rest/actions/secrets#create-or-update-a-repository-secret).

## Sign in

From the Reviary checkout, use a dedicated directory:

```sh
CLAUDE_CONFIG_DIR="$PWD/output/cloud-login" claude auth login
```

Complete the browser sign-in with the Claude account that will run reviews.
This directory keeps the automation login separate from your normal CLI login.
Review the consent screen, which can also request connector, file-upload and plugin access.
The login helper uses Linux credential files.

Use your bot's authenticated `gh` identity to save it:

```sh
node bot/cloud-auth.js save output/cloud-login YOUR-BOT/pr-reviews
```

With gh-sandbox, prefix that command with `ghsb exec YOUR-SANDBOX --`.
The helper sends the refresh token through stdin.
It stores these values only in your bot repository:

| Setting | Location |
| --- | --- |
| `CLAUDE_CODE_OAUTH_REFRESH_TOKEN` | Actions secret |
| `CLAUDE_CODE_OAUTH_SCOPES` | Actions variable |

Keep `output/` ignored by git.
Keep credentials out of reports and workflow caches.

## Create sessions

Create an API-triggered task at [Claude scheduled tasks](https://claude.ai/code/routines).
Select your bot's reports repository and choose a model and effort level.
Use [cloud-task.txt](../examples/cloud-task.txt) as its saved prompt.
Use an API trigger without a schedule or GitHub event trigger.
The task prepares a session and waits for the controller's review message.

Add its Fire URL to `REVIARY_CONFIG`:

```json
"cloud": {
  "triggers": {
    "sonnet/medium": "https://api.anthropic.com/v1/claude_code/routines/trig_YOUR_ID/fire"
  }
}
```

Save its token as JSON in the bot repository's `CLAUDE_CLOUD_TRIGGERS` Actions secret:

```json
{"sonnet/medium":"YOUR_TASK_TOKEN"}
```

Use the hidden prompt from `gh secret set CLAUDE_CLOUD_TRIGGERS --repo YOUR-BOT/pr-reviews`.
gh-sandbox disables prompts, so use this form with a sandbox:

```sh
ghsb exec YOUR-SANDBOX -- env -u GH_PROMPT_DISABLED \
  gh secret set CLAUDE_CLOUD_TRIGGERS --repo YOUR-BOT/pr-reviews
```

The refresh token controls existing sessions.
The task token creates first or fresh sessions.
If you miss the task token, use **Edit task > API trigger > Regenerate** and save its replacement.
Add one task and matching key for each model and effort combination you offer.

Create the session registry once:

```sh
gh api --method POST repos/YOUR-BOT/pr-reviews/actions/variables \
  -f name=REVIARY_SESSIONS -f 'value={"version":1,"sessions":{}}'
```

This command fails if the variable already exists.
Renewal and upgrades keep the existing registry.

## Reuse sessions

`review` reuses the session for that GitHub repository ID and PR number.
The first request creates one when no session is registered.
`review --fresh` creates a replacement.
Retrying the same fresh request reuses its replacement.
Retrying a superseded fresh request stops without creating another session.
Model or effort changes require `--fresh` and a configured task for that combination.

The bot stores session IDs and delivery receipts in `REVIARY_SESSIONS`, outside the workflow cache.
Missing registry data stops the worker.
An unavailable session or uncertain delivery stops the request for recovery.
It never silently creates a replacement.

Cloud sessions push JSON to `claude/reviary-REQUEST_ID` in the bot repository.
GitHub Actions checks its request, session and revisions, validates its source links, then renders and inspects the report.
Only the bot publishes HTML and replies on the PR.

## Check

In the bot repository, choose **Actions > Review requests > Run workflow > Check cloud access**.
The check targets a nonexistent session.
It creates no session and runs no review.
A successful inference check does not verify cloud-session access.

The hosted login exchanges the refresh token through `claude auth login`.
It saves the latest refresh token back to the same Actions secret.
The runner's login directory is temporary.

## Recover

Open the saved Claude session before retrying a pending request.
If a creation response was lost, enter the actual session ID in its registry entry and set `status` to `ready`.
If delivery is marked `sending`, check the session for the message before marking it `queued`.
Use a new `--fresh` request when you choose to replace an unavailable session.

## Renew

Repeat **Sign in** and **Check** before the 30-day grant expires, or after a login failure.
Refresh-token rotation does not extend that grant.
Use [Claude's login settings](https://claude.ai/settings/security) to revoke an automation login.
