import type { LeadSourceProvider } from '@agentfarm/shared-types';
import type { ILeadSourceProvider } from './lead-source-provider.js';
import { ApolloProvider } from './apollo-provider.js';
import { HunterProvider } from './hunter-provider.js';

export function getLeadSourceProvider(name: LeadSourceProvider): ILeadSourceProvider {
    switch (name) {
        case 'apollo': {
            const key = process.env.APOLLO_API_KEY;
            if (!key) throw new Error('APOLLO_API_KEY env var is required for apollo provider');
            return new ApolloProvider(key);
        }
        case 'hunter': {
            const key = process.env.HUNTER_API_KEY;
            if (!key) throw new Error('HUNTER_API_KEY env var is required for hunter provider');
            return new HunterProvider(key);
        }
        default:
            throw new Error(`Lead source provider "${name}" is not implemented`);
    }
}
