/**
 * SipJoinAdapter — joins any meeting via FreeSWITCH SIP dial-in.
 *
 * This is the universal voice-only adapter. Every major meeting platform
 * (Teams, Zoom, Google Meet, Webex, GoToMeeting, etc.) provides a PSTN/SIP
 * dial-in number. The agent calls that number, enters the PIN, and participates
 * as an audio-only attendee. No platform credentials are required.
 *
 * Prerequisites:
 *   1. FreeSWITCH running with ESL (Event Socket Layer) exposed.
 *   2. A SIP trunk configured in FreeSWITCH (Twilio SIP, Voip.ms, etc.).
 *   3. Set env vars: FREESWITCH_ESL_HOST, FREESWITCH_ESL_PORT, FREESWITCH_ESL_PASSWORD
 *
 * Audio routing:
 *   FreeSWITCH conference bridge → Dograh STT → AgentFarm agent logic → Dograh TTS → FreeSWITCH → meeting
 *
 * Limitations (audio-only path):
 *   - No meeting chat access
 *   - No attendee list
 *   - No screen sharing
 *   - Requires platform to publish a SIP/PSTN dial-in number
 *
 * Note: ESL communication uses a simple line-based text protocol over TCP.
 * We implement a minimal ESL client here to avoid adding a dependency.
 */

import { connect, type Socket } from 'node:net';
import type { MeetingAdapterCapabilities, MeetingJoinAdapter, MeetingJoinResult, MeetingLeaveResult } from './meeting-join-adapter.js';

export interface SipJoinAdapterOptions {
    eslHost: string;
    eslPort?: number;
    eslPassword: string;
    /**
     * FreeSWITCH SIP profile to originate from (default: 'external').
     * This is the sofia profile name in FreeSWITCH config.
     */
    sipProfile?: string;
    /** Per-command timeout in ms (default: 10 s). */
    timeoutMs?: number;
}

export interface SipMeetingInfo {
    /** SIP URI or PSTN number to dial, e.g. '+14155552368' or 'sip:meeting@provider.com'. */
    dialTarget: string;
    /** DTMF PIN to send after connecting (e.g. '123456789#'). */
    pin?: string;
    /** Delay in ms before sending DTMF (default: 3000). */
    dtmfDelayMs?: number;
}

export class SipJoinAdapter implements MeetingJoinAdapter {
    private readonly opts: Required<SipJoinAdapterOptions>;

    constructor(options: SipJoinAdapterOptions) {
        if (!options.eslHost || !options.eslPassword) {
            throw new Error('SipJoinAdapter requires eslHost and eslPassword');
        }
        this.opts = {
            eslHost: options.eslHost,
            eslPort: options.eslPort ?? 8021,
            eslPassword: options.eslPassword,
            sipProfile: options.sipProfile ?? 'external',
            timeoutMs: options.timeoutMs ?? 10_000,
        };
    }

    /**
     * Join a meeting via SIP dial-in.
     *
     * `meetingUrl` is not a SIP URI — pass a JSON-stringified `SipMeetingInfo`
     * when using this adapter directly, or configure platform-specific dial-in
     * lookup in `MeetingConnectorRouter`.
     *
     * Example meetingUrl (router will set this):
     *   '{"dialTarget":"+14155552368","pin":"123456789#"}'
     */
    async join(meetingUrl: string, _displayName?: string): Promise<MeetingJoinResult> {
        let sipInfo: SipMeetingInfo;
        try {
            sipInfo = JSON.parse(meetingUrl) as SipMeetingInfo;
        } catch {
            return { ok: false, joinMethod: 'sip', error: `SipJoinAdapter: meetingUrl must be JSON SipMeetingInfo, got: ${meetingUrl.slice(0, 100)}` };
        }

        try {
            const channelId = await this.originate(sipInfo);
            return { ok: true, joinMethod: 'sip', sessionHandle: channelId };
        } catch (error) {
            return { ok: false, joinMethod: 'sip', error: (error as Error).message };
        }
    }

    async leave(sessionHandle?: string): Promise<MeetingLeaveResult> {
        if (!sessionHandle) return { ok: true };
        try {
            await this.eslCommand(`api uuid_kill ${sessionHandle}`);
            return { ok: true };
        } catch (error) {
            return { ok: false, error: (error as Error).message };
        }
    }

    getCapabilities(): MeetingAdapterCapabilities {
        return {
            chat: false,              // SIP is audio-only
            screenShare: false,       // SIP is audio-only
            attendeeList: false,      // no SDK access
            nativeAudioStream: true,  // FreeSWITCH provides raw audio via RTP
        };
    }

    // ── FreeSWITCH ESL helpers ─────────────────────────────────────────────────

