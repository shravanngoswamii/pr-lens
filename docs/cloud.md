# Cloud maintenance

For first-time setup, follow [Set up your bot](setup.md#5-connect-claude).
Run the commands below from Reviary with `gh` authenticated as the bot.

## Renew the login

Cloud login expires within 30 days.
Repeat the browser sign-in, save the new grant and run **Check cloud access**:

```sh
CLAUDE_CONFIG_DIR="$PWD/output/cloud-login" claude auth login
node bot/cloud-auth.js save output/cloud-login YOUR-BOT/pr-reviews
```

Actions rotates the refresh token after use, but this does not extend the grant.
Keep `REVIARY_SESSIONS` when renewing.
[Claude's CI guide](https://code.claude.com/docs/en/self-hosted-environments-testing#authenticate-from-ci) explains the expiry.

## Replace a task token

Open the task at [Claude tasks](https://claude.ai/code/routines), then **Edit > API > Regenerate**.
Copy the replacement and update `CLAUDE_CLOUD_TRIGGERS`:

```sh
env -u GH_PROMPT_DISABLED gh secret set CLAUDE_CLOUD_TRIGGERS --repo YOUR-BOT/pr-reviews
```

Paste the full JSON map, such as `{"sonnet/medium":"NEW_TOKEN"}`, keeping other preset keys.
With gh-sandbox, prefix these commands with `ghsb exec YOUR-SANDBOX --`.

## Link a regular session

Create a session in Claude Code using the reports repository and your chosen model and effort.
Link it to the PR:

```sh
node bot/sessions.js link YOUR-BOT/pr-reviews PR_URL SESSION_URL --model opus --effort high
```

The helper saves the link without sending a message or verifying the model.
Replacing a link needs `--fresh`.
Set `"cloud": {"triggers": {}}` in `REVIARY_CONFIG` to use manually linked sessions only.
Requests use `--backend cloud`.

## Recover a stopped request

The worker stops on uncertain session creation or message delivery instead of creating a duplicate.
Open the Claude session before retrying.
Edit its entry in the `REVIARY_SESSIONS` Actions variable only after checking it:

| State | Recovery |
| --- | --- |
| Creation response lost | Set `session.id` to the actual ID and `status` to `ready` |
| Delivery marked `sending` | Confirm the review message arrived, then set `delivery.status` to `queued` |
| Session unavailable | Post a new request with `--fresh` to replace it |

Retry the original request from **Run workflow**.
Retrying the same fresh request reuses its replacement.
A fresh request superseded by another session cannot create another replacement.
