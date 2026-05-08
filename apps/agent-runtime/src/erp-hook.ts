import { CustomerERPStore, ERPService } from '@agentfarm/erp-adapters';
import { loadERPConfigFromEnv } from '@agentfarm/erp-adapters';

/** Singleton store — populated at startup from env vars */
export const customerERPStore = new CustomerERPStore();

/** Singleton service — use this in runtime-server task handlers */
export const erpService = new ERPService(customerERPStore);

export { loadERPConfigFromEnv };
