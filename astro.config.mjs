import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
	site: 'https://sulacatering.com',
	integrations: [
		sitemap({
			serialize(item) {
				if (item.url === 'https://sulacatering.com/') return item;
				item.url = item.url.replace(/\/$/, '');
				return item;
			},
		}),
	],
});
