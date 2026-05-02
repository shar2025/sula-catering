/**
 * Gmail OAuth + access-token helpers for the Neela inbound/outbound email loop.
 *
 * One-time bootstrap (Phase 2):
 *   1. GET /api/neela/gmail-oauth-start while signed in as events.sula@gmail.com
 *      -> 302s to Google's consent screen with a signed CSRF state.
 *   2. GET /api/neela/gmail-oauth-callback?code=...&state=...
 *      -> exchanges code for refresh_token + access_token, prints the refresh
 *      token in an HTML page for Shar to paste into Vercel env as
 *      GMAIL_REFRESH_TOKEN, then redeploys.
 *
 * Steady state:
 *   - getAccessToken() reads GMAIL_REFRESH_TOKEN, swaps it for a short-lived
 *     access token, and caches the access token in module memory until 60s
 *     before its expiry. Subsequent calls inside the same warm Lambda hit the
 *     cache instead of re-roundtripping to Google.
 *
 * Env (all read at call time, never at import):
 *   GOOGLE_OAUTH_CLIENT_ID         OAuth Web Client ID
 *   GOOGLE_OAUTH_CLIENT_SECRET     OAuth Web Client secret
 *   GMAIL_OAUTH_REDIRECT_URI       optional, defaults to the Phase 1 callback
 *   GMAIL_REFRESH_TOKEN            populated after the one-time grant
 *   GMAIL_OAUTH_STATE_SECRET       optional HMAC secret for CSRF state. If
 *                                  unset, derives a stable secret from
 *                                  GOOGLE_OAUTH_CLIENT_SECRET.
 */

import { createHmac, timingSafeEqual, randomBytes } from 'node:crypto';

export const GMAIL_SCOPE = 'https://www.googleapis.com/auth/gmail.modify';
const DEFAULT_REDIRECT_URI = 'https://sulacatering.com/api/neela/gmail-oauth-callback';
const STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const ACCESS_TOKEN_SAFETY_MARGIN_MS = 60 * 1000;

interface CachedAccessToken {
	token: string;
	expiresAt: number;
}
let cachedAccessToken: CachedAccessToken | null = null;

export function getOAuthClientId(): string {
	const v = process.env.GOOGLE_OAUTH_CLIENT_ID || process.env.NEELA_OAUTH_CLIENT_ID;
	if (!v) throw new Error('missing env: GOOGLE_OAUTH_CLIENT_ID');
	return v;
}

export function getOAuthClientSecret(): string {
	const v = process.env.GOOGLE_OAUTH_CLIENT_SECRET || process.env.NEELA_OAUTH_CLIENT_SECRET;
	if (!v) throw new Error('missing env: GOOGLE_OAUTH_CLIENT_SECRET');
	return v;
}

export function getOAuthRedirectUri(): string {
	return process.env.GMAIL_OAUTH_REDIRECT_URI || process.env.NEELA_OAUTH_REDIRECT_URI || DEFAULT_REDIRECT_URI;
}

export function getRefreshToken(): string | null {
	return process.env.GMAIL_REFRESH_TOKEN || process.env.NEELA_GMAIL_REFRESH_TOKEN || null;
}

export function getGmailUserEmail(): string {
	return process.env.GMAIL_USER_EMAIL || process.env.NEELA_GMAIL_INBOX || 'events.sula@gmail.com';
}

export function getPubSubTopic(): string {
	return (
		process.env.GMAIL_PUBSUB_TOPIC ||
		process.env.NEELA_PUBSUB_TOPIC ||
		'projects/sula-neela-events/topics/gmail-events-sula-inbox'
	);
}

function getStateSecret(): string {
	if (process.env.GMAIL_OAUTH_STATE_SECRET) return process.env.GMAIL_OAUTH_STATE_SECRET;
	const seed = process.env.GOOGLE_OAUTH_CLIENT_SECRET || process.env.NEELA_OAUTH_CLIENT_SECRET || 'unsafe-dev-fallback';
	return 'neela-gmail-state::' + seed;
}

/* ---------- CSRF state for the OAuth dance ---------- */

