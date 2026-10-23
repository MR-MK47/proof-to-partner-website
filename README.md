# Proof to Partner

A fast, accessible B2B connector website built with Astro, Tailwind CSS v4, Cloudflare Workers, and Cloudflare D1.

Proof to Partner helps businesses describe genuine commercial requirements and explore relevant introductions. An enquiry is a starting point, not a promise that a match or transaction will result.

## Features

- Static, SEO-ready public pages for Home, How It Works, Buyers, Suppliers, About, Contact, Privacy, and Terms, plus a branded 404.
- Accessible contact form for buyer requirements, supplier introductions, and general enquiries.
- Server-side validation, a honeypot, optional Cloudflare Turnstile validation, optional salted IP-hash rate limiting, and a D1 record saved before email delivery is attempted.
- Optional Resend notification and acknowledgement emails; email delivery is explicitly disabled until the relevant configuration is supplied.
- Canonical links, per-page titles/descriptions, Open Graph metadata, Organization/WebSite/Breadcrumb JSON-LD, sitemap, and robots.txt.
- No analytics, advertising scripts, fabricated testimonials, or external client-side UI frameworks.

## Requirements

- Node.js 22 or newer (use a currently supported Node release).
- npm.
- A Cloudflare account and Wrangler login for deployment.
- A D1 database created in your Cloudflare account.
- A verified sending domain and Resend API key if email notifications are required.

## Local development (Windows PowerShell)

1. Install Node.js 22.23.4 or newer compatible Node 22 release and Git for Windows.
2. Open PowerShell and run:

```powershell
git clone https://github.com/MR-MK47/proof-to-partner-website.git
cd proof-to-partner-website
node --version
npm install
npm run check
npm run build
node scripts/check-static-output.mjs
npm run db:migrate:local
npm run dev
```

Open the local URL printed by Wrangler/Astro (normally `http://localhost:4321/`). Keep that terminal open while testing. To verify a saved test enquiry from a second PowerShell window opened in the same project folder, run:

```powershell
npx wrangler d1 execute proof-to-partner-inquiries --local --command "SELECT id, type, name, company, notification_status, created_at FROM inquiries ORDER BY created_at DESC LIMIT 5;"
```

To test the production build locally, stop the dev server with Ctrl+C and run `npm run preview`; use the URL printed in the terminal.

### Troubleshooting: API 404 or D1 binding not found

If a form submission to `/api/inquiries` returns 404 **and** Wrangler says it cannot find the `proof-to-partner-inquiries` database binding, first check that the terminal is in the root of this repository. The same folder should contain `package.json`, `wrangler.jsonc`, and `src/pages/api/inquiries.ts`.

In PowerShell, run:

```powershell
git remote -v
Test-Path .\wrangler.jsonc
Test-Path .\src\pages\api\inquiries.ts
Select-String -Path .\wrangler.jsonc -Pattern 'database_name|binding'
```

The configured database name should be `proof-to-partner-inquiries` and its binding should be `DB`. If this is a Git checkout of this repository, update it and reinstall dependencies:

```powershell
git pull origin main
npm install
npm run check
npm run db:migrate:local
npm run dev
```

Stop any already-running development server with `Ctrl+C` before restarting it, and keep the new server terminal open. Run the database command from the same project-root folder. If either `Test-Path` check returns `False`, do not keep retrying Wrangler there—the terminal is in the wrong folder or that local copy does not contain the current repository. The Node `UV_HANDLE_CLOSING` assertion may appear after Wrangler has already failed; resolve the preceding configuration/path error first.

A local `.dev.vars` file is optional. Copy `.dev.vars.example` to `.dev.vars` only when testing email or Turnstile. The example file uses blank values by default. Without Resend credentials, enquiries should still be saved to local D1, but notification email will not be sent. Configure Cloudflare Turnstile site/secret keys together to enable its challenge; omit both during initial local testing. `.dev.vars` is ignored by git. Never paste real secret values into source files or commit them.

Useful commands:

```sh
npm run check       # Astro and TypeScript checks
npm run build       # production build
npm run preview     # preview the Cloudflare Workers build
npm run db:migrate:local
npm run db:migrate:remote
npm run deploy      # build and deploy through Wrangler (requires account setup)
```

## Create and configure D1

1. Log in: `npx wrangler login`.
2. Create a database: `npx wrangler d1 create proof-to-partner-inquiries`.
3. Copy the returned database UUID into `wrangler.jsonc` at `d1_databases[0].database_id`. Keep the binding name `DB` and the database name aligned.
4. Apply the migration: `npm run db:migrate:remote`.
5. Deploy: `npm run deploy`.

Do not invent the database UUID. Until it is set, Wrangler commands that need the remote database will not work.

## Secrets and email delivery

Resend is called via its HTTPS API; no SDK or extra backend service is required. Verify the domain/sender in Resend first, then configure secrets using Wrangler (never commit these values):

