import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  site: 'https://prooftopartner.com',
  output: 'static',
  // API endpoints must accept slashless URLs such as /api/inquiries.
  // `ignore` avoids Astro dev's 404 behavior for on-demand endpoints with `always`.
  trailingSlash: 'ignore',
  adapter: cloudflare({ imageService: 'compile' }),
  session: false,
  integrations: [sitemap({
    filter: (page) => page !== 'https://prooftopartner.com/404/' && !page.includes('/api/'),
  })],
  vite: { plugins: [tailwindcss()] },
});