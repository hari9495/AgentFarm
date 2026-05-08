export { CRMAdapter } from './adapters/base.adapter.js';
export { SalesforceAdapter, createSalesforceAdapter } from './adapters/salesforce.adapter.js';
export { HubspotAdapter, createHubspotAdapter } from './adapters/hubspot.adapter.js';
export { ZohoAdapter, createZohoAdapter } from './adapters/zoho.adapter.js';
export { DynamicsAdapter, createDynamicsAdapter } from './adapters/dynamics.adapter.js';
export { PipedriveAdapter, createPipedriveAdapter } from './adapters/pipedrive.adapter.js';
export { CRMAdapterFactory, CustomerCRMStore, CRMService } from './crm.service.js';
export { loadCRMConfigFromEnv } from './config/crm-config.js';
