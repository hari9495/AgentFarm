import { CustomerCRMStore, CRMService } from '@agentfarm/crm-adapters';
import { loadCRMConfigFromEnv } from '@agentfarm/crm-adapters';

/** Singleton store — populated at startup from env vars */
export const customerCRMStore = new CustomerCRMStore();

/** Singleton service — use this in runtime-server task handlers */
export const crmService = new CRMService(customerCRMStore);

export { loadCRMConfigFromEnv };
