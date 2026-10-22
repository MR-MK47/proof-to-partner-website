import { access, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = new URL('../dist/client/', import.meta.url);
const rootPath = fileURLToPath(root);
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
  try { await access(join(rootPath, file)); }
  catch { errors.push('Missing expected build output: ' + file); }
}

const htmlFiles = required.filter((file) => file.endsWith('.html'));
const titles = new Set();
const internalTargets = new Set();

for (const file of htmlFiles) {
  try {
    const html = await readFile(join(rootPath, file), 'utf8');
    const title = html.match(/<title>([^<]+)<\/title>/i)?.[1];
    const description = html.match(/<meta name="description" content="([^"]*)"/i)?.[1];
    const canonical = html.match(/<link rel="canonical" href="([^"]+)"/i)?.[1];
    if (!title) errors.push(file + ': title tag is missing');
    else if (titles.has(title)) errors.push(file + ': duplicate title tag ' + title);
    else titles.add(title);
    if (!description || description.length < 40) errors.push(file + ': missing or very short description');
    if (!canonical || !canonical.startsWith('https://prooftopartner.com/')) errors.push(file + ': canonical URL missing or off-domain');
    if (!html.includes('application/ld+json')) errors.push(file + ': structured data is missing');

    for (const match of html.matchAll(/\b(?:href|src)="([^"]+)"/gi)) {
      const value = (match[1] || '').replace(/&amp;/g, '&');
      if (!value || value.startsWith('#') || /^(?:mailto:|tel:|data:|javascript:)/i.test(value)) continue;
      let url;
      try { url = new URL(value, 'https://prooftopartner.com'); }
      catch { errors.push(file + ': malformed link or asset path ' + value); continue; }
      if (url.origin !== 'https://prooftopartner.com') continue;
      const pathname = decodeURIComponent(url.pathname);
      if (!pathname.startsWith('/') || pathname.includes('\0')) {
        errors.push(file + ': unsafe local link path ' + value);
        continue;
      }
      const relative = pathname.replace(/^\/+/, '');
      let targetPath;
      if (!relative || pathname.endsWith('/')) targetPath = join(rootPath, relative, 'index.html');
      else if (!/\.[a-z0-9]{1,8}$/i.test(relative)) targetPath = join(rootPath, relative, 'index.html');
      else targetPath = join(rootPath, relative);
      internalTargets.add({ targetPath, source: file, value });
    }
  } catch { errors.push('Could not inspect HTML output: ' + file); }
}

for (const item of internalTargets) {
  try { await access(item.targetPath); }
  catch { errors.push(item.source + ': broken internal link or asset ' + item.value); }
}

try {
  const robots = await readFile(join(rootPath, 'robots.txt'), 'utf8');
  if (!robots.includes('Sitemap: https://prooftopartner.com/sitemap-index.xml')) errors.push('robots.txt does not point to sitemap-index.xml');
  if (!robots.includes('Allow: /')) errors.push('robots.txt does not explicitly allow public crawling');
} catch { /* Missing file is already reported above. */ }

try {
  const sitemapIndex = await readFile(join(rootPath, 'sitemap-index.xml'), 'utf8');
  if (!sitemapIndex.includes('sitemap-0.xml')) errors.push('sitemap-index.xml does not reference the page sitemap');
} catch { /* Missing file is already reported above. */ }

if (errors.length) {
  console.error('Static site checks failed:\n- ' + errors.join('\n- '));
  process.exitCode = 1;
} else {
  console.log('Static output checks passed: ' + required.length + ' expected files, ' + htmlFiles.length + ' HTML documents and ' + internalTargets.size + ' internal links/assets inspected.');
}