# Use the bot

[Set up your own bot](setup.md) with a Claude subscription.
Hosted Codex reviews are not implemented.
Codex can use [the skill](../SKILL.md) interactively.

## Request a review

Post a public PR URL on the inbox issue, or comment on the PR:

```text
https://github.com/OWNER/REPO/pull/123
@YOUR-BOT review
```

Use one command as the whole comment.
Only requester IDs in `REVIARY_CONFIG` are allowed.
Inline review comments are not triggers.

Inbox comments start a workflow event.
PR mentions and reviewer requests are checked every five minutes, subject to GitHub delays.
Reviewer requests need the bot as a repository collaborator and permission to assign reviewers.
Keep the bot's mention and review-request notifications enabled.

## Review options

Append the same flags to a mention or inbox URL:

| Choice | Flags |
| --- | --- |
| Cloud, Sonnet, medium | `--backend cloud --model sonnet --effort medium` |
| VM, Sonnet, high | `--backend vm --model sonnet --effort high` |
| VM, Opus, high | `--backend vm --model opus --effort high` |
| New cloud session, Opus, max | `--backend cloud --fresh --model opus --effort max` |

Flags are optional.
Backend uses the configuration, then cloud if configured, otherwise VM.
Model and effort use the configuration, then Sonnet and medium.
Available models and effort levels depend on your [Claude account](https://code.claude.com/docs/en/model-config).

Cloud keeps one session per PR, including its model and effort.
Changing either needs `--fresh` and a matching task preset.
VM uses a fresh Claude Code process and leaves cloud sessions unchanged.
Post a new comment to change options after a request starts or the PR changes.

## What runs where

| Step | Location |
| --- | --- |
| Check requester, read PR and collect source | GitHub-hosted Ubuntu runner |
| Analyze with the skill and write review JSON | Claude cloud or Claude Code on the runner |
| Validate source links, render and inspect HTML offline | Node, Julia and Chromium on the runner |
| Host HTML and editable JSON | Bot repository's GitHub Pages |
| Reply with Approve or Hold and the report link | Bot's GitHub account |

The laptop can be off.
Claude uses your subscription allowance.
GitHub Actions limits apply separately.
Idle checks do not call Claude.

Reviews inspect public source without running PR code or package tests.
Julia inventories describe written declarations, not runtime dispatch.
Linked-work collection stops at depth 2 or 15 items and shows unread items.
Recommendations are advice, not formal GitHub approvals.
HTML comments stay local until exported.

## Retry and maintain

- After a failed run, use **Actions > Review requests > Run workflow**, enter the original request comment URL and select **retry**.
- For an immediate mention check, use **Run workflow** without a URL.
- If GitHub disables the schedule after 60 inactive days, run `gh workflow enable review-inbox.yml --repo YOUR-BOT/pr-reviews`.
- Renew expired tokens in the bot repository's Actions secrets.
  See [cloud maintenance](cloud.md) for cloud login and session recovery.
- To upgrade, replace both tool SHAs in the caller workflow with the same reviewed Reviary commit.

Settings and session IDs live in Actions variables.
Tokens live in Actions secrets.
The caller workflow passes them to the pinned Reviary code on its runner.
Request checkpoints use Actions cache and reports use `gh-pages`.
Logs, cache and reports are public.
Credentials stay out of them.

## Local worker

Copy [bot.example.json](../bot.example.json) to `output/bot.json` and replace accounts, IDs and paths.
Look up IDs with `gh api users/LOGIN --jq .id`.
Sign in to Claude Code with your subscription and authenticate `gh` as the bot.
The optional `sandbox` field uses [gh-sandbox](https://github.com/shravanngoswamii/gh-sandbox).

```sh
npm ci
npx playwright install chromium
node bin/review-bot.js doctor output/bot.json
node bin/review-bot.js watch output/bot.json
```

Keep the PC awake.
Do not run local and hosted workers for the same bot together.
