import type { TriggerSource, TriggerSourceKind, TriggerEvent } from '../types.js';
import crypto from 'node:crypto';

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
                    envelope: true,
                    bodyParts: ['TEXT'],
                    flags: true,
                })) {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const msg = message as any;
                    if (msg.flags?.has('\\Seen')) continue;

                    // Mark seen BEFORE dispatch to prevent double-processing
                    await this.client.messageFlagsAdd({ uid: msg.uid }, ['\\Seen'], { uid: true });

                    const envelope = msg.envelope ?? {};
                    const from =
                        Array.isArray(envelope.from) && envelope.from.length > 0
                            ? (envelope.from[0]?.address ?? 'unknown')
                            : 'unknown';
                    const subject = typeof envelope.subject === 'string' ? envelope.subject : undefined;

                    // Extract plain text body
                    let body = '';
                    if (msg.bodyParts) {
                        const textPart = msg.bodyParts.get('TEXT') ?? msg.bodyParts.get('text');
                        if (textPart instanceof Uint8Array) {
                            body = new TextDecoder().decode(textPart).slice(0, 4000);
                        }
                    }
                    if (!body) body = subject ?? '(no body)';

                    const smtpHost = this.opts.smtpConfig?.host ?? this.opts.host;
                    const smtpPort = this.opts.smtpConfig?.port ?? 587;
                    const smtpSecure = this.opts.smtpConfig?.secure ?? false;

                    const raw: RawEvent = {
                        id: crypto.randomUUID(),
                        source: 'email',
                        from,
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
