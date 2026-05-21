# Dropbox → Slack Upload Notifier — Workflow Overview

**n8n Instance:** https://tenzinsteel.app.n8n.cloud
**Main Workflow:** Dropbox Upload Monitor (ID: `JttUNVm0MUk3W8YP`)
**Last updated:** 2026-05-21

---

## What It Does

When you upload files to your Dropbox under `/by date/2026/`, n8n automatically detects the new folder, waits until the upload is fully stable (i.e. the file count stops changing for 2 consecutive checks), then posts a summary message to the `#test` Slack channel listing each project and how many files were uploaded.

---

## Credentials

Two sets of credentials are configured in n8n:

| Name | Service | Used By |
|------|---------|---------|
| Dropbox OAuth2 API | Dropbox | All Dropbox nodes |
| Slack OAuth2 API | Slack | Slack notification node |

Both are connected via OAuth2 — n8n has authorized access to Dropbox and Slack and holds the tokens securely.

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

Compares the date folders returned by Dropbox against a permanent internal record of folders already processed (`staticData.processedDatesText`). Any folder not in that record is treated as new. New folders are sorted most-recent-first so the latest upload is handled first.

Key settings configured here:
- **SLACK_CHANNEL** = `#test` — where notifications are posted
- **REQUIRED_STABLE_CHECKS** = `2` — how many consecutive identical file counts are needed before a notification fires

---

### 5. Split In Batches (Date Folders)
**Type:** Split In Batches

Processes each new date folder one at a time. After a folder's Slack message is sent, the workflow loops back here to pick up the next folder. When all new folders are done, the workflow ends.

---

### 6. Dropbox: List Date Folder
**Type:** Dropbox — list folder
**Path:** dynamic (the current date folder being processed)
**Credential:** Dropbox OAuth2 API

Lists the contents of the current date folder (e.g. `/by date/2026/5-21-26`) to find all the project subfolders inside it. This node is also the target of the retry loop — if an upload isn't stable yet, the workflow comes back here after waiting 30 seconds.

---

### 7. Code: Filter & Tag Projects
**Type:** Code (JavaScript)

Filters the folder listing to keep only subfolders (skipping any loose files at the date-folder level). Each project folder is tagged with its name, path, and which date folder it belongs to, so that data travels together through the rest of the workflow.

---

### 8. HTTP Request: Count Files Recursively
**Type:** HTTP Request (POST to Dropbox API)
**Endpoint:** `https://api.dropboxapi.com/2/files/list_folder`
**Credential:** Dropbox OAuth2 API

For each project folder, this calls the Dropbox API directly with `recursive: true` to count every file nested anywhere inside — including subfolders of subfolders. This gives an accurate total file count per project regardless of how deep the folder structure goes.

---

### 9. Code: Check Stability, Decide & Format
**Type:** Code (JavaScript)

The stability check. It compares the current total file count against the count from the last check (stored in `staticData.pendingFolders`):

- Count **changed** → reset the stable-check counter (upload still in progress)
- Count **the same** → increment the counter
- Counter reaches **2** → mark the folder as fully processed and format the Slack message

Example Slack message:
```
Project Alpha - 14 files, was successfully uploaded to 5-21-26
Project Beta - 8 files, was successfully uploaded to 5-21-26
```

Once a folder is marked done it's written to the permanent record so it's never processed again, even if the workflow is triggered again later.

---

### 10. IF: Upload Complete?
**Type:** IF condition (`ready === true`)

Routes the workflow based on the stability check result:
- **TRUE** → send the Slack notification
- **FALSE** → wait 30 seconds and re-check

---

### 11. Slack: Send to #test
**Type:** Slack — send message
**Channel:** `#test`
**Credential:** Slack OAuth2 API

Posts the formatted upload summary to your `#test` Slack channel. After the message is sent, loops back to the Split In Batches node to process the next date folder (if any).

---

### 12. Wait: 30s
**Type:** Wait (30 seconds)

When an upload isn't stable yet, the workflow pauses here for 30 seconds before looping back to re-check the date folder (back to node 6). This repeats until the file count stabilizes across 2 consecutive checks.

---

### 13. Manual Trigger
**Type:** Manual Trigger

A "run now" button in the n8n editor. Plugs into the List Year Folder node, so you can trigger the full workflow manually from the n8n UI without waiting for a real Dropbox upload event. Useful for testing.

---

## Full Flow Summary

```
You upload files to Dropbox (/by date/2026/5-21-26/ProjectName/)
  → Dropbox calls the webhook URL
    → n8n replies 200 OK immediately
    → Lists /by date/2026 to find all date folders
    → Filters to only new date folders not yet processed
    → For each new date folder:
        → Lists project subfolders inside it
        → Counts all files recursively per project
        → Checks if file counts are stable:
            STABLE (2 consecutive same counts)
              → Post summary to #test Slack
              → Move to next date folder
            NOT STABLE
              → Wait 30s → re-check same folder
```

---

## Supporting Workflows

| Workflow | ID | Purpose |
|----------|----|---------|
| Dropbox Webhook Verify | `XF1pruIwZBcqW91W` | Handles the one-time GET request Dropbox sends when first registering the webhook URL to confirm it's valid |
| Error Handler | `qZpsmMNj7o69jvRh` | Catches any failures in the main workflow |
