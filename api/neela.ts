// DEBUG STEP 1 (Node-style) — minimal handler in Vercel's Express-style signature.
// Vercel's native /api/*.ts functions expect (req, res) => void, NOT Web Standard
// (Request) => Response. The previous Web-style handler caused requests to hang
// because Vercel never saw a response written.

import type { VercelRequest, VercelResponse } from '@vercel/node';

export const config = { maxDuration: 60 };

export default async function handler(req: VercelRequest, res: VercelResponse) {
	console.log('[neela-min] hit', new Date().toISOString(), req.method);
	return res.status(200).json({ reply: 'hello from minimal handler' });
}
