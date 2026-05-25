/**
 * telephony-provider-factory.ts
 *
 * Returns the right TelephonyProvider instance based on the telephonyProvider
 * field in SalesAgentConfig. Reads credentials from the same config object.
 *
 * Supported providers:
 *   'twilio'     — TwilioProvider (default)
 *   'signalwire' — SignalWireProvider
 *   'plivo'      — PlivoProvider
 *   'vonage'     — VonageProvider
 */

import type { SalesAgentConfigRecord } from '@agentfarm/shared-types';
import type { TelephonyProvider } from './telephony-provider.js';
import { TwilioProvider } from './twilio-call-provider.js';
import { SignalWireProvider } from './signalwire-call-provider.js';
import { PlivoProvider } from './plivo-call-provider.js';
import { VonageProvider } from './vonage-call-provider.js';

export type TelephonyProviderType = 'twilio' | 'signalwire' | 'plivo' | 'vonage';

export interface TelephonyProviderWithNumber {
    provider: TelephonyProvider;
    /** The from-number to use for outbound calls. */
    fromNumber: string;
}

/**
 * Build a TelephonyProvider from a SalesAgentConfigRecord.
 * Returns null (with a descriptive error) when required credentials are missing.
 */
export function getTelephonyProvider(
    config: SalesAgentConfigRecord,
): { result: TelephonyProviderWithNumber } | { error: string } {
    const type = (config.telephonyProvider ?? 'twilio') as TelephonyProviderType;

    switch (type) {
        case 'twilio': {
            const { twilioAccountSid: accountSid, twilioAuthToken: authToken, twilioFromNumber: fromNumber } = config;
            if (!accountSid || !authToken || !fromNumber) {
                return { error: 'Missing Twilio credentials: twilioAccountSid, twilioAuthToken, twilioFromNumber are required' };
            }
            return {
                result: {
                    provider: new TwilioProvider({ accountSid, authToken }),
                    fromNumber,
                },
            };
        }

        case 'signalwire': {
            const {
                signalwireProjectId: projectId,
                signalwireApiToken: apiToken,
                signalwireSpaceUrl: spaceUrl,
                signalwireFromNumber: fromNumber,
            } = config;
            if (!projectId || !apiToken || !spaceUrl || !fromNumber) {
                return { error: 'Missing SignalWire credentials: signalwireProjectId, signalwireApiToken, signalwireSpaceUrl, signalwireFromNumber are required' };
            }
            return {
                result: {
                    provider: new SignalWireProvider({ projectId, apiToken, spaceUrl }),
                    fromNumber,
                },
            };
        }

        case 'plivo': {
            const {
                plivoAuthId: authId,
                plivoAuthToken: authToken,
                plivoFromNumber: fromNumber,
            } = config;
            if (!authId || !authToken || !fromNumber) {
                return { error: 'Missing Plivo credentials: plivoAuthId, plivoAuthToken, plivoFromNumber are required' };
            }
            return {
                result: {
                    provider: new PlivoProvider({ authId, authToken, fromNumber }),
                    fromNumber,
                },
            };
        }

        case 'vonage': {
            const {
                vonageApiKey: apiKey,
                vonageApiSecret: apiSecret,
                vonageApplicationId: applicationId,
                vonagePrivateKey: privateKey,
                vonageFromNumber: fromNumber,
            } = config;
            if (!apiKey || !apiSecret || !applicationId || !privateKey || !fromNumber) {
                return { error: 'Missing Vonage credentials: vonageApiKey, vonageApiSecret, vonageApplicationId, vonagePrivateKey, vonageFromNumber are required' };
            }
            return {
                result: {
                    provider: new VonageProvider({ apiKey, apiSecret, applicationId, privateKey, fromNumber }),
                    fromNumber,
                },
            };
        }

        default: {
            return { error: `Unsupported telephonyProvider: "${type}". Supported: twilio, signalwire, plivo, vonage` };
        }
    }
}