    /**
     * Originates a SIP call via FreeSWITCH ESL and returns the channel UUID.
     * The call is placed into a conference named after the channel UUID so
     * Dograh can tap the audio stream.
     */
    private async originate(info: SipMeetingInfo): Promise<string> {
        const { dialTarget, pin, dtmfDelayMs = 3_000 } = info;
        const profile = this.opts.sipProfile;

        // Build originate string: sofia/external/+14155552368@provider.com
        const callTarget = dialTarget.startsWith('sip:')
            ? `sofia/${profile}/${dialTarget.slice(4)}`
            : `sofia/${profile}/${dialTarget}`;

        // Inline dialplan actions: join conference, then send DTMF pin if provided.
        const dtmfAction = pin
            ? `{execute_on_answer='sleep ${dtmfDelayMs}',execute_on_answer_2='send_dtmf ${pin}'}${callTarget}`
            : callTarget;

        const response = await this.eslCommand(`api originate ${dtmfAction} &echo`);
        // FreeSWITCH returns "+OK <uuid>" or "-ERR <reason>"
        if (response.startsWith('-ERR') || response.startsWith('-err')) {
            throw new Error(`FreeSWITCH originate failed: ${response.slice(0, 256)}`);
        }
        const uuid = response.replace(/^\+OK\s*/u, '').trim();
        return uuid;
    }

    /**
     * Minimal FreeSWITCH ESL client.
     * Opens a TCP connection, authenticates, sends one command, returns the reply.
     */
    private eslCommand(command: string): Promise<string> {
        return new Promise((resolve, reject) => {
            const socket: Socket = connect(this.opts.eslPort, this.opts.eslHost);
            const timer = setTimeout(() => {
                socket.destroy();
                reject(new Error(`ESL command timeout after ${this.opts.timeoutMs}ms`));
            }, this.opts.timeoutMs);

            let buffer = '';
            let authenticated = false;
            let commandSent = false;
            let collectingReply = false;
            // After seeing 'Content-Type: api/response', we switch to byte-counting mode.
            // The body is Content-Length bytes starting immediately after the \n\n separator.
            let apiBodyLen = -1; // -1 = not yet in body-reading mode

            const tryResolveBody = () => {
                if (apiBodyLen < 0) return;
                // Wait until we have enough bytes in buffer
                if (buffer.length >= apiBodyLen) {
                    const reply = buffer.slice(0, apiBodyLen).trim();
                    clearTimeout(timer);
                    socket.destroy();
                    resolve(reply || '+OK');
                }
            };

            socket.setEncoding('utf8');
            socket.on('data', (chunk: string) => {
                buffer += chunk;

                // If we are already reading the API response body, check length.
                if (apiBodyLen >= 0) {
                    tryResolveBody();
                    return;
                }

                // Parse header blocks (separated by \n\n).
                let sepIdx: number;
                while ((sepIdx = buffer.indexOf('\n\n')) !== -1) {
                    const block = buffer.slice(0, sepIdx).trim();
                    buffer = buffer.slice(sepIdx + 2);

                    if (!authenticated) {
                        if (block.includes('Content-Type: auth/request')) {
                            socket.write(`auth ${this.opts.eslPassword}\n\n`);
                        } else if (block.includes('Reply-Text: +OK accepted')) {
                            authenticated = true;
                            if (!commandSent) {
                                commandSent = true;
                                socket.write(`${command}\n\n`);
                                collectingReply = true;
                            }
                        } else if (block.includes('Reply-Text: -ERR')) {
                            clearTimeout(timer);
                            socket.destroy();
                            reject(new Error('FreeSWITCH ESL authentication failed'));
                        }
                    } else if (collectingReply && block.includes('Content-Type: api/response')) {
                        // Extract Content-Length and switch to body-reading mode.
                        const lenMatch = block.match(/Content-Length:\s*(\d+)/u);
                        apiBodyLen = lenMatch ? parseInt(lenMatch[1]!, 10) : 0;
                        // Body bytes may already be in `buffer` (same TCP packet).
                        tryResolveBody();
                        return; // stop processing further blocks; body is raw bytes
                    }
                }
            });

            socket.on('error', (err) => {
                clearTimeout(timer);
                reject(new Error(`ESL socket error: ${err.message}`));
            });

            socket.on('close', () => {
                clearTimeout(timer);
                reject(new Error('ESL connection closed before reply was received'));
            });
        });
    }
}

/** Factory — reads credentials from env vars. Returns null if not configured. */
export function createSipAdapterFromEnv(): SipJoinAdapter | null {
    const eslHost = process.env['FREESWITCH_ESL_HOST'];
    const eslPassword = process.env['FREESWITCH_ESL_PASSWORD'];
    if (!eslHost || !eslPassword) return null;
    return new SipJoinAdapter({
        eslHost,
        eslPort: process.env['FREESWITCH_ESL_PORT'] ? Number(process.env['FREESWITCH_ESL_PORT']) : 8021,
        eslPassword,
        sipProfile: process.env['FREESWITCH_SIP_PROFILE'] ?? 'external',
    });
}
