/**
 * Salesforce lead sync helper.
 *
 * Reads env vars:
 *   SALESFORCE_LEAD_SYNC_ENABLED  - must equal "true" to enable
 *   CRM_VENDOR                    - must equal "salesforce"
 *   CRM_ACCESS_TOKEN              - Salesforce Bearer token
 *   CRM_INSTANCE_URL              - e.g. https://yourorg.salesforce.com
 *
 * The sync is best-effort: any failure is logged but never thrown.
 */

export interface LeadPayload {
    firstName?: string;
    lastName: string;
    email: string;
    company: string;
    phone?: string;
    description?: string;
    leadSource?: string;
}

export function isSalesforceLeadSyncEnabled(): boolean {
    return (
        process.env['SALESFORCE_LEAD_SYNC_ENABLED'] === 'true' &&
        process.env['CRM_VENDOR'] === 'salesforce' &&
        !!process.env['CRM_ACCESS_TOKEN'] &&
        !!process.env['CRM_INSTANCE_URL']
    );
}

export async function syncLeadToSalesforce(lead: LeadPayload): Promise<{ success: boolean; id?: string; error?: string }> {
    const { createSalesforceAdapter, loadCRMConfigFromEnv } = await import('@agentfarm/crm-adapters');

    const config = loadCRMConfigFromEnv();
    if (!config) {
        return { success: false, error: 'CRM config not found in environment' };
    }

    const adapter = createSalesforceAdapter(config);

    try {
        const result = await adapter.createRecord({
            type: 'Lead',
            fields: {
                FirstName: lead.firstName ?? '',
                LastName: lead.lastName,
                Email: lead.email,
                Company: lead.company,
                Phone: lead.phone ?? '',
                Description: lead.description ?? '',
                LeadSource: lead.leadSource ?? 'Web',
            },
        });

        if (!result.success) {
            console.warn('[salesforce-lead-sync] Salesforce createRecord failed:', result.error);
            return { success: false, error: result.error };
        }

        return { success: true, id: result.data?.id };
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.warn('[salesforce-lead-sync] Unexpected error:', message);
        return { success: false, error: message };
    }
}
