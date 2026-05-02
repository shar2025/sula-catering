// DEBUG STEP 1 — minimal handler. Verifies the route plumbing itself.
// If this 504s, the bug is route config / runtime / build, not the Anthropic code.
// If this returns "hello from minimal handler" instantly, the route is fine and we
// move to step 2 (add SDK import).

export const config = { runtime: 'nodejs' };

export default async function handler(req: Request): Promise<Response> {
	console.log('[neela-min] hit', new Date().toISOString(), req.method);
	return new Response(JSON.stringify({ reply: 'hello from minimal handler' }), {
		status: 200,
		headers: { 'Content-Type': 'application/json' }
	});
}
