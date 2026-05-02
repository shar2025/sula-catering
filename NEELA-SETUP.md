# Neela setup

Neela is the AI event-planning assistant on sulacatering.com — the floating gold "Ask Neela" button is wired into every page via `src/components/Neela.astro`. Three Vercel serverless functions back her:

- `api/neela.ts` — chat completion (Anthropic Claude Sonnet)
- `api/neela-voice.ts` — text-to-speech proxy (ElevenLabs)
- `api/neela-lead.ts` — captures name + email when a visitor opts in

Until the env vars below are set in Vercel, the chat shows a polite fallback message pointing visitors to email, phone, and Calendly. Voice replies stay hidden until the ElevenLabs key lands.

## Required environment variables

Set these in **Vercel → Project → Settings → Environment Variables**, then redeploy.

| Name | Required for | How to get it |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | Chat replies | Generate at [console.anthropic.com](https://console.anthropic.com/) → API Keys. Paste the `sk-ant-…` value. The variable can also be named `Neela` (the code accepts either). |
| `ELEVENLABS_API_KEY` | Voice replies | Sign up at [elevenlabs.io](https://elevenlabs.io/), then Profile → API Key. Paste the value. |
| `ELEVENLABS_VOICE_ID` | Voice replies (optional) | Default is **Rachel** (`21m00Tcm4TlvDq8ikWAM`), a warm refined female voice from the ElevenLabs library. To pick a different voice, browse [elevenlabs.io/app/voice-library](https://elevenlabs.io/app/voice-library), open a voice, and copy its ID into this var. |
| `POSTGRES_URL` | Chat persistence (optional) | Vercel → Storage → Create → Postgres (Neon-backed). When you create the DB, Vercel auto-injects `POSTGRES_URL` (and a few siblings) into every project linked to it. The `neela_chats` table auto-creates on first insert. If unset, Neela still replies — persistence just silently no-ops. |
| `RESEND_API_KEY` | Daily digest email (optional) | Sign up at [resend.com](https://resend.com), verify the `sulacatering.com` domain (DNS TXT record), then create an API key under Settings → API Keys. Without this set, the daily-digest cron still runs and summarizes but skips the actual send (logs `[neela-digest] no resend key, skipping send`). |
| `NEELA_ADMIN_KEY` | Admin stats endpoint (optional) | Any random string you pick (e.g. a UUID). Pass it as `x-admin-key: <value>` header when hitting `/api/admin/neela-stats`. If unset, the endpoint refuses all requests with 503 (so it's never accidentally world-readable). Rotate by changing the env var. |

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
- **HubSpot / CRM**: their REST API works the same — keep the API key in env, never the code.

## Customizing Neela's persona

Neela's voice, knowledge, FAQs, and behaviour live in the `SYSTEM_PROMPT` constant inside `api/neela.ts`. Update there, redeploy, done. Anthropic prompt caching means the first request after a deploy is slightly slower while the cache rebuilds, then it's back to fast.
