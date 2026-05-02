/**
 * /api/neela-voice — TTS proxy to ElevenLabs for Neela's spoken replies.
 *
 * Required env (only when speaker toggle is on):
 *   ELEVENLABS_API_KEY    — get from elevenlabs.io
 *   ELEVENLABS_VOICE_ID   — voice ID for Neela. Default: Rachel ('21m00Tcm4TlvDq8ikWAM').
 *                           Browse the ElevenLabs voice library to pick a warmer or more
 *                           refined fit and override via env var.
 *
 * Returns audio/mpeg bytes. Frontend wraps in Blob URL and plays.
 * If keys are missing, returns 503 and the frontend silently skips audio playback.
 */

const DEFAULT_VOICE_ID = '21m00Tcm4TlvDq8ikWAM'; // Rachel — warm, refined female voice
const MAX_TEXT_LENGTH = 1200;

interface VoiceRequest {
	text: string;
}

export default async function handler(req: Request): Promise<Response> {
	if (req.method !== 'POST') {
		return new Response(JSON.stringify({ error: 'method not allowed' }), {
			status: 405,
			headers: { 'Content-Type': 'application/json' }
		});
	}

	let body: VoiceRequest;
	try {
		body = (await req.json()) as VoiceRequest;
	} catch {
		return new Response(JSON.stringify({ error: 'invalid json' }), {
			status: 400,
			headers: { 'Content-Type': 'application/json' }
		});
	}

	const text = (body.text || '').trim().slice(0, MAX_TEXT_LENGTH);
	if (!text) {
		return new Response(JSON.stringify({ error: 'no text' }), {
			status: 400,
			headers: { 'Content-Type': 'application/json' }
		});
	}

	const apiKey = process.env.ELEVENLABS_API_KEY;
	const voiceId = process.env.ELEVENLABS_VOICE_ID || DEFAULT_VOICE_ID;
	if (!apiKey) {
		return new Response(JSON.stringify({ error: 'tts unavailable' }), {
			status: 503,
			headers: { 'Content-Type': 'application/json' }
		});
	}

	try {
		const elevenResp = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
			method: 'POST',
			headers: {
				'xi-api-key': apiKey,
				'Content-Type': 'application/json',
				Accept: 'audio/mpeg'
			},
			body: JSON.stringify({
				text,
				model_id: 'eleven_turbo_v2_5',
				voice_settings: {
					stability: 0.5,
					similarity_boost: 0.75,
					style: 0.2,
					use_speaker_boost: true
				}
			})
		});

		if (!elevenResp.ok) {
			console.error('[neela-voice] elevenlabs error', elevenResp.status, await elevenResp.text().catch(() => ''));
			return new Response(JSON.stringify({ error: 'tts upstream error' }), {
				status: 502,
				headers: { 'Content-Type': 'application/json' }
			});
		}

		const audio = await elevenResp.arrayBuffer();
		return new Response(audio, {
			status: 200,
			headers: {
				'Content-Type': 'audio/mpeg',
				'Cache-Control': 'no-store'
			}
		});
	} catch (err) {
		console.error('[neela-voice] error', err);
		return new Response(JSON.stringify({ error: 'tts error' }), {
			status: 502,
			headers: { 'Content-Type': 'application/json' }
		});
	}
}
