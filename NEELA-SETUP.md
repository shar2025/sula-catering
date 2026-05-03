# Neela setup

Neela is the AI event-planning assistant on sulacatering.com, the floating gold "Ask Neela" button is wired into every page via `src/components/Neela.astro`. Three Vercel serverless functions back her:

- `api/neela.ts`, chat completion (Anthropic Claude Sonnet)
- `api/neela-voice.ts`, text-to-speech proxy (ElevenLabs)
- `api/neela-lead.ts`, captures name + email when a visitor opts in
- `api/neela/submit-order.ts`, captures a customer-confirmed full order, persists to `neela_orders`, emails the events team
- `api/cron/neela-digest.ts`, daily summary email (cron at 16:00 UTC)
- `api/admin/neela-stats.ts`, read-only admin stats endpoint

Until the env vars below are set in Vercel, the chat shows a polite fallback message pointing visitors to email, phone, and Calendly. Voice replies stay hidden until the ElevenLabs key lands.

## Required environment variables

Set these in **Vercel → Project → Settings → Environment Variables**, then redeploy.

| Name | Required for | How to get it |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | Chat replies | Generate at [console.anthropic.com](https://console.anthropic.com/) → API Keys. Paste the `sk-ant-…` value. The variable can also be named `Neela` (the code accepts either). |
| `ELEVENLABS_API_KEY` | Premium voice replies (optional) | Sign up at [elevenlabs.io](https://elevenlabs.io/), then Profile → API Key. Paste the value. **Without this set, Neela still talks back via the browser's built-in Web Speech Synthesis** (free, slightly robotic). The frontend tries ElevenLabs first and falls back automatically. |
| `ELEVENLABS_VOICE_ID` | Voice replies (optional) | Default is **Rachel** (`21m00Tcm4TlvDq8ikWAM`), a warm refined female voice from the ElevenLabs library. To pick a different voice, browse [elevenlabs.io/app/voice-library](https://elevenlabs.io/app/voice-library), open a voice, and copy its ID into this var. |
| `POSTGRES_URL` | Chat persistence (optional) | Vercel → Storage → Create → Postgres (Neon-backed). When you create the DB, Vercel auto-injects `POSTGRES_URL` (and a few siblings) into every project linked to it. The `neela_chats` table auto-creates on first insert. If unset, Neela still replies, persistence just silently no-ops. |
| `RESEND_API_KEY` | All transactional email (digests, orders, customer copies) | Sign up at [resend.com](https://resend.com), then Profile → API Keys. Free tier covers 3,000 emails/mo. Without DNS verification, the only working sender is `onboarding@resend.dev` (Resend's default), which is what the code falls back to. To send from `neela@sulacatering.com`, verify the `sulacatering.com` domain in Resend (DNS TXT record) and set `NEELA_FROM_EMAIL` below. |
| `NEELA_TEST_EMAIL` | Routes ALL notifications to a test inbox (optional) | When set (e.g. `mail.sharathvittal@gmail.com`), every order email, customer copy, kitchen email, and daily digest goes to this address INSTEAD of the production events team. Subject lines get a `[TEST MODE]` prefix. Use this during testing to verify formatting without spamming real customers. Unset for production. |
| `NEELA_FROM_EMAIL` | Sender address override (optional) | Format: `Neela <neela@sulacatering.com>` or any verified-domain address. Falls back to `Neela <onboarding@resend.dev>` (Resend's default unverified sender) if unset. Once you've verified the `sulacatering.com` domain in Resend's dashboard, set this to the branded address. |
| `NEELA_ADMIN_KEY` | Admin stats endpoint (optional) | Any random string you pick (e.g. a UUID). Pass it as `x-admin-key: <value>` header when hitting `/api/admin/neela-stats`. If unset, the endpoint refuses all requests with 503 (so it's never accidentally world-readable). Rotate by changing the env var. |
| `KITCHEN_EMAIL` | Separate kitchen-sheet email recipient (optional) | If set, every order with `mode=full` or `mode=quick` triggers an extra email to this address with only the kitchen sheet PDF attached. If unset, the kitchen sheet still rides along in the events team's full PDF. Useful when the kitchen needs prep notes routed independently. |

After saving env vars, trigger a redeploy (Vercel does this automatically on the next push, or hit "Redeploy" on the latest deployment).

## Smoke test after deploy

1. Open sulacatering.com. The gold "Ask Neela" button should be in the bottom-right corner with a soft pulsing halo.
2. Click it. Modal opens. Send "How much for 100 guests?" or use a suggested chip.
3. Neela should reply within a couple of seconds in her warm Vancouver voice.
4. Click the speaker icon in the chat header (off by default). Send another message. The reply should be read aloud.
5. After 3 messages, the lead-capture form should appear inline. Fill it in. Check Vercel function logs for the `[neela-lead]` line.

## Behaviour & guardrails baked in

- Rate limit: **10 user messages per IP per 24h.** Excess returns a polite "we've chatted plenty today" with email + Calendly fallback. (In-memory; resets when the serverless container cycles. Upgrade to Vercel KV if abuse becomes an issue.)
- Conversation cap: **15 user messages per session.** Beyond that, Neela politely hands off to a Calendly call.
- Hard error path: if the Anthropic API fails for any reason, Neela responds with the same email/phone/Calendly fallback rather than going silent.
- Mic input uses the browser-native Web Speech API. Hides automatically on browsers that don't support it.
- Voice output uses ElevenLabs. The speaker toggle hides itself if the TTS endpoint returns 503 (i.e. `ELEVENLABS_API_KEY` not set).
- System prompt is cached via Anthropic prompt caching (`cache_control: ephemeral`), so each turn's input cost is mostly the conversation history, not the full Sula brief.

## Wiring lead capture to a real destination

`api/neela-lead.ts` currently just `console.log`s the lead. To send it somewhere real, drop a transport block where the `// TODO` comment is and add the relevant env var to the table above.

Quick options:

- **Resend** (transactional email): add `RESEND_API_KEY`, post to `https://api.resend.com/emails` with `events@sulaindianrestaurant.com` as the recipient.
- **Zapier Webhook**: add `ZAPIER_LEAD_WEBHOOK_URL`, POST the JSON straight through.
- **HubSpot / CRM**: their REST API works the same, keep the API key in env, never the code.

## Customizing Neela's persona

Neela's voice, knowledge, FAQs, and behaviour live in the `SYSTEM_PROMPT` constant inside `api/neela.ts`. Update there, redeploy, done. Anthropic prompt caching means the first request after a deploy is slightly slower while the cache rebuilds, then it's back to fast.

## Phase 2: Inbound Gmail integration (events.sula@gmail.com)

Neela now answers email sent to **events.sula@gmail.com** automatically. Inbound mail flows through Gmail watch -> Pub/Sub -> the Vercel push endpoint, gets classified by Claude Haiku, and Neela either replies in-thread, flags for the events team, or archives.

### Endpoints

All four flows live in a single Vercel function at `api/neela/gmail.ts` and dispatch by `?action=` (consolidated to stay under the Hobby plan's 12-function cap).

| Path | Trigger | Purpose |
| --- | --- | --- |
| `/api/neela/gmail?action=oauth-start` | manual GET (one-time) | Redirects to Google's consent page so events.sula can grant gmail.modify. |
| `/api/neela/gmail?action=oauth-callback` | Google redirect | Exchanges the auth code, displays the refresh token to paste into Vercel. |
| `/api/neela/gmail?action=push` | Pub/Sub push | Receives Gmail watch notifications, calls history.list, dispatches to the action handler. |
| `/api/neela/gmail?action=watch-renew` | daily cron at 10:00 UTC + manual GET | Calls users.watch to keep the Pub/Sub push alive (Gmail watches expire every 7 days). Run once manually right after the OAuth grant to bootstrap. |

### Required environment variables

Add these in **Vercel -> Project -> Settings -> Environment Variables**, then redeploy.

| Name | Required | Value |
| --- | --- | --- |
| `GOOGLE_OAUTH_CLIENT_ID` | yes | `517540380375-ga1btmjotnb9g1ub82gs2l3jvepbl3va.apps.googleusercontent.com` (the Sula Neela web client). |
| `GOOGLE_OAUTH_CLIENT_SECRET` | yes | OAuth client secret from the GCP console (Sula Neela web client). Treat as a secret, never commit. |
| `GMAIL_PUBSUB_TOPIC` | yes | `projects/sula-neela-events/topics/gmail-events-sula-inbox` (full resource name). |
| `GMAIL_USER_EMAIL` | yes | `events.sula@gmail.com`. The inbox we watch + send from. |
| `GMAIL_REFRESH_TOKEN` | yes (post-OAuth) | Filled in once via the OAuth callback page. Without it, the push handler ack-skips and Neela falls back to chat-only. |
| `GMAIL_OAUTH_REDIRECT_URI` | optional | Defaults to `https://sulacatering.com/api/neela/gmail?action=oauth-callback`. Override only if domain changes. Must EXACTLY match the URI whitelisted in the Sula Neela Google Cloud OAuth client's Authorized redirect URIs. |
| `GMAIL_OAUTH_STATE_SECRET` | optional | HMAC secret for the CSRF state on the OAuth flow. Defaults to a derived value of `GOOGLE_OAUTH_CLIENT_SECRET` if unset. |
| `GMAIL_PUBSUB_VERIFICATION_TOKEN` | recommended | Shared secret. When set, the push endpoint requires `?token=...` matching this value. Append it to the Pub/Sub push subscription URL: `https://sulacatering.com/api/neela/gmail?action=push&token=<value>`. |
| `NEELA_TEAM_EMAIL` | optional | Where Neela forwards `[CHANGE REQUEST]` and `[FLAG]` notices. Falls back to `NEELA_TEST_EMAIL`, then `mail.sharathvittal@gmail.com`. Complaints additionally CC `events@sulaindianrestaurant.com`. |

### One-time bootstrap (the 60-second OAuth click)

1. Set the env vars above except `GMAIL_REFRESH_TOKEN` and redeploy.
2. Open `https://sulacatering.com/api/neela/gmail?action=oauth-start` in a browser **signed in as events.sula@gmail.com** (the only test user on the consent screen).
3. Click "Allow" on Google's consent screen.
4. The callback page displays the refresh token. Copy it into Vercel as `GMAIL_REFRESH_TOKEN` (Production + Preview), redeploy.
5. Hit `https://sulacatering.com/api/neela/gmail?action=watch-renew` once manually (browser GET) to start the Pub/Sub subscription. This returns the `historyId` and `expiration` in JSON.
6. Send a test email to events.sula@gmail.com from another address. Within ~10s the push endpoint should fire, classify, and Neela should reply in-thread.

If step 4's page doesn't show a refresh_token: revoke the grant at `myaccount.google.com/permissions` and rerun step 2 (Google only emits a refresh token on the first grant per app+account pair).

### Postgres tables auto-created

`/api/neela/gmail?action=push` creates these on first call:

- `neela_gmail_threads` (thread_id PK, customer_email, last_history_id, last_message_id, status, created_at, updated_at) - dedup + status tracking.
- `neela_gmail_watch_state` (singleton row, id=1) - last seen historyId so re-deliveries don't replay.
- `neela_order_change_requests` - queued change requests pending events-team approval (auto-apply is intentionally NOT enabled in V1; see `src/lib/neela-email-action.ts`).

### Labels Neela manages on the inbox

- `NEELA_HANDLED` - Neela replied or archived; nothing to do.
- `NEELA_NEEDS_REVIEW` - complaint or anything Neela bailed on; events team must respond.
- `NEELA_CHANGE_REQUEST` - customer asked to modify an existing booking; team must approve before applying.

Labels auto-create on first use.

### Push subscription URL

After setting `GMAIL_PUBSUB_VERIFICATION_TOKEN`, update the Pub/Sub push subscription `gmail-events-sula-inbox-push` so its push endpoint becomes `https://sulacatering.com/api/neela/gmail?action=push&token=<token-value>`. Without that token, the endpoint accepts any well-formed Pub/Sub envelope (Phase 1 deferred enabling OIDC auth on the subscription).

## Phase 2 (legacy section): Email ingestion

When the events team is ready, an `.mbox` export from their Gmail inbox can be turned into a Q&A corpus that Neela can learn from. The pipeline lives in `scripts/ingest-emails.mjs`.

### Run

```bash
# Drop the export(s) into data/, then:
npm run ingest:emails -- data/sula-emails.mbox

# Multi-part exports: pass the directory, all .mbox files in it merge
npm run ingest:emails -- data/sula-emails-2026/

# Test locally without an LLM:
npm run ingest:emails -- data/synthetic-test-emails.mbox --no-llm

# Build but don't write the file:
npm run ingest:emails -- data/sula-emails.mbox --dry
```

Set `ANTHROPIC_API_KEY` (or `Neela`) in your shell before running for proper LLM-based summaries; without it the script falls back to mechanical extraction (subject + first user message + first Sula reply, truncated).

### What it does

1. Parses the mbox via `mailparser` (lazy-loaded, only when needed).
2. Threads messages by **Message-ID + In-Reply-To + References** (RFC-822-correct), with normalized-subject fallback when headers are missing.
3. PII-strips every body: emails → `[email]`, NA-format phones → `[phone]`, street addresses → `[address]`, 16-digit cards → `[card]`. Preserves dollar amounts, dates, guest counts, dietary mentions, dish names, venue names.
4. Filters: drops auto-replies (subject regex + `noreply`/`mailer-daemon` senders), thanks-only one-liners, threads under 30 words total.
5. For each kept thread, asks Claude Sonnet for a JSON `{topic, summary, key_exchange: {q, a}}` triple. Falls back to mechanical extraction on LLM failure.
6. Writes `src/lib/neela-email-corpus.ts` exporting `EMAIL_CORPUS`, `EMAIL_CORPUS_THREAD_COUNT`, `EMAIL_CORPUS_TOKEN_ESTIMATE`, `EMAIL_CORPUS_OVER_BUDGET`.

### Token budget

Inline-prompt path supports up to **25k tokens**. If the corpus is larger, the script logs `RAG mode required, corpus exceeds prompt budget; switch to vector retrieval` and sets `EMAIL_CORPUS_OVER_BUDGET = true`. The downstream wiring in `api/neela.ts` should branch at that point: under budget = inline as a 5th cache_control block (with one of persona/site/forms/policies merged to free a slot, since Anthropic caps at 4); over budget = move to a vector index (Voyage AI embed → Cloudflare Vectorize) and retrieve top-k per chat turn.

### Status

The pipeline is **not yet wired** into Neela's prompt. The corpus file is generated and committed for inspection. After the real export is processed and reviewed, add the import + cache_control block in `api/neela.ts`.
