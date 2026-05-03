#!/usr/bin/env node
/**
 * Smoke test for Neela's two new tools (lookup_sula_page + web_search wiring).
 *
 * What it verifies:
 *   - lookup_sula_page rejects non-Sula domains
 *   - lookup_sula_page rejects malformed URLs
 *   - lookup_sula_page fetches a real Sula page and extracts text + JSON-LD
 *   - lookup_sula_page caches results (second call doesn't re-fetch)
 *   - scrubNegativeReviewContent passes clean text through
 *   - scrubNegativeReviewContent replaces negative text when web_search ran
 *   - scrubNegativeReviewContent leaves negative text alone when no web_search
 *
 * Run: npx tsx scripts/smoke-test-tools.mjs
 *
 * Skips the actual Anthropic API call because we don't have a key in this
 * environment. The handler-level wiring is verified via tsc --noEmit.
 */
import { lookupSulaPage, scrubNegativeReviewContent } from '../api/neela.ts';

let pass = 0;
let fail = 0;

function check(name, ok, detail) {
	if (ok) {
		pass += 1;
		console.log(`  PASS  ${name}`);
	} else {
		fail += 1;
		console.log(`  FAIL  ${name}`);
		if (detail) console.log(`        ${detail}`);
	}
}

async function main() {
	console.log('\n=== lookup_sula_page allowlist ===');
	const blockedExample = await lookupSulaPage({ url: 'https://example.com/' });
	check('blocks example.com', !!blockedExample.error && blockedExample.error.includes('not on the Sula allowlist'), JSON.stringify(blockedExample));
	const blockedYelp = await lookupSulaPage({ url: 'https://yelp.com/biz/sula' });
	check('blocks yelp.com', !!blockedYelp.error, JSON.stringify(blockedYelp));
	const malformed = await lookupSulaPage({ url: 'not-a-url' });
	check('rejects malformed URL', malformed.error === 'Invalid URL', JSON.stringify(malformed));

	console.log('\n=== lookup_sula_page real fetch (sulacatering.com) ===');
	const t0 = Date.now();
	const res1 = await lookupSulaPage({ url: 'https://sulacatering.com/', section: 'main' });
	const ms1 = Date.now() - t0;
	check('fetches main text successfully', !res1.error && typeof res1.text === 'string' && res1.text.length > 100, `error=${res1.error} len=${res1.text?.length}`);
	check('text is trimmed to ~3000 chars', !res1.text || res1.text.length <= 3010, `len=${res1.text?.length}`);
	console.log(`        first fetch took ${ms1}ms, ${res1.text?.length || 0} chars`);

	const t1 = Date.now();
	const res2 = await lookupSulaPage({ url: 'https://sulacatering.com/', section: 'main' });
	const ms2 = Date.now() - t1;
	check('cache hit on second call (<50ms vs network)', ms2 < 50, `cache call took ${ms2}ms`);
	check('cached result equals first', JSON.stringify(res1) === JSON.stringify(res2));

	console.log('\n=== lookup_sula_page schema extraction ===');
	const schemaRes = await lookupSulaPage({ url: 'https://sulaindianrestaurant.com/', section: 'schema' });
	const hasSchema = !schemaRes.error && Array.isArray(schemaRes.schema);
	check('schema section returns array', hasSchema, schemaRes.error || `type=${typeof schemaRes.schema}`);
	if (hasSchema) {
		console.log(`        found ${schemaRes.schema.length} JSON-LD blocks`);
	}

	console.log('\n=== lookup_sula_page hours extraction ===');
	const hoursRes = await lookupSulaPage({ url: 'https://sulaindianrestaurant.com/', section: 'hours' });
	check('hours section returns no error', !hoursRes.error, hoursRes.error);
	check('hours section returns hours array', Array.isArray(hoursRes.hours), `type=${typeof hoursRes.hours}`);
	if (Array.isArray(hoursRes.hours)) {
		console.log(`        found ${hoursRes.hours.length} openingHours entries`);
	}

	console.log('\n=== scrubNegativeReviewContent ===');
	const cleanText = "Davie closes at 11pm tonight, just checked the live page.";
	const cleanResult = scrubNegativeReviewContent(cleanText, true, 'test');
	check('clean text with web_search passes through', !cleanResult.scrubbed && cleanResult.text === cleanText);

	const negativeText = "Some reviews call the food terrible and a few said they got sick.";
	const negResult = scrubNegativeReviewContent(negativeText, true, 'test');
	check('negative text + web_search → scrubbed', negResult.scrubbed && negResult.text !== negativeText, `matched=${negResult.matched.join(',')}`);

	const negNoSearch = scrubNegativeReviewContent(negativeText, false, 'test');
	check('negative text + no web_search → not scrubbed', !negNoSearch.scrubbed && negNoSearch.text === negativeText);

	const oneStarText = "One review on the site mentioned 1-star feedback.";
	const oneStarResult = scrubNegativeReviewContent(oneStarText, true, 'test');
	check('1-star phrase triggers scrub', oneStarResult.scrubbed, `matched=${oneStarResult.matched.join(',')}`);

	console.log(`\n=== Summary ===\n  ${pass} passed, ${fail} failed\n`);
	process.exit(fail === 0 ? 0 : 1);
}

main().catch((err) => {
	console.error('Smoke test crashed:', err);
	process.exit(1);
});
