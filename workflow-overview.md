# Dropbox → Slack Upload Notifier — Workflow Overview

**n8n Instance:** https://tenzinsteel.app.n8n.cloud  
**Last updated:** 2026-05-22

---

## Workflows

| Workflow | ID | Link |
|---|---|---|
| Main: Dropbox Upload Monitor | `JttUNVm0MUk3W8YP` | https://tenzinsteel.app.n8n.cloud/workflow/JttUNVm0MUk3W8YP |
| Dropbox Webhook Verify | `XF1pruIwZBcqW91W` | https://tenzinsteel.app.n8n.cloud/workflow/XF1pruIwZBcqW91W |
| Error Handler | `qZpsmMNj7o69jvRh` | https://tenzinsteel.app.n8n.cloud/workflow/qZpsmMNj7o69jvRh |

---

## Webhook URL

```
https://tenzinsteel.app.n8n.cloud/webhook/dropbox-notify
```

Register this URL in the Dropbox developer app (Webhooks tab). n8n routes GET (verification) to the verify workflow and POST (notifications) to the main workflow.

---

## What It Does

When anything changes in your Dropbox under `/by date/2026/`, n8n scans all date folders, compares file counts per address subfolder against its database, and sends targeted Slack messages describing exactly what changed — new uploads, file additions, file removals, or deleted folders. Changes are confirmed stable across 2 consecutive checks before notifying.

---

## Architecture (16 nodes)

```
Webhook: Dropbox Notify (POST /webhook/dropbox-notify)
  → Respond: 200 OK               ← sends immediate 200 to Dropbox, then continues
  → Dropbox: List Year Folder (/by date/2026)
  → Code: Find New Folders        ← migrates/reads/writes staticData.db, detects deletions
  → Split In Batches (Date Folders)
      DONE  → Code: Send Deletion Messages → Slack: Send Deletion Alert
      LOOP  → Dropbox: List Date Folder    ← also looped back to from Wait: 60s
                → Code: Filter & Tag Projects
                → Dropbox: List Project Files
                → Code: Check Stability, Decide & Format
                → IF: Upload Complete?
                    TRUE  → Slack: Send to #test → loop back to Split In Batches
                    FALSE → IF: No Change?
                                TRUE  → loop back to Split In Batches (skip folder)
                                FALSE → Wait: 60s → loop back to Dropbox: List Date Folder

Manual Trigger → Dropbox: List Year Folder (for manual test runs)
```

---

## Credentials

Two sets of credentials are configured in n8n:

| Name | Service | Used By |
|------|---------|---------|
| Dropbox OAuth2 API | Dropbox | All Dropbox nodes |
| Slack OAuth2 API | Slack | Slack notification node |

Both are connected via OAuth2 — n8n has authorized access to Dropbox and Slack and holds the tokens securely.

---

## Key Config

Constants set in **Code: Find New Folders**:

- `SLACK_CHANNEL`: `#test`
- `REQUIRED_STABLE_CHECKS`: `2`

---

## Storage Model

Stored in `staticData` (n8n workflow static data, persists between executions):

- `staticData.db` — `{ "5-21-26": { "Address A": 6, "Address B": 4 } }` — per-subfolder file counts per date folder
- `staticData.pendingChanges` — in-progress stability checks (cleared after each notification)
- `staticData.deletionMessages` — queued deletion alert strings (flushed by Code: Send Deletion Messages)

### Change Types Detected

| Trigger | Slack Message |
|---|---|
| New date folder | `New upload: 5-21-26 — Address A (6 files), Address B (4 files)` |
| Files added to existing folder | `Update to 5-21-26 — Address A: 6 → 8 files (+2)` |
| Files removed | `Files removed from 5-21-26 — Address A: 6 → 4 files (-2)` |
| New subfolder in existing folder | `New subfolder in 5-21-26 — Address B: 3 files` |
| Entire folder deleted | `Folder deleted: 5-16-26 — Address A (6 files), Address B (4 files)` |

---

## Node-by-Node Breakdown

### 1. Webhook: Dropbox Notify
**Type:** Webhook (POST /webhook/dropbox-notify)

This is the entry point. Dropbox is configured to call this URL whenever anything changes in your account (file added, modified, etc.). The webhook listens for those incoming POST requests.

---

### 2. Respond: 200 OK
**Type:** Respond to Webhook

Immediately sends a `200 OK` acknowledgment back to Dropbox. This is required — Dropbox expects a response within a few seconds or it will retry and eventually disable the webhook. The workflow continues processing in the background after this reply is sent.

---

### 3. Dropbox: List Year Folder
**Type:** Dropbox — list folder  
**Path:** `/by date/2026`  
**Credential:** Dropbox OAuth2 API

Reads the top-level contents of your `/by date/2026` folder to get a list of all date-named subfolders (e.g. `5-21-26`, `5-20-26`).

---

### 4. Code: Find New Folders
**Type:** Code (JavaScript)

On first run after the upgrade, migrates legacy `processedDatesText`/`pendingFolders` state into the new `staticData.db` format, seeding all known folders with a `null` sentinel so they're silently initialized on first scan.

On every run:
- Detects any date folder in `db` that no longer exists in Dropbox → queues a "Folder deleted" message into `staticData.deletionMessages` and removes it from `db`
- Returns ALL current date folders sorted most-recent-first (not just new ones) so the workflow can detect any change, not just brand-new folders

