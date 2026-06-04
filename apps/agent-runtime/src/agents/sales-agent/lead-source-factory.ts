import type { LeadSourceProvider } from '@agentfarm/shared-types';
import type { ILeadSourceProvider } from './lead-source-provider.js';
import { ApolloProvider } from './apollo-provider.js';
import { HunterProvider } from './hunter-provider.js';
import { LinkedInProvider } from './linkedin-provider.js';
import { ClearbitProvider } from './clearbit-provider.js';
import { ZoomInfoProvider } from './zoominfo-provider.js';
import { LushaProvider } from './lusha-provider.js';
import { PhantomBusterProvider } from './phantombuster-provider.js';

export function getLeadSourceProvider(name: LeadSourceProvider): ILeadSourceProvider {
    switch (name) {
        case 'apollo': {
            const key = process.env['APOLLO_API_KEY'];
            if (!key) throw new Error('APOLLO_API_KEY env var is required for apollo provider');
            return new ApolloProvider(key);
        }
        case 'hunter': {
            const key = process.env['HUNTER_API_KEY'];
            if (!key) throw new Error('HUNTER_API_KEY env var is required for hunter provider');
            return new HunterProvider(key);
        }
        case 'linkedin': {
            const key = process.env['LINKEDIN_API_KEY'];
            if (!key) throw new Error('LINKEDIN_API_KEY env var is required for linkedin provider');
            return new LinkedInProvider(key);
        }
        case 'clearbit': {
            const key = process.env['CLEARBIT_API_KEY'];
            if (!key) throw new Error('CLEARBIT_API_KEY env var is required for clearbit provider');
            return new ClearbitProvider(key);
        }
        case 'zoominfo': {
            const clientId = process.env['ZOOMINFO_CLIENT_ID'];
            const clientSecret = process.env['ZOOMINFO_CLIENT_SECRET'];
            const staticKey = process.env['ZOOMINFO_API_KEY'];
            if (!clientId || !clientSecret) {
                throw new Error('ZOOMINFO_CLIENT_ID and ZOOMINFO_CLIENT_SECRET env vars are required for zoominfo provider');
            }
            return new ZoomInfoProvider(clientId, clientSecret, staticKey);
        }
        case 'lusha': {
            const key = process.env['LUSHA_API_KEY'];
            if (!key) throw new Error('LUSHA_API_KEY env var is required for lusha provider');
            return new LushaProvider(key);
        }
        case 'phantombuster': {
            const key = process.env['PHANTOMBUSTER_API_KEY'];
            const agentId = process.env['PHANTOMBUSTER_AGENT_ID'];
            if (!key || !agentId) {
                throw new Error('PHANTOMBUSTER_API_KEY and PHANTOMBUSTER_AGENT_ID env vars are required for phantombuster provider');
            }
            return new PhantomBusterProvider(key, agentId);
        }
    }
}
