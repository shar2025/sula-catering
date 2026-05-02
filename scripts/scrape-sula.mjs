/**
 * scrape-sula.mjs — fetches sulacafe.com + sulacatering.com sitemaps,
 * downloads each page, strips chrome, extracts prose, writes
 * src/lib/neela-knowledge.ts as a string constant for Neela's system prompt.
 *
 * Runs as a prebuild step. On any fetch failure it falls back to writing a
 * stub so the build doesn't crash. Halts the build if the knowledge base
 * exceeds the token budget.
 *
 * Explicitly does NOT scrape sulaindianrestaurant.com (Shar's no-touch).
 */

import * as cheerio from 'cheerio';
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const SITEMAPS = [
	'https://sulacafe.com/sitemap-index.xml',
	'https://sulacatering.com/sitemap-index.xml'
];

const BLOCKED_HOSTS = ['sulaindianrestaurant.com'];

const STRIP_SELECTORS = [
	'header.site-header',
	'footer.site-footer',
	'.mobile-menu',
	'.neela-fab',
	'.neela-modal',
	'.marquee',
	'script',
	'style',
	'noscript'
];

const MIN_WORDS = 50;
const APPROX_CHARS_PER_TOKEN = 4;
const MAX_TOKENS = 150_000;
const CONCURRENCY = 5;
const FETCH_TIMEOUT_MS = 15000;

const OUT_PATH = path.join('src', 'lib', 'neela-knowledge.ts');

async function fetchText(url) {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
	try {
		const resp = await fetch(url, {
			headers: { 'User-Agent': 'SulaNeelaBot/1.0 (events@sulaindianrestaurant.com)' },
			signal: controller.signal
		});
		if (!resp.ok) throw new Error(`${resp.status}`);
		return await resp.text();
	} finally {
		clearTimeout(timer);
	}
}

async function collectUrls(sitemapUrl, depth = 0) {
	if (depth > 3) return [];
	const xml = await fetchText(sitemapUrl);
	const $ = cheerio.load(xml, { xmlMode: true });
	const subSitemaps = [];
	$('sitemap > loc').each((_, el) => subSitemaps.push($(el).text().trim()));
	if (subSitemaps.length > 0) {
		const nested = await Promise.all(subSitemaps.map((s) => collectUrls(s, depth + 1)));
		return nested.flat();
	}
	const urls = [];
	$('url > loc').each((_, el) => urls.push($(el).text().trim()));
	return urls;
}

function extractContent(html, url) {
	const $ = cheerio.load(html);
	STRIP_SELECTORS.forEach((sel) => $(sel).remove());
	const title =
		$('title').first().text().trim() ||
		$('h1').first().text().trim() ||
		url;
	const main = $('main').first();
	const root = main.length ? main : $('body');
	const blocks = [];
	root.find('h1, h2, h3, h4, p, li, blockquote').each((_, el) => {
		const tag = el.tagName ? el.tagName.toLowerCase() : '';
		const text = $(el).text().replace(/\s+/g, ' ').trim();
		if (!text) return;
		if (tag === 'h1' || tag === 'h2') blocks.push(`\n## ${text}\n`);
		else if (tag === 'h3') blocks.push(`### ${text}`);
		else if (tag === 'h4') blocks.push(`#### ${text}`);
		else if (tag === 'li') blocks.push(`- ${text}`);
		else if (tag === 'blockquote') blocks.push(`> ${text}`);
		else blocks.push(text);
	});
	const content = blocks.join('\n').replace(/\n{3,}/g, '\n\n').trim();
	const wordCount = content.split(/\s+/).filter(Boolean).length;
	return { title: title.replace(/\s+/g, ' '), content, wordCount };
}

async function processUrl(url) {
	try {
		const html = await fetchText(url);
		const { title, content, wordCount } = extractContent(html, url);
		if (wordCount < MIN_WORDS) {
			console.log(`[scrape] skip (${wordCount}w): ${url}`);
			return null;
		}
		console.log(`[scrape] ok   (${wordCount}w): ${url}`);
		return `## ${title}\n${url}\n\n${content}`;
	} catch (err) {
		console.warn(`[scrape] FAIL ${url}: ${err.message || err}`);
		return null;
	}
}

async function pLimit(items, limit, fn) {
	const out = [];
	for (let i = 0; i < items.length; i += limit) {
		const chunk = items.slice(i, i + limit);
		const results = await Promise.all(chunk.map(fn));
		out.push(...results);
	}
	return out;
}

function writeStub(reason) {
	mkdirSync(path.dirname(OUT_PATH), { recursive: true });
	const body = `// AUTO-GENERATED stub by scripts/scrape-sula.mjs
// Reason: ${reason}
// Generated: ${new Date().toISOString()}

export const SITE_CONTENT_KNOWLEDGE_BASE = '';
export const KNOWLEDGE_PAGE_COUNT = 0;
export const KNOWLEDGE_GENERATED_AT = '${new Date().toISOString()}';
`;
	writeFileSync(OUT_PATH, body);
	console.warn(`[scrape] wrote stub to ${OUT_PATH}: ${reason}`);
}

async function main() {
	console.log('[scrape] starting');

	let urls = [];
	for (const sitemap of SITEMAPS) {
		try {
			const found = await collectUrls(sitemap);
			console.log(`[scrape] ${found.length} urls from ${sitemap}`);
			urls.push(...found);
		} catch (err) {
			console.warn(`[scrape] sitemap fail ${sitemap}: ${err.message || err}`);
		}
	}

	urls = urls.filter((u) => !BLOCKED_HOSTS.some((h) => u.includes(h)));
	urls = [...new Set(urls)];
	console.log(`[scrape] ${urls.length} unique urls to process`);

	if (urls.length === 0) {
		writeStub('no urls collected from sitemaps');
		return;
	}

	const sections = await pLimit(urls, CONCURRENCY, processUrl);
	const valid = sections.filter(Boolean);
	console.log(`[scrape] ${valid.length}/${urls.length} pages produced content`);

	if (valid.length === 0) {
		writeStub('no pages produced content');
		return;
	}

	const knowledge = valid.join('\n\n---\n\n');
	const approxTokens = Math.round(knowledge.length / APPROX_CHARS_PER_TOKEN);
	console.log(`[scrape] knowledge base: ${knowledge.length} chars, ~${approxTokens} tokens`);

	if (approxTokens > MAX_TOKENS) {
		console.error(`[scrape] HALT: ${approxTokens} tokens exceeds ${MAX_TOKENS} budget`);
		process.exit(1);
	}

	mkdirSync(path.dirname(OUT_PATH), { recursive: true });
	const body = `// AUTO-GENERATED by scripts/scrape-sula.mjs
// Sourced from sulacafe.com + sulacatering.com sitemaps.
// Regenerated as a prebuild step on every Vercel deploy.
// Do not edit by hand.
//
// Generated: ${new Date().toISOString()}
// Pages: ${valid.length}
// Approx tokens: ${approxTokens}

export const SITE_CONTENT_KNOWLEDGE_BASE = ${JSON.stringify(knowledge)};
export const KNOWLEDGE_PAGE_COUNT = ${valid.length};
export const KNOWLEDGE_GENERATED_AT = ${JSON.stringify(new Date().toISOString())};
`;
	writeFileSync(OUT_PATH, body);
	console.log(`[scrape] wrote ${OUT_PATH} (${valid.length} pages, ~${approxTokens} tokens)`);
}

main().catch((err) => {
	console.error('[scrape] fatal', err);
	writeStub(`fatal error: ${err.message || err}`);
});
