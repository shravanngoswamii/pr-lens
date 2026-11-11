# Review bot

Post a public PR URL on the configured inbox issue for an immediate review.
You can also comment `@YOUR-BOT review` on a public PR, or request the bot as a reviewer.
Only accounts listed in the bot repository's `REVIARY_CONFIG` can request reviews.
Use the whole comment for the PR URL or mention command with optional model and effort flags.
Inline comments are not triggers.
Reviewer requests require the bot to be a repository collaborator.
The requester also needs GitHub's permission to assign reviewers.

## Review options

Append options to a mention or inbox URL:

```text
@YOUR-BOT review --model opus --effort high
https://github.com/OWNER/REPO/pull/NUMBER --model sonnet --effort medium
```

| Model | Effort | Options |
| --- | --- | --- |
| Sonnet | Medium | `--model sonnet --effort medium` |
| Sonnet | High | `--model sonnet --effort high` |
| Opus | High | `--model opus --effort high` |
| Opus | Extra high | `--model opus --effort xhigh` |
| Opus | Max | `--model opus --effort max` |

Either flag is optional.
Missing values use the bot configuration, then Claude's defaults.
Reviewer requests use the bot configuration.
Use a model alias or full model ID your subscription supports.
Effort accepts `low`, `medium`, `high`, `xhigh` and `max`.
Available levels depend on the selected model.
Higher effort can use more subscription allowance.
Unknown flags, duplicate flags and extra text are rejected.
Post a new comment to change options after a review starts.
See [Claude model and effort settings](https://code.claude.com/docs/en/model-config).

## Where it runs

| Step | Location |
| --- | --- |
| Find requests and collect source | GitHub-hosted Ubuntu runner |
| Analyze the PR | Claude cloud when configured, otherwise Claude Code on the runner |
| Parse Julia declarations | Julia on the runner, without loading the package |
| Validate and inspect HTML | Node and offline Chromium on the runner |
| Serve HTML and editable JSON | The bot's public GitHub Pages repository |
| Run the PR's package tests | Not part of this worker |

The laptop can be off.
Inbox comments start the worker through GitHub's `issue_comment` event.
Mentions and reviewer requests are checked every 30 minutes, subject to GitHub delays.
GitHub disables public schedules after 60 days without repository activity.
Re-enable them with `gh workflow enable review-inbox.yml --repo OWNER/TOOL`.
Idle checks do not call Claude.
Use **Run workflow** for an immediate check.
An optional comment or `#event-ID` request URL selects one request.
Use **retry** only after a failed run.
New revisions need a new comment or reviewer request.

Inbox requests get an eyes reaction on the inbox comment and a reply on the PR.
Mention requests get an eyes reaction and a reply on the PR.
Reviewer requests get a comment review pinned to the checked head.
The bot never approves or requests changes.
Reports use `reviews/OWNER/REPO/PR/HEAD/REQUEST/`.
Deployment and the live revision are checked before replying.
The worker sets the PR check time from its collected evidence.

## Set up your bot

Follow [setup](setup.md) with your own accounts and credentials.
Each bot owner chooses their requesters.
GitHub account IDs pin their identities.
Set `model` and optional `effort` as the defaults.
The report records the requested model, effort and provider-reported model names under About this review.
Older reports may lack model metadata.

The hosted worker currently supports Claude subscriptions.
The skill also works with Codex interactively.
OpenAI's account-auth CI guide excludes public repositories.
A hosted Codex adapter is not included.
See [Claude authentication](https://code.claude.com/docs/en/github-actions#manual-setup) and [Codex CI authentication](https://learn.chatgpt.com/docs/auth/ci-cd-auth).
Subscription limits and GitHub Actions limits apply separately.

## Claude cloud sessions

[Set up and renew the cloud login](cloud.md).
[Claude cloud sessions](https://code.claude.com/docs/en/claude-code-on-the-web#send-follow-ups-from-the-cli) accept follow-up messages through the signed-in CLI.
Cloud-task triggers create a new session for each run.
With `cloud` configured, the worker reuses each PR's saved session and runs analysis in Claude's cloud.
Use `--fresh` to replace it.
Model and effort changes require a fresh session.
Use **Run workflow > Check cloud access** to test the hosted credentials without creating a session or running a review.
Inference access and cloud-session access are checked separately.
GitHub Actions handles authorization, source checks, rendering and publication.

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

## Repository ownership

Reviary supplies code and the reusable workflow.
The caller's bot repository owns the workflow run and its credentials.
The shared code runs on the caller's GitHub runner with explicitly supplied secret inputs.
Pin the tool commit in the caller workflow and update it when upgrading.

| Data | Location |
| --- | --- |
| Bot GitHub token | Bot repository Actions secret `REVIEW_BOT_TOKEN` |
| Runner inference token | Bot repository Actions secret `CLAUDE_CODE_OAUTH_TOKEN` |
| Cloud login refresh token | Bot repository Actions secret `CLAUDE_CODE_OAUTH_REFRESH_TOKEN` |
| Cloud task creation tokens | Bot repository Actions secret `CLAUDE_CLOUD_TRIGGERS` |
| Cloud login scopes | Bot repository Actions variable `CLAUDE_CODE_OAUTH_SCOPES` |
| PR sessions and delivery receipts | Bot repository Actions variable `REVIARY_SESSIONS` |
| Bot name, requester IDs, model and publishing paths | Bot repository Actions variable `REVIARY_CONFIG` |
| Worker switch | Bot repository Actions variable `REVIARY_ENABLED` |
| Request cursor and job results | Bot repository Actions cache |
| HTML and editable JSON | Bot repository `gh-pages` branch |

GitHub also creates a temporary `GITHUB_TOKEN` for each job.
This workflow limits it to reading contents and Actions metadata.
The bot's token supplies cross-repository GitHub access.
Claude receives its subscription token without the GitHub credentials.
Credentials are injected into the job environment and are not written to reports or cached state.
No personal access token from the bot owner is needed in Reviary.
