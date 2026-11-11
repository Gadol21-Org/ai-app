# Family AI

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

`CHAT_MODEL` (default `google:gemini-3.8-flash`) is `<provider>:<model>`, resolved in
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

## Deployment

Same approach as budget-tracking: every push to `main` builds a Docker image, pushes it to the
private GHCR registry and redeploys it on the Oracle VM over SSH. Secrets live in the GitHub
`AI_APP_ENV` secret. See [`deploy/README.md`](deploy/README.md). The app has no login of its own,
so put Cloudflare Access in front of its hostname.
