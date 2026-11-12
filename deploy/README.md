# Deploying to the Oracle Cloud VM

Every push to `main` runs [`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml): it builds the
[`Dockerfile`](../Dockerfile), pushes `ghcr.io/gadol21-org/ai-app` tagged with the commit, then SSHes to the VM and
runs [`deploy.sh`](deploy.sh), which replaces the `ai-app` container (published on `127.0.0.1:8085` of the VM
only; it fails the run with logs if the container doesn't stay up). Pull requests only build. The deploy step is
skipped until the `ORACLE_HOST` variable is set. Run it by hand from **Actions > Deploy > Run workflow**.

This is the same VM, deploy key and `cloudflared` tunnel as budget-tracking, so those are already set up.

### Ports on this VM

| Port | Service |
|---|---|
| 8082 | `budget-tracking` |
| 8083 | `budget-staging` |
| 8085 | `ai-app` (`host_port` in `deploy.sh`) |

## One-time setup

1. **Tunnel hostname.** In the Cloudflare tunnel add a public hostname (e.g. `ai.example.com`) to `http://localhost:8085`.
2. **Protect it.** Cloudflare Zero Trust > Access > add a self-hosted application for that hostname, allowing only
   your family's emails. The app has no login of its own and spends your Gemini quota.
3. **GitHub settings** (Settings > Secrets and variables > Actions), same names as budget-tracking:

| Kind | Name | Value |
|---|---|---|
| Secret | `ORACLE_SSH_KEY` | The private deploy key. |
| Secret | `ORACLE_KNOWN_HOSTS` | Optional: `ssh-keyscan` output. |
| Secret | `AI_APP_ENV` | The app's `.env` (below). |
| Variable | `ORACLE_HOST` | The VM's public IP. |
| Variable | `ORACLE_USER` | Optional, default `ubuntu`. |
| Variable | `BUILD_RUNNER` | Optional, default `ubuntu-24.04-arm`. |

`AI_APP_ENV` holds one `NAME=value` per line, no quotes:

```
GOOGLE_GENERATIVE_AI_API_KEY=...
MYSQL_URL=mysql://ai_app:<password>@<db-private-ip>:3306/ai_app
# CHAT_MODEL=google:gemini-3.5-flash-lite
WANDERLOG_COOKIE=s%3A...
```

### Users and notifications

**Who is who.** Cloudflare Access (step 2 above) adds the signed-in person's email to every request as
`Cf-Access-Authenticated-User-Email`, the same way budget-tracking identifies people. The app creates a user the first
time it sees an email; names can be set in Settings. In production a request without that header has no user and
`/api/chat` answers 401 (`/api/health` stays open for the container healthcheck). Because the container only listens on
the VM's `127.0.0.1`, the header can only come from the tunnel. To also verify Cloudflare's signed token, add
`CF_ACCESS_TEAM_DOMAIN` (e.g. `myteam.cloudflareaccess.com`) and `CF_ACCESS_AUD` (the Access app's Application Audience
tag) to `AI_APP_ENV`; then the `Cf-Access-Jwt-Assertion` JWT must be valid and match the header email.

**Push notifications.** Generate a VAPID key pair once (`npx web-push generate-vapid-keys`) and add it to `AI_APP_ENV`:

```
VAPID_PUBLIC_KEY=...
VAPID_PRIVATE_KEY=...
VAPID_SUBJECT=mailto:you@example.com
```

Keep the pair stable: replacing it invalidates every device's subscription (people re-enable in the app). Each person
turns notifications on per device in **Settings > Notifications** (on iPhone, first add the app to the home screen).
Payloads are encrypted for each device with its own subscription keys (Web Push, RFC 8291 `aes128gcm`), so the browser
vendor's push service only relays ciphertext. A copy of each notification is also kept in the app's inbox (database) so
it can be read even if push never arrives. Tapping a notification opens the conversation that sent it, scrolled to the
tool call.

### Database

The app shares budget-tracking's MySQL HeatWave instance (the free tier allows only one), with its own
database and a user that can reach nothing else. From the VM, open a shell as the admin user
(`docker run --rm -it mysql:8 mysql -h <db-private-ip> -u <admin> -p`) and run:

```sql
CREATE DATABASE ai_app CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
CREATE USER 'ai_app'@'%' IDENTIFIED BY '<password>';
GRANT ALL PRIVILEGES ON ai_app.* TO 'ai_app'@'%';
```

Use letters and digits in the password, or percent-encode it in `MYSQL_URL`. The app creates and
migrates its tables on startup; a failed migration stops the container and fails the deploy.

To change a setting, update the secret and re-run the workflow (the file is written on each deploy).

## Agent tools (MCP)

The chat agent can call [MCP](https://modelcontextprotocol.io) servers as tools. All of this is optional: with none of
the variables below set the app starts normally and just has no extra tools. A server that fails to start is logged
(`[mcp] <name> unavailable`) and skipped. Add or change these lines in `AI_APP_ENV` and re-run the workflow.

| Variable | Meaning |
|---|---|
| `WANDERLOG_COOKIE` | Enables the Wanderlog tools (trips, places, notes, hotels, checklists, expenses). The value of the `connect.sid` cookie of a logged-in session on wanderlog.com. |
| `MCP_SERVERS` | Optional JSON for more servers, one line: `{"name":{"url":"https://host/mcp","headers":{"Authorization":"Bearer ..."}}}` for a remote server, or `{"name":{"command":"node","args":["server.js"],"env":{"KEY":"value"}}}` for a local process. |
| `MCP_SERVERS` approval | Every MCP tool asks for approval by default. Each server in `MCP_SERVERS` may add `"allowTools"`, a list of tool names that run without asking (`*` matches any characters, e.g. `["notes_get_*","notes_list_*","notes_search"]`), and/or `"requireApproval"`: `"all"` (default), `"none"`, or a list of regexes of the tools that ask. A name in `allowTools` always wins. See [MCP approvals](#mcp-approvals). |
| `MCP_MAX_RESULT_CHARS` | Tool results longer than this (default `8000`) are truncated before they reach the chat, the database and the model. |

### MCP approvals

By default a person must allow every call of an MCP tool (an approval card shows in the chat). To skip the card for
safe tools, list them per server in `allowTools`, so only the risky ones keep asking:

```json
{"notes":{"url":"https://notes.example.com/mcp","allowTools":["notes_get_*","notes_list_*","notes_search"]}}
```

- Each entry is a whole tool name, with `*` as a wildcard (case-insensitive). `"*"` alone would allow everything,
  so prefer prefixes such as `get_*`, `list_*`, `search_*`. A tool that matches nothing keeps asking.
- `allowTools` is applied on top of `requireApproval`: a tool in the list never asks, the rest follow `requireApproval`.
- The built-in Wanderlog server already allows `wanderlog_get_*`, `wanderlog_list_*` and `wanderlog_search_*`
  (read-only). Adding, editing, removing and moving still ask. To change that, define your own `wanderlog` entry in `MCP_SERVERS`.
- The approval card of an asking tool also has **אל תשאל בשיחה זו** (allow in this conversation): that tool then runs
  without asking for the rest of that conversation. It is saved with the conversation (so it survives a reload),
  applies only to that tool, and does not affect other conversations.
- Scheduled runs never get MCP tools, whatever the allow list says.

### Wanderlog

Wanderlog has no public API. The app uses the community [`wanderlog-mcp`](https://github.com/shaikhspeare/wanderlog-mcp)
server (MIT, the most used and maintained of the ones on GitHub; **unofficial**, not made by Wanderlog). It is pinned
in `mcp-servers/package-lock.json`, installed in the Docker image without install scripts, and only talks to
`wanderlog.com`. Things to know:

- Reading (get, list and search tools) runs without asking. Tools that add, remove, edit, update, rename or move
  things show the usual approval card first. Scheduled runs don't get MCP tools.
- It signs in with your **session cookie**, which gives the same access as your login (including editing and deleting
  trips). Keep it only in the `AI_APP_ENV` secret. Only that one variable is passed to the server process.
- To get it: log in at wanderlog.com, open DevTools > Application > Cookies > `https://wanderlog.com`, copy the
  `connect.sid` value (starts with `s%3A`).
- It lasts about a year, and stops working if you log out of Wanderlog, change the password or Wanderlog revokes it.
  Then replace the value in `AI_APP_ENV` and re-run the workflow.
- Wanderlog can change its private API at any time and break the tools until the package is updated (Dependabot
  watches it).
