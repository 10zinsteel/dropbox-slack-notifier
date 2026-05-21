# Potential Upgrade: Full File Database + Change Detection

## Goal

Expand the workflow to track a complete database of all date folders, address subfolders, and file counts. Instead of only detecting new date folders, the workflow would detect any change — additions, deletions, or new folders — and send a targeted Slack message describing what changed.

## New Data Model

Stored in `staticData` inside n8n:

```json
{
  "5-16-26": {
    "Address A": 10,
    "Address B": 4
  },
  "5-21-26": {
    "Address A": 6,
    "Address B": 7
  }
}
```

## How It Works

On every webhook trigger:
1. Scan all date folders and count files per address subfolder
2. Compare current counts to the saved database
3. Detect changes and send Slack messages
4. Update the database with the new counts

## Change Types & Slack Messages

| Change | Example Message |
|---|---|
| New date folder | "New upload: 5-21-26 — Address A (6 files), Address B (7 files)" |
| Files added to old folder | "Update to 5-16-26 — Address A: 10 → 12 files (+2)" |
| Files deleted | "Files removed from 5-16-26 — Address B: 4 → 2 files (−2)" |

## Stability Check

Both **additions** and **deletions** use the existing 2-check / 30s wait before notifying. This avoids mid-upload noise and confirms the change is settled before sending.

## Open Question

- **Entire folder deleted** — if a whole date folder is removed, should the workflow send a Slack message or silently update the database?
