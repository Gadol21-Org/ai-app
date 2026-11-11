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
# CHAT_MODEL=google:gemini-3.8-flash
```

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
