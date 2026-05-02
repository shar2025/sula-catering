/**
 * /api/cron/neela-digest, daily digest, scheduled via vercel.json crons.
 * Runs at 16:00 UTC (= 8am PST / 9am PDT).
 *
 * Required env (silent skip if missing):
 *   POSTGRES_URL         , Vercel Postgres / Neon
 *   ANTHROPIC_API_KEY    , Claude Sonnet for summarization (Neela var also accepted)
 *   RESEND_API_KEY       , Resend for sending the email
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { runDigest } from './_digest-core.js';

export const config = { maxDuration: 60 };

export default async function handler(_req: VercelRequest, res: VercelResponse) {
	console.log('[neela-digest] cron tick', new Date().toISOString());
	const result = await runDigest({ dryRun: false });
	return res.status(200).json(result);
}
