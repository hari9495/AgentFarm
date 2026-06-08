/**
 * Shared mailer — sends transactional emails via SMTP (Zoho / any provider).
 *
 * Environment variables (set in apps/dashboard/.env.local or root .env):
 *
 *   SMTP_HOST      smtp.zoho.in          ← Zoho India
 *   SMTP_PORT      587                   ← 587=STARTTLS  465=SSL
 *   SMTP_SECURE    false                 ← true for port 465 (SSL), false for 587 (STARTTLS)
 *   SMTP_USER      info@agentfarms.in    ← your Zoho email
 *   SMTP_PASS      <app-password>        ← Zoho app-specific password (safer than account password)
 *   OTP_FROM_EMAIL info@agentfarms.in    ← From address (defaults to SMTP_USER)
 *
 * Zoho App Password setup (recommended over account password):
 *   Zoho Mail → My Account → Security → App Passwords → Add
 *
 * If SMTP_HOST is not set → falls back to console.info (dev mode).
 */

import nodemailer from 'nodemailer';
import type Mail from 'nodemailer/lib/mailer';

function createTransport() {
    const host = process.env.SMTP_HOST;
    if (!host) return null;

    const port = parseInt(process.env.SMTP_PORT ?? '587', 10);
    const secure = process.env.SMTP_SECURE === 'true' || port === 465;

    return nodemailer.createTransport({
        host,
        port,
        secure,
        auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS,
        },
        // Zoho requires explicit TLS settings on some servers
        tls: {
            rejectUnauthorized: true,
        },
    });
}

export async function sendEmail(opts: {
    to: string;
    subject: string;
    html: string;
    text: string;
}): Promise<{ ok: boolean; error?: string }> {
    const transport = createTransport();

    if (!transport) {
        // Dev fallback — no SMTP configured
        console.info(`[MAILER] No SMTP configured. Email to ${opts.to}:`);
        console.info(`[MAILER] Subject: ${opts.subject}`);
        console.info(`[MAILER] Body:    ${opts.text}`);
        return { ok: true };
    }

    const from =
        process.env.OTP_FROM_EMAIL ??
        process.env.SMTP_USER ??
        'noreply@agentfarms.in';

    const mailOptions: Mail.Options = {
        from: `AgentFarms <${from}>`,
        to: opts.to,
        subject: opts.subject,
        html: opts.html,
        text: opts.text,
    };

    try {
        await transport.sendMail(mailOptions);
        return { ok: true };
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('[MAILER] Send failed:', msg);
        // Log to console as ops fallback
        console.info(`[MAILER FALLBACK] Email to ${opts.to}: ${opts.text}`);
        return { ok: false, error: msg };
    }
}
