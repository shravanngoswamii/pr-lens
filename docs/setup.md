# Set up your bot

Use your own GitHub bot account and Claude subscription.
Your bot's public repository stores its settings, credentials and reports.
Reviary supplies the skill and workflow.
No fork is needed.

## 1. Get the tools

Open a fresh Bash terminal on Linux or WSL.
Install [Node.js 22.12+](https://nodejs.org/en/download), [GitHub CLI](https://cli.github.com/) and [Claude Code](https://code.claude.com/docs/en/quickstart).

```sh
git clone https://github.com/shravanngoswamii/reviary.git
cd reviary
mkdir -p output
```

Run the commands below from this directory.
Replace `YOUR-BOT` with the bot's GitHub login and `YOUR-LOGIN` with your personal login.

## 2. Create the reports repository

Sign in to GitHub as the bot.

1. [Create a public repository](https://github.com/new) named `pr-reviews` with a README.
2. On **Code > Branches**, rename the default branch to `gh-pages`.
3. Use **Add file > Create new file** to add an empty `.nojekyll` file.
4. In **Settings > Pages**, choose **Deploy from a branch**, `gh-pages`, `/ (root)` and save.
5. Under **Issues**, create an issue named `Review requests` and note its number.

If Issues or Actions are disabled, enable them in the repository's Settings.

## 3. Create the GitHub token

While signed in as the bot, open [Settings > Developer settings > Personal access tokens > Tokens (classic)](https://github.com/settings/tokens).
Choose **Generate new token (classic)**, name it `Reviary`, choose an expiry and select `repo` and `notifications`.
Click **Generate token** and copy it.
Classic tokens allow replies on public PRs outside the bot's own repositories.

In the same terminal, paste it at this hidden prompt:

```sh
read -rsp 'Bot GitHub token: ' GH_TOKEN
export GH_TOKEN
printf '\n'
gh api user --jq .login
```

The output must be `YOUR-BOT`.
This terminal now uses the bot without changing your saved GitHub login.
Save the same token in the reports repository:

```sh
printf '%s' "$GH_TOKEN" | gh secret set REVIEW_BOT_TOKEN --repo YOUR-BOT/pr-reviews
```

All secrets appear under **pr-reviews > Settings > Secrets and variables > Actions > Secrets**.
Never paste tokens in configuration files or chat.

## 4. Choose the requesters

```sh
node scripts/configure-bot.js YOUR-BOT YOUR-BOT/pr-reviews YOUR-LOGIN > output/bot-config.json
```

Add other allowed logins after `YOUR-LOGIN`.
The helper looks up their GitHub IDs and sets Sonnet with medium effort.

Open `output/bot-config.json` and add these fields inside the outer `{}`.
Separate fields with commas.
Use your inbox issue number:

```json
"backend": "cloud",
"inbox": {"repo": "YOUR-BOT/pr-reviews", "issue": 1}
```

## 5. Connect Claude

Cloud reviews keep one session per PR and run while your laptop is off.
For VM reviews instead, use the optional steps below and skip the rest of this step.

### Cloud login

1. Open [Claude Code](https://claude.ai/code) and connect your GitHub account.
2. If that account differs from the bot, invite it through **pr-reviews > Settings > Collaborators > Add people** with Write access.
3. Accept the invitation from the connected account and allow Claude to access `pr-reviews`.
4. Run these commands and complete the Claude browser sign-in with your subscription account:

```sh
CLAUDE_CONFIG_DIR="$PWD/output/cloud-login" claude auth login
node bot/cloud-auth.js save output/cloud-login YOUR-BOT/pr-reviews
```

The helper saves `CLAUDE_CODE_OAUTH_REFRESH_TOKEN` as an Actions secret and `CLAUDE_CODE_OAUTH_SCOPES` as an Actions variable.
Repeat this login within 30 days to renew access.
[Claude's CI authentication guide](https://code.claude.com/docs/en/self-hosted-environments-testing#authenticate-from-ci) explains this limit.

### Session creation

At [Claude tasks](https://claude.ai/code/routines), choose **New task > Set up manually** if that menu appears.

| Field | Value |
| --- | --- |
| Name | `Reviary Sonnet medium` |
| Prompt | Contents of [cloud-task.txt](../examples/cloud-task.txt) |
| Repository | `YOUR-BOT/pr-reviews` |
| Model and effort | Sonnet, Medium |
| Trigger | API only |
| Connectors | Remove unused connectors |

Click **Create** and copy the API token before closing its dialog.
If adding the API trigger later, use **Edit > API > Generate token**.
Copy its **Fire URL** from the API panel.
[Claude's task guide](https://code.claude.com/docs/en/routines#add-an-api-trigger) shows these controls.

Add this top-level field to `output/bot-config.json`, replacing the URL:

```json
"cloud": {
  "triggers": {
    "sonnet/medium": "YOUR_FIRE_URL"
  }
}
```

Run this command, then paste `{"sonnet/medium":"YOUR_TASK_TOKEN"}` at its hidden prompt with the real token:

```sh
env -u GH_PROMPT_DISABLED gh secret set CLAUDE_CLOUD_TRIGGERS --repo YOUR-BOT/pr-reviews
```

The Fire URL is a setting.
The task token is a secret that creates first or `--fresh` sessions.
The cloud login sends follow-ups to saved sessions.
Add one task and matching JSON key for each model and effort pair you offer.

Create the session list once:

```sh
gh api --method POST repos/YOUR-BOT/pr-reviews/actions/variables \
  -f name=REVIARY_SESSIONS -f 'value={"version":1,"sessions":{}}'
```

Keep this variable when renewing or upgrading.
The command fails if it already exists.

<details>
<summary>Use a GitHub VM instead, or offer both modes</summary>

Run `claude setup-token` and sign in with your Claude subscription.
Copy the token it prints, then save it at this hidden prompt:

```sh
env -u GH_PROMPT_DISABLED gh secret set CLAUDE_CODE_OAUTH_TOKEN --repo YOUR-BOT/pr-reviews
```

For VM-only setup, set `"backend": "vm"` and omit `cloud` in `output/bot-config.json`.
To offer both modes, complete cloud setup too.
Requests can choose `--backend cloud` or `--backend vm`.

</details>

## 6. Save the settings and workflow

```sh
gh variable set REVIARY_CONFIG --repo YOUR-BOT/pr-reviews < output/bot-config.json
git rev-parse HEAD
```

Copy the full commit SHA printed by the second command.
On GitHub, use **Add file > Create new file** in `pr-reviews`:

1. Name the file `.github/workflows/review-inbox.yml`.
2. Paste [review-inbox.yml](../examples/review-inbox.yml).
3. Replace every `OWNER/TOOL` with `shravanngoswamii/reviary`.
4. Replace both `COMMIT_SHA` values with the copied SHA.
5. Commit to `gh-pages`.

Enable the bot:

```sh
gh variable set REVIARY_ENABLED --body true --repo YOUR-BOT/pr-reviews
gh workflow enable review-inbox.yml --repo YOUR-BOT/pr-reviews
```

Settings are under **Settings > Secrets and variables > Actions > Variables**.
Keep one worker per bot.

## 7. Try a review

In `pr-reviews`, open **Actions > Review requests > Run workflow**.
Select **Check cloud access** for cloud, or **Check Claude subscription** for VM, and run it.
These checks do not start reviews.

From an allowed personal account, post a public PR URL as the whole comment on the inbox issue.
The bot reacts, reviews the PR, publishes HTML and replies on the PR.
Follow the run under Actions if it fails.
Reviews read source without running package tests.

For options, PR mentions and retries, see [using the bot](bot.md).
For renewal or session recovery, see [cloud maintenance](cloud.md).
