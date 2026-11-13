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

The composer has a model selector (Gemini 3.5 Flash Lite, the default, Gemini 3.8 Flash, or Gemini 4 Hydrogen); the pick is saved per conversation. The options live in [`lib/model-catalog.ts`](lib/model-catalog.ts) and their prices in [`lib/pricing.ts`](lib/pricing.ts). `CHAT_MODEL` (default `google:gemini-3.5-flash-lite`) is the `<provider>:<model>` used for new chats, titles and scheduled runs, resolved in
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
| `lib/elevenlabs/`, `lib/media/`, `app/api/media` | Video-ad tools, generated-file storage and the media library. |

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

## Meta ads

Set `META_ADS_ACCESS_TOKEN` and `META_AD_ACCOUNT_ID` and the agent can analyze ad performance and create or change ads.
Without them none of this exists. The code is in [`lib/mcp.ts`](lib/mcp.ts) (the MCP connection) and
[`lib/meta/`](lib/meta) (video upload).

- **Meta's official Ads MCP server** (`https://mcp.facebook.com/ads`, open beta since April 2026) is connected like any
  other MCP server, with the token as a Bearer header. It reads insights (performance trends, benchmarks, anomalies),
  lists accounts, pages, campaigns, ad sets and ads, and creates / updates / activates them. Reads (`ads_get_*`,
  `ads_insights_*`, `ads_catalog_get_*`) run without asking; `ads_create_*`, `ads_update_entity` and
  `ads_activate_entity` always show an approval card. Meta creates new campaigns, ad sets and ads **paused**.
- **`upload_ad_video` and `create_video_ad`** (both ask first) cover what the MCP server can't: it only takes
  creatives as public URLs, so these upload a video from the media library to the ad account and build a video ad
  from it in an existing ad set. The ad is always created `PAUSED`; turning it on is a separate approved call.
- Typical flow: the model reads performance, writes a script informed by what worked, makes the video with the
  ElevenLabs tools, then `upload_ad_video`, `create_video_ad`, and (after you review it in Ads Manager)
  `ads_activate_entity`.
- Scheduled runs don't get MCP or Meta tools (they can't ask for approval yet).

**Setup (Meta side).** In [Meta Business Settings](https://business.facebook.com/settings) create a **system user**
(Employee role; the MCP server only accepts those), assign it the ad account (and the Page the ads run as), and
generate a token for a Meta app with `ads_management`, `ads_read` and `ads_mcp_management`. If the app only manages
your own business, Standard Access is enough; managing other businesses' accounts needs App Review for Advanced
Access. `META_AD_ACCOUNT_ID` is the number in Ads Manager (with or without `act_`). The ad account must have the Ads
MCP rolled out by Meta (a staged beta); if the server returns empty results, that is the usual reason.

## Video ads (ElevenLabs)

Set `ELEVENLABS_API_KEY` (see `.env.example` for the permissions it needs) and the agent gets tools to make
talking-head video ads, e.g. for Meta. Without the key the tools don't exist.
The code is in [`lib/elevenlabs/`](lib/elevenlabs) (API client and tools) and [`lib/media/`](lib/media) (storage and
finishing renders).

The flow, which the model follows on its own from a prompt like "make a 25-second ad for X":

**The presenter is a real person's photo.** Upload one or more clear, front-facing photos (JPEG, PNG or WebP, up to
15 MB) under **Settings → Media library → Presenter photos**; the newest is the default. The talking-video tool only
accepts these uploads, so the model can't swap in a generated face (`generate_image` is not offered at all unless
`ELEVENLABS_ALLOW_GENERATED_PRESENTER=1`). Without an uploaded photo the agent asks you to upload one.

1. The model writes the spoken script.
2. `list_voices` (or a voice id you give, or `ELEVENLABS_DEFAULT_VOICE_ID`), then `generate_speech` turns the script into audio (ElevenLabs **Eleven v4**, its best speech
   model, which supports Hebrew and audio tags like `[excited]`; v4 is served by the text-to-dialogue endpoint, older
   models by the flows speech endpoint). Scribe is ElevenLabs' speech-to-text model, so it is not used here.
3. `list_presenters` shows the uploaded photos.
4. `generate_talking_video` sends the presenter photo + speech to ElevenLabs' lip-sync model (**Creatify Aurora**,
   720p) and returns at once; the app finishes the render in the background, stores the MP4 and sends a notification.
5. `generate_scene_video` is the one-step alternative: a Google Veo 3.1 Fast clip (4-8 s) with its own speech and sound
   from a single prompt, started from the presenter photo when a person appears. Good for short b-roll; the voice
   can't be chosen and the face is less faithful than with the lip-sync model.

ElevenLabs' separate Avatars product has no API yet, so the two-step flow above is what is available as a single
pipeline. **Speech and both video tools always ask for approval** (the card shows the script); images run without
asking. Scheduled runs have nobody to ask (and a parked approval can't be resumed yet), so they only get the
unapproved tools: a scheduled "ad" prompt writes the script and notifies you. You open
its conversation (sidebar **Scheduled**), reply "continue", and approve the speech and video cards there. Example
schedule prompt: "Write a 25-second Hebrew video ad script for <business/offer>, then
send me a notification and list the media ids and the full script in your reply."

Speech, images and videos show up as players right in the chat (a video still rendering updates itself when done).

Files (audio, images, MP4) are stored in MySQL (`media` table, `LONGBLOB`), because the container has no persistent
disk. **Settings → Media library** plays, downloads and deletes them. Keep an eye on the size there, as the
database is shared with other apps. Media is not covered by `RETENTION_DAYS`; delete files you don't need.
Costs are billed by ElevenLabs credits, not tracked in the app's Spend page.

## Deployment

Same approach as budget-tracking: every push to `main` builds a Docker image, pushes it to the
private GHCR registry and redeploys it on the Oracle VM over SSH. Secrets live in the GitHub
`AI_APP_ENV` secret. See [`deploy/README.md`](deploy/README.md). The app has no login of its own,
so put Cloudflare Access in front of its hostname.
