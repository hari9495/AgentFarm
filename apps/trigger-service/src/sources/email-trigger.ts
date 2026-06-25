import type { TriggerSource, TriggerSourceKind, TriggerEvent } from '../types.js';
import crypto from 'node:crypto';
import { simpleParser } from 'mailparser';

function stripHtml(html: string): string {
    return html
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/(?:p|div|li|tr|h[1-6])>/gi, '\n')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/\s{2,}/g, ' ')
        .trim();
}

type RawEvent = Omit<TriggerEvent, 'tenantId' | 'agentId'>;
type OnEvent = (event: RawEvent) => Promise<void>;

export type EmailTriggerOptions = {
    host: string;
    port: number;
    secure: boolean;
    user: string;
    pass: string;
    /** Mailbox to watch — defaults to 'INBOX' */
    mailbox?: string;
    /** IMAP idle timeout ms — defaults to 30 000 */
    idleTimeout?: number;
    smtpConfig?: {
        host: string;
        port: number;
        secure: boolean;
    };
};

/**
 * EmailTriggerSource — connects via IMAP (imapflow), runs IDLE to receive
 * new messages in near-real-time, marks them SEEN before dispatching to
 * avoid double-processing on reconnect.
 */
export class EmailTriggerSource implements TriggerSource {
    readonly kind: TriggerSourceKind = 'email';

    private readonly opts: EmailTriggerOptions;
    private running = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private client?: any;

    constructor(opts: EmailTriggerOptions) {
        this.opts = opts;
    }

    async start(onEvent: OnEvent): Promise<void> {
        const { ImapFlow } = await import('imapflow');

        this.running = true;
        this.client = new ImapFlow({
            host: this.opts.host,
            port: this.opts.port,
            secure: this.opts.secure,
            auth: { user: this.opts.user, pass: this.opts.pass },
            logger: false,
        });

        await this.client.connect();
        void this.idleLoop(onEvent);
    }

    async stop(): Promise<void> {
        this.running = false;
        if (this.client) {
            try {
                await this.client.logout();
            } catch {
                // best-effort
            }
            this.client = undefined;
        }
    }

    private async idleLoop(onEvent: OnEvent): Promise<void> {
        const mailbox = this.opts.mailbox ?? 'INBOX';
        const idleTimeout = this.opts.idleTimeout ?? 30_000;

        while (this.running && this.client) {
            try {
                await this.client.mailboxOpen(mailbox);

                for await (const message of this.client.fetch('1:*', {
                    uid: true,
                    source: true,
                    flags: true,
                })) {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const msg = message as any;
                    if (msg.flags?.has('\\Seen')) continue;

                    // Mark seen BEFORE dispatch to prevent double-processing
                    await this.client.messageFlagsAdd({ uid: msg.uid }, ['\\Seen'], { uid: true });

                    let from = 'unknown';
                    let subject: string | undefined;
                    let body = '';
                    let recipient: string | undefined;

                    try {
                        const parsed = await simpleParser(msg.source as Buffer);
                        from = parsed.from?.text ?? 'unknown';
                        subject = parsed.subject ?? undefined;
                        // L1 — capture the To address so the router can route to the agent
                        // whose persona mailbox matches (handles To: as object or array).
                        const to = parsed.to;
                        recipient = Array.isArray(to) ? to[0]?.text : to?.text;
                        if (parsed.text) {
                            body = parsed.text.slice(0, 4000);
                        } else if (parsed.html) {
                            body = stripHtml(parsed.html).slice(0, 4000);
                        }
                    } catch {
                        // fallback: imapflow envelope (plain-text emails without parseable source)
                        const envelope = msg.envelope ?? {};
                        from = Array.isArray(envelope.from) && envelope.from.length > 0
                            ? (envelope.from[0]?.address ?? 'unknown')
                            : 'unknown';
                        subject = typeof envelope.subject === 'string' ? envelope.subject : undefined;
                        recipient = Array.isArray(envelope.to) && envelope.to.length > 0
                            ? (envelope.to[0]?.address ?? undefined)
                            : undefined;
                    }

                    if (!body) body = subject ?? '(no body)';

                    const smtpHost = this.opts.smtpConfig?.host ?? this.opts.host;
                    const smtpPort = this.opts.smtpConfig?.port ?? 587;
                    const smtpSecure = this.opts.smtpConfig?.secure ?? false;

                    const raw: RawEvent = {
                        id: crypto.randomUUID(),
                        source: 'email',
                        from,
                        recipient,
                        subject,
                        body,
                        receivedAt: new Date(),
                        replyContext: {
                            source: 'email',
                            replyTo: from,
                            subject: subject ?? '',
                            smtpConfig: {
                                host: smtpHost,
                                port: smtpPort,
                                secure: smtpSecure,
                                user: this.opts.user,
                                pass: this.opts.pass,
                            },
                        },
                    };

                    await onEvent(raw);
                }

                // IDLE — wait for server push
                await this.client.idle({ timeout: idleTimeout });
            } catch (err) {
                if (!this.running) break;
                console.error('EmailTriggerSource: IMAP error, reconnecting in 10s:', err);
                await new Promise((r) => setTimeout(r, 10_000));
            }
        }
    }
}
