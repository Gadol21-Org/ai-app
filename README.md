# Kattan Bot

An installable chat app (PWA) for the family. Next.js + TypeScript, chat UI from
[assistant-ui](https://www.assistant-ui.com) (shadcn/ui components), model calls through the
[Vercel AI SDK](https://ai-sdk.dev). Plain chat completion for now; tools, approvals and
multi-model flows come later.

## Run locally

```
cp .env.example .env     # add GOOGLE_GENERATIVE_AI_API_KEY
docker compose up -d mysql   # MySQL 8 on localhost:3306, matches MYSQL_URL in .env.example
npm install
npm run dev              # http://localhost:3000
```

Or `docker compose up --build`. The service worker is registered only in production builds
(`npm run build && npm start`).

## Choosing the model

The composer has a model selector (Gemini 3.5 Flash Lite, the default, or Gemini 3.8 Flash); the pick is saved per conversation. The options live in [`lib/model-catalog.ts`](lib/model-catalog.ts) and their prices in [`lib/pricing.ts`](lib/pricing.ts). `CHAT_MODEL` (default `google:gemini-3.5-flash-lite`) is the `<provider>:<model>` used for new chats, titles and scheduled runs, resolved in
[`lib/models.ts`](lib/models.ts). To add another provider, install its `@ai-sdk/*` package and add
one line to the `providers` map; the chat route and UI don't change.

## Layout

| Path | What |
|---|---|
| `app/api/chat/route.ts` | Streams the model's reply (AI SDK `streamText`). Tools will be added here. |
| `app/assistant.tsx` | assistant-ui runtime wired to `/api/chat`, with the thread list and chat. |
| `components/assistant-ui`, `components/ui` | Components installed with the shadcn CLI (`npx shadcn add @assistant-ui/...`). |
| `app/manifest.ts`, `public/sw.js` | PWA manifest and service worker. |
| `lib/models.ts` | The swappable model/provider layer. |
| `lib/chat-storage.ts`, `app/api/threads` | Thread list and message history, client adapter and API. |
| `app/settings/page.tsx`, `lib/usage.ts` | Spend page and its queries. |

## Storage

Conversations, messages and spend live in MySQL (`MYSQL_URL`), so history survives reloads and is
shared across devices. The schema is in [`lib/db/schema.ts`](lib/db/schema.ts) (Drizzle ORM). After
changing it, run `npm run db:generate` and commit the new file in `drizzle/`; migrations are applied
when the server starts.

Conversations are kept for 30 days after their last message (`RETENTION_DAYS`, 0 = forever), then
their messages are deleted, hourly and at startup. Deleting one by hand does the same immediately.
Either way its name and spend records stay.

## Spend

Every model call is recorded with its token counts and a cost computed from the price table in
[`lib/pricing.ts`](lib/pricing.ts) at the time of the call. **Settings** (sidebar) shows the last
30 days, all time, and a per-conversation breakdown. The numbers are estimates from list prices;
when a model or price changes, update `lib/pricing.ts` (a model without an entry is recorded at $0).

## Scheduled prompts

The agent can run a saved prompt later, once or on a repeat (`lib/schedules/`). Ask it in a chat
("every weekday at 8, summarize..."); the `add_schedule` tool shows you the title, time and full
prompt and only saves after you tap Allow. It can also list schedules (`list_schedules`) and delete one (`delete_schedule`, which shows the schedule and asks first). Manage them at Settings → Scheduled prompts (disable,
delete, run now, last result). Every run is also saved as a conversation, listed under the
sidebar's **Scheduled** tab, where you can open it and reply. If you type a message instead of
tapping Allow/Deny on an approval card, that counts as Deny.

- Stored in MySQL (`schedules`, `schedule_runs`); a poller checks every 30 s, so schedules survive
  restarts and a firing missed during downtime runs once on startup. Repeats use cron expressions
  ([croner](https://github.com/Hexagon/croner)) in `SCHEDULE_TIMEZONE`.
- Tools live in `lib/tools.ts`, which also says which need approval and which scheduled runs may use.
  Scheduled runs cannot add schedules.
- Push notifications are not built. A scheduled run that reaches a tool needing approval is parked
  as a `pending_approvals` row, the run is marked "awaiting approval", and
  `getNotifier().notifyPendingApproval()` is called (`lib/approvals/notifier.ts`, a no-op today).
  Implement `Notifier` and call `setNotifier()` at startup to add push.

## Deployment

Same approach as budget-tracking: every push to `main` builds a Docker image, pushes it to the
private GHCR registry and redeploys it on the Oracle VM over SSH. Secrets live in the GitHub
`AI_APP_ENV` secret. See [`deploy/README.md`](deploy/README.md). The app has no login of its own,
so put Cloudflare Access in front of its hostname.
