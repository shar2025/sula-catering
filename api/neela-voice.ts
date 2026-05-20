/**
 * /api/neela-voice, TTS proxy to ElevenLabs for Neela's spoken replies.
 *
 * Required env (only when speaker toggle is on):
 *   ELEVENLABS_API_KEY   , get from elevenlabs.io
 *   ELEVENLABS_VOICE_ID  , voice ID for Neela. Default: Monika Sogam, Indian
 *                           English female ('qNkzaJoHLLdpvgh5tISm'). Picked to
 *                           match Neela's name (Sanskrit "blue, sapphire") and
 *                           Sula's heritage and modern Indian brand. Browse the
 *                           ElevenLabs voice library to swap and override via
 *                           env var without redeploying.
 *
 * Returns audio/mpeg bytes. Frontend wraps in Blob URL and plays.
 * If keys are missing, returns 503 and the frontend silently skips audio playback.
 *
 * Vercel Node runtime, Express-style (req, res) handler.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';

export const config = { maxDuration: 60 };

const DEFAULT_VOICE_ID = 'qNkzaJoHLLdpvgh5tISm'; // Monika Sogam, Indian English female, warm conversational tone
const MAX_TEXT_LENGTH = 1200;

// Normalize text for cleaner speech. ElevenLabs stumbles on whole-hour times
// ("4:00 PM"), street abbreviations ("Ave" gets read as "Ave Maria"), and item
// numbers ("#1", "No 1"). Expand them so the voice reads naturally. This only
// affects the spoken audio; the chat bubble text is unchanged.
function normalizeForSpeech(s: string): string {
	return s
		.replace(/\b(\d{1,2}):00(\s*)([AaPp])\.?\s*([Mm])\.?/g, '$1 $3$4')
		.replace(/#\s*(\d+)/g, 'number $1')
		.replace(/\bNo\.?\s*(\d+)/gi, 'number $1')
		.replace(/\bNon-Veg\b/gi, 'Non Vegetarian')
		.replace(/\bVeg\b/gi, 'Vegetarian')
		.replace(/\bAve\b\.?/gi, 'Avenue')
		.replace(/\bBlvd\b\.?/gi, 'Boulevard')
		.replace(/\bRd\b\.?/gi, 'Road')
		.replace(/\bSt\b\.?/g, 'Street')
		.replace(/\bDr\b\.?/g, 'Drive')
		.replace(/\bLn\b\.?/gi, 'Lane')
		.replace(/\bCres\b\.?/gi, 'Crescent')
		.replace(/\bPl\b\.?/g, 'Place')
		.replace(/\bCt\b\.?/g, 'Court')
		.replace(/\bHwy\b\.?/gi, 'Highway');
}

// Cap per ElevenLabs generation. Long single generations rush and slur toward
// the end, so we split into short chunks, synthesize each separately, and
// stitch the audio. Each chunk then stays naturally paced.
const CHUNK_TARGET = 260;

// Split text into chunks no larger than maxLen, breaking on sentence ends so
// a chunk never cuts a sentence in half.
function chunkText(s: string, maxLen: number): string[] {
	if (s.length <= maxLen) return [s];
	const sentences = s.match(/[^.!?]+[.!?]+(?:\s|$)|\S[^.!?]*$/g) || [s];
	const chunks: string[] = [];
	let cur = '';
	for (const sent of sentences) {
		if (cur && (cur.length + sent.length) > maxLen) {
			chunks.push(cur.trim());
			cur = sent;
		} else {
			cur += sent;
		}
	}
	if (cur.trim()) chunks.push(cur.trim());
	return chunks;
}

// Synthesize one chunk via ElevenLabs. previousText / nextText give the model
// prosody context so the stitched chunks flow as one continuous reply.
async function synthesizeChunk(opts: {
	apiKey: string;
	voiceId: string;
	text: string;
	previousText?: string;
	nextText?: string;
}): Promise<Buffer> {
	const resp = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${opts.voiceId}`, {
		method: 'POST',
		headers: {
			'xi-api-key': opts.apiKey,
			'Content-Type': 'application/json',
			Accept: 'audio/mpeg'
		},
		body: JSON.stringify({
			text: opts.text,
			model_id: 'eleven_multilingual_v2',
			previous_text: opts.previousText || undefined,
			next_text: opts.nextText || undefined,
			voice_settings: {
				stability: 0.75,
				similarity_boost: 0.75,
				style: 0,
				use_speaker_boost: true
			}
		})
	});
	if (!resp.ok) {
		const errBody = await resp.text().catch(() => '');
		throw new Error(`elevenlabs ${resp.status} ${errBody.slice(0, 200)}`);
	}
	return Buffer.from(await resp.arrayBuffer());
}

interface VoiceRequest {
	text?: string;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
	console.log('[neela-voice] hit', req.method);

	if (req.method !== 'POST') {
		return res.status(405).json({ error: 'method not allowed' });
	}

	const body = (req.body || {}) as VoiceRequest;
	const text = normalizeForSpeech((body.text || '').toString().trim()).slice(0, MAX_TEXT_LENGTH);
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
		const chunks = chunkText(text, CHUNK_TARGET);
		const buffers = await Promise.all(
			chunks.map((chunk, i) =>
				synthesizeChunk({
					apiKey,
					voiceId,
					text: chunk,
					previousText: chunks[i - 1],
					nextText: chunks[i + 1]
				})
			)
		);
		const buffer = Buffer.concat(buffers);
		console.log('[neela-voice] ok', { chunks: chunks.length, bytes: buffer.length });
		res.setHeader('Content-Type', 'audio/mpeg');
		res.setHeader('Cache-Control', 'no-store');
		return res.status(200).send(buffer);
	} catch (err) {
		console.error('[neela-voice] error', err);
		return res.status(502).json({ error: 'tts error' });
	}
}
