import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  site: 'https://prooftopartner.com',
  output: 'static',
  trailingSlash: 'always',
  adapter: cloudflare(),
  integrations: [sitemap({
    filter: (page) => page !== 'https://prooftopartner.com/404/' && !page.includes('/api/'),
  })],
  vite: { plugins: [tailwindcss()] },
});