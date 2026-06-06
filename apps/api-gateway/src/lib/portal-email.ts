/**
 * portal-email.ts
 *
 * Sends transactional emails for the customer portal (password reset etc.).
 *
 * Priority chain — first configured provider wins:
 *   1. Resend  — set RESEND_API_KEY  (+ optional PORTAL_EMAIL_FROM)
 *   2. Generic webhook — set PORTAL_RESET_WEBHOOK_URL
 *   3. Console log  — always available; dev-only fallback
 *
 * No npm dependencies — Resend is called via plain fetch.
 */

export interface PasswordResetEmailOptions {
    to: string;
    tenantId: string;
    resetUrl: string;
    expiresAt: string; // ISO string
}

const FROM = (): string => process.env['PORTAL_EMAIL_FROM'] ?? 'AgentFarm Support <noreply@agentfarm.io>';

function buildResetHtml(opts: PasswordResetEmailOptions): string {
    return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:Inter,system-ui,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:40px 16px;">
    <table width="520" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;border:1px solid #e2e8f0;">
      <tr><td style="padding:32px 40px 0;">
        <p style="margin:0;font-size:22px;font-weight:700;color:#111827;">🔑 Reset your password</p>
      </td></tr>
      <tr><td style="padding:16px 40px;">
        <p style="color:#374151;font-size:15px;line-height:1.6;margin:0 0 20px;">
          We received a password reset request for your AgentFarm portal account
          on tenant <strong>${opts.tenantId}</strong>.
        </p>
        <a href="${opts.resetUrl}"
           style="display:inline-block;padding:12px 28px;background:#2563eb;color:#fff;
                  border-radius:6px;font-weight:600;font-size:15px;text-decoration:none;">
          Reset Password
        </a>
        <p style="color:#6b7280;font-size:13px;margin:20px 0 0;">
          This link expires on ${new Date(opts.expiresAt).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}.
          If you did not request this, you can safely ignore this email.
        </p>
      </td></tr>
      <tr><td style="padding:24px 40px 32px;border-top:1px solid #f1f5f9;">
        <p style="margin:0;font-size:12px;color:#9ca3af;">
          AgentFarm · This is an automated message, please do not reply.
        </p>
      </td></tr>
    </table>
  </td></tr></table>
</body>
</html>`;
}

function buildResetText(opts: PasswordResetEmailOptions): string {
    return `Reset your AgentFarm password

We received a password reset request for your account (tenant: ${opts.tenantId}).

Reset link: ${opts.resetUrl}

This link expires at ${opts.expiresAt}.
If you did not request this, ignore this email.

— AgentFarm`;
}

/**
 * Send a password-reset email.
 * Returns `true` if the email was dispatched, `false` if only logged.
 */
export async function sendPasswordResetEmail(opts: PasswordResetEmailOptions): Promise<boolean> {
    const resendKey = process.env['RESEND_API_KEY'];
    const webhookUrl = process.env['PORTAL_RESET_WEBHOOK_URL'];

    // ── 1. Resend ──────────────────────────────────────────────────────────────
    if (resendKey) {
        try {
            const res = await fetch('https://api.resend.com/emails', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${resendKey}`,
                },
                body: JSON.stringify({
                    from: FROM(),
                    to: [opts.to],
                    subject: 'Reset your AgentFarm portal password',
                    html: buildResetHtml(opts),
                    text: buildResetText(opts),
                }),
                signal: AbortSignal.timeout(10_000),
            });
            if (res.ok) {
                console.info(`[portal-email] Reset email sent via Resend to ${opts.to}`);
                return true;
            }
            const err = await res.text();
            console.warn(`[portal-email] Resend error ${res.status}: ${err}`);
        } catch (e) {
            console.warn(`[portal-email] Resend fetch failed: ${e instanceof Error ? e.message : String(e)}`);
        }
    }

    // ── 2. Generic webhook ────────────────────────────────────────────────────
    if (webhookUrl) {
        try {
            await fetch(webhookUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    to: opts.to,
                    tenantId: opts.tenantId,
                    subject: 'Reset your AgentFarm portal password',
                    resetUrl: opts.resetUrl,
                    expiresAt: opts.expiresAt,
                    html: buildResetHtml(opts),
                    text: buildResetText(opts),
                }),
                signal: AbortSignal.timeout(8_000),
            });
            console.info(`[portal-email] Reset email dispatched via webhook to ${opts.to}`);
            return true;
        } catch (e) {
            console.warn(`[portal-email] Webhook failed: ${e instanceof Error ? e.message : String(e)}`);
        }
    }

    // ── 3. Console fallback (dev) ──────────────────────────────────────────────
    console.info(`[portal-email] Password reset link for ${opts.to}: ${opts.resetUrl}`);
    return false;
}