Key settings configured here:
- **SLACK_CHANNEL** = `#test` — where notifications are posted
- **REQUIRED_STABLE_CHECKS** = `2` — how many consecutive identical file counts are needed before a notification fires

---

### 5. Split In Batches (Date Folders)
**Type:** Split In Batches

Processes each date folder one at a time. After a folder's Slack message is sent, the workflow loops back here to pick up the next folder. When all folders are done, the DONE output fires the deletion message pipeline.

---

### 6. Dropbox: List Date Folder
**Type:** Dropbox — list folder  
**Path:** dynamic (the current date folder being processed)  
**Credential:** Dropbox OAuth2 API

Lists the contents of the current date folder (e.g. `/by date/2026/5-21-26`) to find all the address subfolders inside it. This node is also the target of the retry loop — if an upload isn't stable yet, the workflow comes back here after waiting 60 seconds.

---

### 7. Code: Filter & Tag Projects
**Type:** Code (JavaScript)

Filters the folder listing to keep only subfolders (skipping any loose files at the date-folder level). Each project folder is tagged with its name, path, and which date folder it belongs to, so that data travels together through the rest of the workflow.

---

### 8. Dropbox: List Project Files
**Type:** Dropbox — list folder (recursive)  
**Credential:** Dropbox OAuth2 API

For each address subfolder, lists all files recursively to get an accurate total file count regardless of how deep the folder structure goes.

---

### 9. Code: Check Stability, Decide & Format
**Type:** Code (JavaScript)

Compares per-subfolder file counts (from `staticData.db`) against the current Dropbox listing:

- **Migration sentinel** (`db[folder] === null`): silently saves current counts, returns `noChange: true`
- **No change** (counts match db): returns `noChange: true` — skips wait loop entirely
- **Change detected**: runs stability check using `staticData.pendingChanges`:
  - Counts differ from last check → reset stable counter
  - Counts same as last check → increment counter
  - Counter reaches 2 → build targeted Slack message, save new counts to `db`

Message format by change type:
- New folder: `New upload: 5-21-26 — Address A (6 files), Address B (4 files)`
- Files added: `Update to 5-21-26 — Address A: 6 → 8 files (+2)`
- Files removed: `Files removed from 5-21-26 — Address A: 6 → 4 files (-2)`
- New subfolder: `New subfolder in 5-21-26 — Address B: 3 files`

---

### 10. IF: Upload Complete?
**Type:** IF condition (`ready === true`)

Routes the workflow based on the stability check result:
- **TRUE** → send the Slack notification
- **FALSE** → check if it's a no-change skip (→ `IF: No Change?`)

---

### 10a. IF: No Change?
**Type:** IF condition (`noChange === true`)

Routes the FALSE branch from "IF: Upload Complete?":
- **TRUE** (no change detected) → loop back to Split In Batches to process next folder immediately
- **FALSE** (change detected but not yet stable) → Wait: 60s and re-check

---

### 11. Slack: Send to #test
**Type:** Slack — send message  
**Channel:** `#test`  
**Credential:** Slack OAuth2 API

Posts the formatted upload summary to your `#test` Slack channel. After the message is sent, loops back to the Split In Batches node to process the next date folder (if any).

---

### 12. Wait: 60s
**Type:** Wait (60 seconds)

When a change is detected but not yet stable, the workflow pauses here for 60 seconds before looping back to re-check the date folder (back to node 6). This repeats until the file counts stabilize across 2 consecutive checks.

---

### 12a. Code: Send Deletion Messages
**Type:** Code (JavaScript)

Runs after Split In Batches finishes all folders (the "done" output). Drains the `staticData.deletionMessages` queue built up by "Code: Find New Folders" and emits one item per message for Slack delivery.

---

### 12b. Slack: Send Deletion Alert
**Type:** Slack — send message  
**Channel:** `#test`

Sends deletion alerts for date folders that were removed from Dropbox. Each deleted folder gets its own message: `Folder deleted: 5-16-26 — Address A (6 files), Address B (4 files)`

---

### 13. Manual Trigger
**Type:** Manual Trigger

A "run now" button in the n8n editor. Plugs into the List Year Folder node, so you can trigger the full workflow manually from the n8n UI without waiting for a real Dropbox upload event. Useful for testing.

---

## Full Flow Summary

```
Anything changes in Dropbox (/by date/2026/)
  → Dropbox calls the webhook URL
    → n8n replies 200 OK immediately
    → Lists /by date/2026 to get all date folders
    → Detects any db-tracked folders missing from Dropbox → queues deletion messages
    → Feeds ALL date folders into Split In Batches (most-recent-first)
    → For each date folder:
        → Lists address subfolders
        → Lists files in each subfolder (recursive)
        → Compares per-subfolder counts to db:
            NO CHANGE → skip, move to next folder immediately
            MIGRATION SENTINEL (null) → silently init db, skip
            CHANGE DETECTED (not yet stable):
              → Wait 60s → re-check same folder
            STABLE (2 consecutive same counts):
              → Format targeted message (new/update/removed/new subfolder)
              → Post to #test Slack
              → Move to next date folder
    → After all folders done:
        → Flush deletion message queue → Post each to #test Slack
```

---

## MCP

n8n MCP server is configured in `.mcp.json` (project-level). It connects to the instance above.  
Run `claude mcp` in terminal to check server status if n8n tools aren't appearing.
