/**
 * /api/neela-voice, TTS proxy to ElevenLabs for Neela's spoken replies.
 *
 * Required env (only when speaker toggle is on):
 *   ELEVENLABS_API_KEY   , get from elevenlabs.io
 *   ELEVENLABS_VOICE_ID  , voice ID for Neela. Default: Rachel ('21m00Tcm4TlvDq8ikWAM').
 *                           Browse the ElevenLabs voice library to pick a warmer or more
 *                           refined fit and override via env var.
 *
 * Returns audio/mpeg bytes. Frontend wraps in Blob URL and plays.
 * If keys are missing, returns 503 and the frontend silently skips audio playback.
 *
 * Vercel Node runtime, Express-style (req, res) handler.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';

export const config = { maxDuration: 60 };

const DEFAULT_VOICE_ID = '21m00Tcm4TlvDq8ikWAM'; // Rachel, warm, refined female voice
const MAX_TEXT_LENGTH = 1200;

interface VoiceRequest {
	text?: string;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
	console.log('[neela-voice] hit', req.method);

	if (req.method !== 'POST') {
		return res.status(405).json({ error: 'method not allowed' });
	}

	const body = (req.body || {}) as VoiceRequest;
	const text = (body.text || '').toString().trim().slice(0, MAX_TEXT_LENGTH);
	if (!text) {
		return res.status(400).json({ error: 'no text' });
	}

	const apiKey = process.env.ELEVENLABS_API_KEY;
	const voiceId = process.env.ELEVENLABS_VOICE_ID || DEFAULT_VOICE_ID;
	if (!apiKey) {
		console.warn('[neela-voice] ELEVENLABS_API_KEY not set');
		return res.status(503).json({ error: 'tts unavailable' });
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
			const errBody = await elevenResp.text().catch(() => '');
			console.error('[neela-voice] elevenlabs error', elevenResp.status, errBody.slice(0, 200));
			return res.status(502).json({ error: 'tts upstream error' });
		}

		const buffer = Buffer.from(await elevenResp.arrayBuffer());
		console.log('[neela-voice] ok', { bytes: buffer.length });
		res.setHeader('Content-Type', 'audio/mpeg');
		res.setHeader('Cache-Control', 'no-store');
		return res.status(200).send(buffer);
	} catch (err) {
		console.error('[neela-voice] error', err);
		return res.status(502).json({ error: 'tts error' });
	}
}
