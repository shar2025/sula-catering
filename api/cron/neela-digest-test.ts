/**
 * /api/cron/neela-digest-test — manual GET trigger for the daily digest.
 *
 * Useful for testing the email format before the real cron fires. Hits the
 * same code path. Open without auth for tonight; lock down later.
 *
 *   GET /api/cron/neela-digest-test          → runs the real digest (sends email if RESEND_API_KEY set)
 *   GET /api/cron/neela-digest-test?dry=1    → builds the digest but skips Resend; returns the preview HTML
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { runDigest } from './_digest-core.js';

export const config = { maxDuration: 60 };

export default async function handler(req: VercelRequest, res: VercelResponse) {
	const dry = req.query?.dry === '1' || req.query?.dry === 'true';
	console.log('[neela-digest-test] manual trigger', { dry });
	const result = await runDigest({ dryRun: dry });

	if (dry && result.preview) {
		res.setHeader('Content-Type', 'text/html; charset=utf-8');
		return res.status(200).send(result.preview);
	}
	return res.status(200).json(result);
}