```sh
npx wrangler secret put RESEND_API_KEY
npx wrangler secret put RESEND_FROM_EMAIL
npx wrangler secret put INQUIRY_NOTIFY_TO
npx wrangler secret put RATE_LIMIT_SALT
```

For local-only testing, put the same variable names in `.dev.vars`. `RESEND_FROM_EMAIL` must be a sender/domain Resend has authorized. `INQUIRY_NOTIFY_TO` is the inbox you actually monitor. Neither address is hard-coded into the public website. If any required email setting is missing, the endpoint records the enquiry and emits a safe warning to Worker logs rather than claiming email was sent. The visitor acknowledgement is only attempted after the inquiry is stored and only when `SEND_ACKNOWLEDGEMENT=true` is set as a non-secret Worker variable; it requires the same Resend configuration.

## Optional Turnstile

Create a Turnstile widget in Cloudflare. Set its public site key as a Worker variable `PUBLIC_TURNSTILE_SITE_KEY` and the matching secret as a Worker secret:

```sh
npx wrangler secret put TURNSTILE_SECRET_KEY
```

The site key is public, by design; the secret key must remain server-only. Server-side Siteverify validation is used whenever `TURNSTILE_SECRET_KEY` is configured. Configure both values together. Turnstile tokens are validated on the server and are not trusted based on client-side UI alone.

## Environment variables

| Name | Where | Purpose |
|---|---|---|
| `PUBLIC_TURNSTILE_SITE_KEY` | Wrangler vars / `.dev.vars` | Public key for rendering the optional challenge |
| `TURNSTILE_SECRET_KEY` | Wrangler secret / `.dev.vars` | Server-side Siteverify; never expose publicly |
| `RESEND_API_KEY` | Wrangler secret / `.dev.vars` | Resend API access |
| `RESEND_FROM_EMAIL` | Wrangler secret / `.dev.vars` | Verified sender used for messages |
| `INQUIRY_NOTIFY_TO` | Wrangler secret / `.dev.vars` | Business inbox that receives alerts |
| `RATE_LIMIT_SALT` | Wrangler secret / `.dev.vars` | Secret pepper for privacy-conscious rate-limit fingerprints |
| `SEND_ACKNOWLEDGEMENT` | Wrangler vars / `.dev.vars` | Set to `true` to email the visitor after storage |

Wrangler secrets should be created with `wrangler secret put`. The example configuration contains no real secrets or account-specific IDs.

## Domain and deployment

This build targets **Cloudflare Workers**, not Cloudflare Pages. Astro's Cloudflare adapter handles the runtime API endpoint while public pages are prerendered.

1. Complete the D1 configuration above.
2. Run `npm run check && npm run build`.
3. Run `npm run preview` and submit test enquiries against the local database.
4. Run `npm run deploy`.
5. In Cloudflare, attach `prooftopartner.com` as a custom domain to the deployed Worker and follow the dashboard's DNS/TLS instructions. Do not replace nameservers or delete existing records without reviewing the current DNS zone first.
6. Add `https://prooftopartner.com/sitemap-index.xml` in Google Search Console after the site is publicly reachable.

The domain must resolve to this Worker before the canonical URLs are live. Deployment does not itself create or change DNS records.

## Operational notes

- The public endpoint only accepts `POST`; it has no endpoint for reading private inquiry records.
- The D1 migration stores inquiry content, consent/version details, and timestamps; do not collect passwords, payment details, health data, or other unnecessary sensitive information in the message field.
- Inquiry records are not accessible through a public dashboard. Keep access to the Cloudflare account restricted to trusted operators.
- Notification email failures are written to Worker logs, while the saved D1 record remains the source of truth. Review Worker logs and Resend delivery logs when troubleshooting.
- Review the Privacy Policy before launch for your actual business location/legal identity, inbox, retention practice, contact route, and any jurisdiction-specific obligations. The current website intentionally does not invent those details.

## Gemini workflow adaptation

Adapted: useful business-specific pages, accessible responsive layout, brand/favicon/social assets, per-page metadata, canonical URLs, semantic headings, structured data, robots.txt, an Astro-generated sitemap, and a custom 404.

Intentionally omitted: Reddit/Quora micro-tool ideation, competitor copying, bulk FAQ/schema injection, unsupported keyword-volume claims, arbitrary multilingual pages, cross-site backlink schemes, Google Analytics, AdSense, and ads. The business site should earn trust through accurate explanations of its process, not through a micro-tool SEO/monetization playbook.

## Useful official documentation

- Astro Cloudflare adapter: https://docs.astro.build/en/guides/integrations-guide/cloudflare/
- Astro sitemap: https://docs.astro.build/en/guides/integrations-guide/sitemap/
- Cloudflare Workers deployment: https://docs.astro.build/en/guides/deploy/cloudflare/
- D1 Worker API: https://developers.cloudflare.com/d1/worker-api/
- D1 migrations: https://developers.cloudflare.com/d1/reference/migrations/
- Turnstile Siteverify: https://developers.cloudflare.com/turnstile/get-started/server-side-validation/
- Resend API: https://resend.com/docs/api-reference/emails/send-email
