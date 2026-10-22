import { access, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const root = new URL('../dist/', import.meta.url);
const required = [
  'index.html',
  'how-it-works/index.html',
  'for-buyers/index.html',
  'for-suppliers/index.html',
  'about/index.html',
  'contact/index.html',
  'privacy/index.html',
  'terms/index.html',
  '404.html',
  'robots.txt',
  'sitemap-index.xml',
  'favicon.svg',
  'brand-mark.svg',
  'social-card.svg',
  'manifest.webmanifest',
];
const errors = [];
for (const file of required) {
  try { await access(new URL(file, root)); }
  catch { errors.push('Missing expected build output: ' + file); }
}
const htmlFiles = required.filter((file) => file.endsWith('.html'));
const titles = new Set();
for (const file of htmlFiles) {
  try {
    const html = await readFile(new URL(file, root), 'utf8');
    const title = html.match(/<title>([^<]+)<\/title>/i)?.[1];
    const description = html.match(/<meta name="description" content="([^"]*)"/i)?.[1];
    const canonical = html.match(/<link rel="canonical" href="([^"]+)"/i)?.[1];
    if (!title) errors.push(file + ': title tag is missing');
    else if (titles.has(title)) errors.push(file + ': duplicate title tag ' + title);
    else titles.add(title);
    if (!description || description.length < 40) errors.push(file + ': missing or very short description');
    if (!canonical || !canonical.startsWith('https://prooftopartner.com/')) errors.push(file + ': canonical URL missing or off-domain');
    if (!html.includes('application/ld+json')) errors.push(file + ': structured data is missing');
  } catch { errors.push('Could not inspect HTML output: ' + file); }
}
try {
  const robots = await readFile(new URL('robots.txt', root), 'utf8');
  if (!robots.includes('Sitemap: https://prooftopartner.com/sitemap-index.xml')) errors.push('robots.txt does not point to sitemap-index.xml');
  if (!robots.includes('Allow: /')) errors.push('robots.txt does not explicitly allow public crawling');
} catch { /* Missing file is already reported above. */ }
if (errors.length) {
  console.error('Static site checks failed:\n- ' + errors.join('\n- '));
  process.exitCode = 1;
} else {
  console.log('Static output checks passed: ' + required.length + ' expected files and ' + htmlFiles.length + ' HTML documents inspected.');
}