export function signOAuthState(payload: Record<string, unknown> = {}): string {
	const body = { ...payload, nonce: randomBytes(16).toString('hex'), iat: Date.now() };
	const json = JSON.stringify(body);
	const data = Buffer.from(json, 'utf8').toString('base64url');
	const mac = createHmac('sha256', getStateSecret()).update(data).digest('base64url');
	return `${data}.${mac}`;
}

export function verifyOAuthState(state: string): { ok: boolean; payload?: Record<string, unknown>; reason?: string } {
	if (!state || typeof state !== 'string' || !state.includes('.')) {
		return { ok: false, reason: 'malformed' };
	}
	const [data, mac] = state.split('.', 2);
	if (!data || !mac) return { ok: false, reason: 'malformed' };
	const expected = createHmac('sha256', getStateSecret()).update(data).digest('base64url');
	let macOk = false;
	try {
		const a = Buffer.from(mac);
		const b = Buffer.from(expected);
		macOk = a.length === b.length && timingSafeEqual(a, b);
	} catch {
		macOk = false;
	}
	if (!macOk) return { ok: false, reason: 'bad-signature' };
	let payload: Record<string, unknown>;
	try {
		payload = JSON.parse(Buffer.from(data, 'base64url').toString('utf8'));
	} catch {
		return { ok: false, reason: 'bad-payload' };
	}
	const iat = typeof payload.iat === 'number' ? payload.iat : 0;
	if (!iat || Date.now() - iat > STATE_TTL_MS) return { ok: false, reason: 'expired' };
	return { ok: true, payload };
}

/* ---------- OAuth URL builders + token exchange ---------- */

export function buildAuthUrl(state: string): string {
	const params = new URLSearchParams({
		client_id: getOAuthClientId(),
		redirect_uri: getOAuthRedirectUri(),
		response_type: 'code',
		scope: GMAIL_SCOPE,
		access_type: 'offline',
		prompt: 'consent',
		include_granted_scopes: 'true',
		state
	});
	return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export interface TokenExchangeResult {
	access_token: string;
	refresh_token?: string;
	expires_in: number;
	scope: string;
	token_type: string;
	id_token?: string;
}

export async function exchangeCodeForTokens(code: string): Promise<TokenExchangeResult> {
	const body = new URLSearchParams({
		code,
		client_id: getOAuthClientId(),
		client_secret: getOAuthClientSecret(),
		redirect_uri: getOAuthRedirectUri(),
		grant_type: 'authorization_code'
	});
	const res = await fetch('https://oauth2.googleapis.com/token', {
		method: 'POST',
		headers: { 'content-type': 'application/x-www-form-urlencoded' },
		body
	});
	if (!res.ok) {
		const text = await res.text().catch(() => '');
		throw new Error(`oauth code exchange failed (${res.status}): ${text.slice(0, 500)}`);
	}
	return (await res.json()) as TokenExchangeResult;
}

async function refreshAccessToken(refreshToken: string): Promise<TokenExchangeResult> {
	const body = new URLSearchParams({
		refresh_token: refreshToken,
		client_id: getOAuthClientId(),
		client_secret: getOAuthClientSecret(),
		grant_type: 'refresh_token'
	});
	const res = await fetch('https://oauth2.googleapis.com/token', {
		method: 'POST',
		headers: { 'content-type': 'application/x-www-form-urlencoded' },
		body
	});
	if (!res.ok) {
		const text = await res.text().catch(() => '');
		throw new Error(`oauth refresh failed (${res.status}): ${text.slice(0, 500)}`);
	}
	return (await res.json()) as TokenExchangeResult;
}

export async function getAccessToken(): Promise<string> {
	const now = Date.now();
	if (cachedAccessToken && cachedAccessToken.expiresAt - ACCESS_TOKEN_SAFETY_MARGIN_MS > now) {
		return cachedAccessToken.token;
	}
	const refresh = getRefreshToken();
	if (!refresh) throw new Error('missing env: GMAIL_REFRESH_TOKEN (run the one-time OAuth grant first)');
	const result = await refreshAccessToken(refresh);
	cachedAccessToken = {
		token: result.access_token,
		expiresAt: now + result.expires_in * 1000
	};
	return cachedAccessToken.token;
}
