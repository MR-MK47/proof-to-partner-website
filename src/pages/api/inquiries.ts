import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';

interface D1Result<T = unknown> { success: boolean; results?: T[]; meta?: { changes?: number }; }
interface D1Statement {
  bind(...values: unknown[]): D1Statement;
  first<T = unknown>(): Promise<T | null>;
  run<T = unknown>(): Promise<D1Result<T>>;
}
interface D1Database { prepare(query: string): D1Statement; }
interface Bindings {
  DB?: D1Database;
  RESEND_API_KEY?: string;
  RESEND_FROM_EMAIL?: string;
  INQUIRY_NOTIFY_TO?: string;
  RATE_LIMIT_SALT?: string;
  TURNSTILE_SECRET_KEY?: string;
  SEND_ACKNOWLEDGEMENT?: string;
}
type InquiryType = 'buyer' | 'supplier' | 'general';
interface InquiryPayload {
  type?: unknown; name?: unknown; email?: unknown; company?: unknown; website?: unknown;
  location?: unknown; category?: unknown; timing?: unknown; message?: unknown; consent?: unknown;
  company_fax?: unknown; form_started_at?: unknown; turnstile_token?: unknown;
}
interface CleanInquiry {
  type: InquiryType; name: string; email: string; company: string; website: string;
  location: string; category: string; timing: string; message: string;
}
interface ResendResponse { id?: string; message?: string; name?: string; }

export const prerender = false;

const json = (body: Record<string, unknown>, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Robots-Tag': 'noindex, nofollow',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
  },
});

const textField = (value: unknown, label: string, max: number, required = false): string => {
  if (typeof value !== 'string') throw new Error('Please check the ' + label + ' field.');
  const clean = value.trim();
  if (clean.length > max) throw new Error('The ' + label + ' field is too long.');
  if (required && clean.length === 0) throw new Error('Please complete the ' + label + ' field.');
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(clean)) throw new Error('The ' + label + ' field contains unsupported characters.');
  return clean;
};

const sha256 = async (value: string): Promise<string> => {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
};

const escapeHtml = (value: string): string => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const sendEmail = async (
  bindings: Bindings,
  to: string | string[],
  subject: string,
  html: string,
  replyTo?: string,
): Promise<{ ok: boolean; id?: string; error?: string }> => {
  if (!bindings.RESEND_API_KEY || !bindings.RESEND_FROM_EMAIL) return { ok: false, error: 'email_not_configured' };
  try {
    const body: Record<string, unknown> = {
      from: bindings.RESEND_FROM_EMAIL,
      to,
      subject,
      html,
    };
    if (replyTo) body.reply_to = replyTo;
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + bindings.RESEND_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    const result = await response.json().catch(() => ({})) as ResendResponse;
    if (!response.ok) {
      console.error('[inquiries] Resend returned status', response.status, 'error type', result.name || 'unknown');
      return { ok: false, error: 'email_provider_error' };
    }
    return result.id ? { ok: true, id: result.id } : { ok: true };
  } catch (error) {
    console.error('[inquiries] Email request failed', error instanceof Error ? error.name : 'unknown');
    return { ok: false, error: 'email_network_error' };
  }
};

const validate = (payload: InquiryPayload): CleanInquiry => {
  if (payload.type !== 'buyer' && payload.type !== 'supplier' && payload.type !== 'general') throw new Error('Please choose an enquiry type.');
  const type = payload.type as InquiryType;
  const name = textField(payload.name, 'name', 100, true);
  const email = textField(payload.email, 'email', 254, true);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || /[\r\n]/.test(email)) throw new Error('Please enter a valid email address.');
  const company = textField(payload.company ?? '', 'company', 160, type !== 'general');
  const websiteInput = textField(payload.website ?? '', 'website', 300);
  let website = websiteInput;
  if (website) {
    // Accept convenient entries such as "example.com" while restricting saved URLs to HTTP(S).
    if (!/^https?:\/\//i.test(website)) {
      if (/^[a-z][a-z0-9+.-]*:/i.test(website)) throw new Error('Please enter a valid company website URL.');
      website = 'https://' + website;
    }
    let parsed: URL;
    try { parsed = new URL(website); } catch { throw new Error('Please enter a valid company website URL.'); }
    if ((parsed.protocol !== 'https:' && parsed.protocol !== 'http:') || !parsed.hostname || parsed.username || parsed.password) {
      throw new Error('Please enter a valid company website URL.');
    }
    website = parsed.toString();
  }
  const location = textField(payload.location ?? '', 'location', 160);
  const category = textField(payload.category ?? '', 'category', 160, type !== 'general');
  const timing = textField(payload.timing ?? '', 'timing', 100, type === 'buyer');
  const message = textField(payload.message, 'message', 5000, true);
  if (message.length < 10) throw new Error('Please add a little more detail (at least 10 characters).');
  if (payload.consent !== 'yes') throw new Error('Please confirm the privacy notice before submitting.');
  return { type, name, email, company, website, location, category, timing, message };
};

