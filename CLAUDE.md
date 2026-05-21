# Dropbox → Slack Upload Notifier

Practice project for AI integration agency. Brother is the test client — monitors his Dropbox for new uploads and posts to Slack.

## n8n Instance

**URL**: https://tenzinsteel.app.n8n.cloud

## Workflows

| Workflow | ID | Link |
|---|---|---|
| Main: Dropbox Upload Monitor | `JttUNVm0MUk3W8YP` | https://tenzinsteel.app.n8n.cloud/workflow/JttUNVm0MUk3W8YP |
| Dropbox Webhook Verify (one-time) | `XF1pruIwZBcqW91W` | https://tenzinsteel.app.n8n.cloud/workflow/XF1pruIwZBcqW91W |
| Error Handler | `qZpsmMNj7o69jvRh` | https://tenzinsteel.app.n8n.cloud/workflow/qZpsmMNj7o69jvRh |

## Webhook URL

```
https://tenzinsteel.app.n8n.cloud/webhook/dropbox-notify
```

Register this URL in the Dropbox developer app (Webhooks tab). n8n routes GET (verification) to the verify workflow and POST (notifications) to the main workflow.

## Architecture (13 nodes)

```
Webhook: Dropbox Notify (POST /webhook/dropbox-notify)
  → Respond: 200 OK               ← sends immediate 200 to Dropbox, then continues
  → Dropbox: List Year Folder (/by date/2026)
  → Code: Find New Folders        ← reads/writes staticData.processedDatesText
  → Split In Batches (Date Folders)
  → Dropbox: List Date Folder     ← also looped back to from Wait: 30s
  → Code: Filter & Tag Projects
  → HTTP Request: Count Files Recursively
  → Code: Check Stability, Decide & Format
  → IF: Upload Complete?
      TRUE  → Slack: Send to #test → loop back to Split In Batches (next folder)
      FALSE → Wait: 30s → loop back to Dropbox: List Date Folder (re-check same folder)

Manual Trigger → Dropbox: List Year Folder (for manual test runs)
```

## Key Config (constants in "Code: Find New Folders")

- `SLACK_CHANNEL`: `#test`
- `REQUIRED_STABLE_CHECKS`: `2`

## Storage Model

- `staticData.processedDatesText` — newline-separated completed date folders (permanent)
- `staticData.pendingFolders` — in-progress file counts (cleared after each notification)

## Credentials

- `Dropbox OAuth2 API` (id: `VJXeW2ZSPlf6mGRs`) — assigned to all Dropbox nodes
- `Slack OAuth2 API` (id: `XoEZLkfGSHsUgjnl`) — assigned to Slack node

## MCP

n8n MCP server is configured in `.mcp.json` (project-level). It connects to the instance above.
Run `claude mcp` in terminal to check server status if n8n tools aren't appearing.
