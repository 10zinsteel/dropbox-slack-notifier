# Dropbox → Slack Notifier

This project manages n8n workflows that monitor a Dropbox folder structure and send Slack notifications when file changes are detected and confirmed stable.

## n8n Instance

- **URL**: https://relativitysystems.app.n8n.cloud
- **MCP**: configured in `.mcp.json` — Claude can read/write workflows directly via `n8n-mcp` tools
- **Primary workflow**: `Dropbox -> Slack` (ID: `fzJDirf4rCozS3L8`)

---

## Workflow: Dropbox -> Slack

### Purpose

Watches a Dropbox folder structure organized by date and address. When files are added, removed, or folders appear/disappear, the workflow confirms the change is stable then sends a Slack message and updates the DataTable baseline.

### Folder Structure (Dropbox)

```
/by date/2026/
  └── {MM-DD-YY}/          ← day folder
        └── {address}/      ← address folder
              └── *.jpg     ← photo files
```

### Persistent Storage

- **DataTable** (`ZXXWKWqkNSNR4lYK`): the baseline database. Each row is `{ day_folder, address_folder, file_count }`. This is the source of truth for "what count was last confirmed stable."
- **Workflow static data** (`stabilityCounters`): transient per-execution counter keyed by `address_path`. Tracks how many consecutive stable checks have passed for a given address. Reset to 0 when a change is first detected.

---

## Two Paths

### Seeding Path (manual trigger)

Bootstraps the DataTable from scratch. Walks all historical day folders, lists address folders, counts files, and upserts each row into the DataTable.

Run this once when setting up a new year or after clearing the DataTable.

```
Manual Trigger
→ List Year Folder (all of /by date/2026)
→ Sort + Check DB (sort descending, init staticData.db if empty)
→ List Day Folder
→ Filter to folders only
→ SplitInBatches (each address)
→ List Address Folder
→ Count Files
→ IF Has Files → Upsert Row to DataTable
→ loop back to SplitInBatches
```

### Monitoring Path (webhook trigger)

Fires whenever Dropbox sends a change notification. Responds 200 immediately (to satisfy Dropbox's webhook requirement), then processes changes.

```
Webhook: Dropbox Notify
→ Respond: 200 OK
→ [parallel]
    ├── List Year Folder → Get Recent Days (last 7, old→new) → List Day Folder → Filter Folders
    │     → Merge With Deleted → SplitInBatches (each address)
    │           → IF: Is Deleted?
    │                 ├── YES → Send Slack (deletion msg) → Update DataTable (file_count=0) → loop
    │                 └── NO  → List Address Folder (Check 1) → Detect Change
    │                               → IF: Has Change?
    │                                     ├── NO  → loop (no action)
    │                                     └── YES → [stability loop]
    │                                                   Wait 30s → List Address Folder (Stability)
    │                                                   → Code: Stability Check (counter++)
    │                                                   → IF: Ready to Notify? (counter >= 2)
    │                                                         ├── YES → Send Slack → Update DataTable → loop
    │                                                         └── NO  → Wait 30s (loop back)
    └── Get All Counts from DataTable
```

---

## Key Nodes (Monitoring Path)

| Node | Role |
|------|------|
| `Code: Get Recent Days` | Sorts day folders newest→oldest, slices last 7, **reverses to old→new** for iteration |
| `Code: Merge With Deleted` | Compares live Dropbox folders to DataTable rows for the current day. Injects synthetic deleted items for any address in DB but missing from Dropbox |
| `IF: Is Deleted?` | Routes deleted folders to immediate notification (no stability check needed) |
| `Code: Detect Change` | Compares live file count to DataTable stored count. Initializes `stabilityCounters[address_path]` in static data. Does NOT compose the Slack message |
| `Code: Stability Check` | Increments `stability_count` if count held steady vs. last check, resets to 0 if it changed. Composes the final Slack message using the stable count. `REQUIRED_STABLE_CHECKS = 2` |
| `IF: Ready to Notify?` | Fires when `stability_count >= 2` (two consecutive 30s checks with same count) |
| `Data Table: Update Count (Deletion)` | Sets `file_count = 0` for deleted folders to keep DataTable clean |

---

## Change Trigger Logic

| Condition | Action |
|-----------|--------|
| File count matches DataTable | Skip — no Slack, no DataTable update |
| File count changed (up or down) | Stability loop → Slack when stable |
| New address folder (not in DataTable) | Stability loop → Slack when stable |
| Address folder missing from Dropbox but in DataTable | Immediate Slack (no stability needed) → DataTable zeroed |

---

## Slack Message Format

**File changes / new folders** (composed in `Code: Stability Check` after stability confirmed):
```
📁 New job: *{address}*
Day: {MM-DD-YY}  |  {N} files

📸 Upload complete: *{address}*
Day: {MM-DD-YY}  |  {N} files (was {old})

🗑️ Files removed: *{address}*
Day: {MM-DD-YY}  |  {N} files (was {old})
```

**Deletions** (composed in `Code: Merge With Deleted`):
```
🗑️ Folder deleted: *{address}*
Day: {MM-DD-YY}  |  0 files (was {old})
```

---

## Other Workflows

| Name | ID | Status | Purpose |
|------|----|--------|---------|
| `Dropbox Webhook Verify` | `gs5MTQzslSJrni2M` | Active | Handles Dropbox's webhook verification handshake |
| `Dropbox -> Slack (error handler)` | `Vsh9CCIURjS4RaPi` | Inactive | Error handling stub |
| `AI_knowledge_base` | `fvEYrDHpOCrYhTGJ` | Active | Knowledge base workflow |
| `AI_knowledge_base_Steel&Zane` | `N1simdCl9IYR0ExE` | Inactive | Variant for Steel & Zane |
| `Quo -> MondayCrm` | `mxj6DklJX2V3O87G` | Inactive | CRM integration stub |

---

## Development Notes

- The stability check uses `REQUIRED_STABLE_CHECKS = 2` — two consecutive 30s windows with no change in file count. Tune this constant at the top of `Code: Stability Check`.
- The monitoring path only scans the **last 7 day folders** (old→new). Older history is not re-checked on each webhook ping.
- `stabilityCounters` in static data can accumulate stale keys over time (one per address per execution). This is harmless — keys are overwritten on the next detection event for that address.
- Dropbox sends the webhook notification before the upload is necessarily complete. The stability loop exists specifically to wait for the upload to finish settling before notifying.
