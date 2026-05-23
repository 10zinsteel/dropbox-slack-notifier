# Client Onboarding — App Setup Guide
All third-party apps (Dropbox, Slack, etc.) must be created under the **Relativity AI** developer account, not a client's personal account.

---

## Dropbox

### One-time: Create the Dropbox App (Relativity AI account)
1. Go to [dropbox.com/developers/apps](https://dropbox.com/developers/apps) — logged into the Relativity AI account
2. Click **Create app**
3. Choose **Scoped access → Full Dropbox**
4. Name it "Relativity AI"
5. Go to **Permissions**, enable `files.metadata.read`, click **Submit**
6. On the **Settings** tab, copy the **App key** and **App secret**
7. Under **OAuth 2 → Redirect URIs**, add your n8n callback URL:
   `https://tenzinsteel.app.n8n.cloud/rest/oauth2-credential/callback`

### Per-client: Authorize against a client's Dropbox
1. In n8n, create a new **Dropbox OAuth2 API** credential using the Relativity AI app key and secret
2. Send the generated authorization URL to the client
3. Client opens the URL, logs into their Dropbox, and clicks **Allow**
4. Dropbox redirects back to your n8n instance — token is captured automatically
5. Use this credential in the client's workflow

> **Note:** Bodhi already has editor access to your n8n instance (`bodhi@steelandzane.com`), so he can authorize directly by logging in and clicking Connect himself.

---

## Slack

### One-time: Create the Slack App (Relativity AI account)
1. Go to [api.slack.com/apps](https://api.slack.com/apps) — logged into the Relativity AI account
2. Click **Create New App → From scratch**
3. Name it "Relativity AI", select your workspace
4. Go to **Basic Information → Display Information** — set name, description, and logo
5. Go to **OAuth & Permissions → Scopes → Bot Token Scopes**, add:
   - `chat:write`
   - `chat:write.public`
6. Click **Install to Workspace**, approve it
7. Copy the **Bot User OAuth Token** (starts with `xoxb-`)

### Per-client: Install the bot into a client's Slack workspace
**Option A — Manual (recommended for small number of clients):**
- Client adds your bot to their Slack workspace
- You install the app there, grab that workspace's bot token
- Add a new Slack credential in n8n with that token

**Option B — Automated OAuth flow (for scale):**
- Enable **Manage Distribution** in your Slack app settings
- Send the client the generated **"Add to Slack"** link
- Client clicks it, approves, and your app gets a bot token for their workspace
- Store that token as a credential in n8n for their workflow

---

## Key Principle
- **App key/secret** = yours (Relativity AI) — never changes
- **Access token** = one per client, scoped to their account/workspace
- Each client gets their own n8n credential using your app key but their authorization