export const POST: APIRoute = async ({ request }) => {
  const bindings = env as unknown as Bindings;
  if (!bindings.DB) {
    console.error('[inquiries] D1 binding DB is not configured.');
    return json({ ok: false, error: 'The enquiry service is not configured yet. Please try again later.' }, 503);
  }
  const origin = request.headers.get('Origin');
  if (origin) {
    try {
      if (new URL(origin).host !== new URL(request.url).host) return json({ ok: false, error: 'This request could not be verified. Reload the page and try again.' }, 403);
    } catch {
      return json({ ok: false, error: 'This request could not be verified.' }, 403);
    }
  }
  const contentType = request.headers.get('Content-Type') || '';
  if (!contentType.toLowerCase().includes('application/json')) return json({ ok: false, error: 'Please submit the form using the website.' }, 415);
  const contentLength = Number(request.headers.get('Content-Length') || '0');
  if (contentLength > 12_000) return json({ ok: false, error: 'The submitted form is too large.' }, 413);

  let payload: InquiryPayload;
  try {
    const raw = await request.text();
    if (raw.length > 12_000) return json({ ok: false, error: 'The submitted form is too large.' }, 413);
    payload = JSON.parse(raw) as InquiryPayload;
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('invalid');
  } catch {
    return json({ ok: false, error: 'The form data could not be read. Please try again.' }, 400);
  }

  // Quietly discard obvious automated submissions without saving personal content.
  if (typeof payload.company_fax === 'string' && payload.company_fax.trim().length > 0) return json({ ok: true, message: 'Thank you. Your enquiry has been received.' }, 201);
  const formStartedAt = Number(payload.form_started_at);
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (!Number.isFinite(formStartedAt) || formStartedAt <= 0 || formStartedAt > nowSeconds + 60) return json({ ok: false, error: 'Please refresh the form and try again.' }, 400);
  if (nowSeconds - formStartedAt < 2) return json({ ok: true, message: 'Thank you. Your enquiry has been received.' }, 201);

  let inquiry: CleanInquiry;
  try { inquiry = validate(payload); } catch (error) {
    return json({ ok: false, error: error instanceof Error ? error.message : 'Please review the form fields.' }, 400);
  }

  if (bindings.TURNSTILE_SECRET_KEY) {
    const token = typeof payload.turnstile_token === 'string' ? payload.turnstile_token : '';
    if (!token || token.length > 2048) return json({ ok: false, error: 'Please complete the security check.' }, 400);
    try {
      const form = new URLSearchParams();
      form.set('secret', bindings.TURNSTILE_SECRET_KEY);
      form.set('response', token);
      const remoteIp = request.headers.get('CF-Connecting-IP');
      if (remoteIp) form.set('remoteip', remoteIp);
      const verifyResponse = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: form,
      });
      const verification = await verifyResponse.json() as { success?: boolean; hostname?: string };
      const hostAllowed = !verification.hostname || verification.hostname === 'prooftopartner.com' || verification.hostname === 'www.prooftopartner.com' || verification.hostname === 'localhost' || verification.hostname === '127.0.0.1';
      if (!verifyResponse.ok || verification.success !== true || !hostAllowed) return json({ ok: false, error: 'The security check did not pass. Please try again.' }, 400);
    } catch {
      console.error('[inquiries] Turnstile Siteverify request failed.');
      return json({ ok: false, error: 'The security check could not be completed. Please try again.' }, 503);
    }
  }

  let ipHash: string | null = null;
  const remoteIp = request.headers.get('CF-Connecting-IP');
  if (remoteIp && bindings.RATE_LIMIT_SALT) {
    ipHash = await sha256(bindings.RATE_LIMIT_SALT + ':' + remoteIp);
    try {
      const recent = await bindings.DB.prepare(
        "SELECT COUNT(*) AS total FROM inquiries WHERE ip_hash = ? AND created_at >= datetime('now', '-1 hour')",
      ).bind(ipHash).first<{ total: number }>();
      if ((recent?.total ?? 0) >= 5) return json({ ok: false, error: 'Too many enquiries have been submitted from this connection. Please try again later.' }, 429);
    } catch (error) {
      console.error('[inquiries] Rate-limit lookup failed', error instanceof Error ? error.name : 'unknown');
      return json({ ok: false, error: 'The enquiry service is temporarily unavailable. Please try again later.' }, 503);
    }
  }

  const id = crypto.randomUUID();
  try {
    const insertSql = 'INSERT INTO inquiries (' +
      'id, type, name, email, company, website, location, category, timing, message, ' +
      'consent_at, privacy_policy_version, ip_hash, notification_status, acknowledgement_status' +
      ') VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?, ?, \'pending\', \'not_requested\')';
    await bindings.DB.prepare(insertSql).bind(
      id, inquiry.type, inquiry.name, inquiry.email, inquiry.company, inquiry.website,
      inquiry.location, inquiry.category, inquiry.timing, inquiry.message,
      '2026-10-22', ipHash,
    ).run();
  } catch (error) {
    console.error('[inquiries] D1 insert failed', error instanceof Error ? error.name : 'unknown');
    return json({ ok: false, error: 'We could not save your enquiry. Please try again in a moment.' }, 503);
  }

  const labels: Record<InquiryType, string> = { buyer: 'Buyer requirement', supplier: 'Supplier introduction', general: 'General contact' };
  const adminHtml = [
    '<h2>New Proof to Partner enquiry</h2>',
    '<p><strong>Reference:</strong> ' + escapeHtml(id) + '</p>',
    '<p><strong>Type:</strong> ' + escapeHtml(labels[inquiry.type]) + '</p>',
    '<p><strong>Name:</strong> ' + escapeHtml(inquiry.name) + '</p>',
    '<p><strong>Email:</strong> ' + escapeHtml(inquiry.email) + '</p>',
    '<p><strong>Company:</strong> ' + escapeHtml(inquiry.company || 'Not provided') + '</p>',
    '<p><strong>Website:</strong> ' + escapeHtml(inquiry.website || 'Not provided') + '</p>',
    '<p><strong>Location:</strong> ' + escapeHtml(inquiry.location || 'Not provided') + '</p>',
    '<p><strong>Category:</strong> ' + escapeHtml(inquiry.category || 'Not provided') + '</p>',
    '<p><strong>Timing:</strong> ' + escapeHtml(inquiry.timing || 'Not provided') + '</p>',
    '<p><strong>Message:</strong></p><p>' + escapeHtml(inquiry.message).replace(/\n/g, '<br>') + '</p>',
  ].join('');

  const recipients = (bindings.INQUIRY_NOTIFY_TO || '').split(',').map((address) => address.trim()).filter(Boolean);
  const emailConfigured = Boolean(bindings.RESEND_API_KEY && bindings.RESEND_FROM_EMAIL && recipients.length > 0);
  let notificationStatus = 'not_configured';
  if (emailConfigured) {
    const notification = await sendEmail(bindings, recipients, '[' + labels[inquiry.type] + '] New Proof to Partner enquiry', adminHtml, inquiry.email);
    notificationStatus = notification.ok ? 'sent' : 'failed';
    if (!notification.ok) console.error('[inquiries] Notification delivery not confirmed for inquiry', id, notification.error);
  } else {
    console.warn('[inquiries] Inquiry saved, but notification email is not configured. Reference:', id);
  }
  try {
    await bindings.DB.prepare('UPDATE inquiries SET notification_status = ? WHERE id = ?').bind(notificationStatus, id).run();
  } catch (error) {
    console.error('[inquiries] Could not update notification status', error instanceof Error ? error.name : 'unknown');
  }

  let acknowledgementStatus = 'not_requested';
  if (bindings.SEND_ACKNOWLEDGEMENT === 'true') {
    if (emailConfigured) {
      const acknowledgement = await sendEmail(
        bindings,
        inquiry.email,
        'We received your Proof to Partner enquiry',
        '<p>Hello ' + escapeHtml(inquiry.name) + ',</p><p>Thank you for contacting Proof to Partner. Your enquiry has been received and stored. We aim to review new enquiries within two business days, though this is a target rather than a guarantee.</p><p>A submission does not guarantee an introduction or commercial outcome. Please do not reply with sensitive or confidential details.</p><p>Proof to Partner</p>',
      );
      acknowledgementStatus = acknowledgement.ok ? 'sent' : 'failed';
      if (!acknowledgement.ok) console.error('[inquiries] Acknowledgement delivery not confirmed for inquiry', id, acknowledgement.error);
    } else {
      acknowledgementStatus = 'not_configured';
      console.warn('[inquiries] Acknowledgement requested but email configuration is incomplete. Reference:', id);
    }
    try {
      await bindings.DB.prepare('UPDATE inquiries SET acknowledgement_status = ? WHERE id = ?').bind(acknowledgementStatus, id).run();
    } catch (error) {
      console.error('[inquiries] Could not update acknowledgement status', error instanceof Error ? error.name : 'unknown');
    }
  }

  const message = notificationStatus === 'sent'
    ? 'Thank you. Your enquiry has been saved and the business notification was sent.'
    : 'Thank you. Your enquiry has been saved. Email notification could not be confirmed, so a human follow-up is not guaranteed until email delivery is configured and monitored.';
  return json({ ok: true, message, reference: id }, 201);
};