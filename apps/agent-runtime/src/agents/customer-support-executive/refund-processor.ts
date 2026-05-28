/**
 * Refund Processor — initiates refunds and order modifications via
 * payment-gateway MCP connectors (Stripe, Braintree, Razorpay, Shopify).
 *
 * High-risk: every refund operation is logged for audit.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type RefundReason =
    | 'duplicate_charge'
    | 'product_not_received'
    | 'product_defective'
    | 'customer_changed_mind'
    | 'unauthorized_transaction'
    | 'subscription_cancellation'
    | 'service_failure'
    | 'other';

export type OrderModificationType =
    | 'plan_upgrade'
    | 'plan_downgrade'
    | 'plan_pause'
    | 'plan_cancel'
    | 'quantity_change'
    | 'address_update'
    | 'payment_method_update';

export interface ProcessRefundParams {
    tenantId: string;
    botId: string;
    transactionId: string;
    amount?: number;
    currency?: string;
    reason: RefundReason;
    reasonNote?: string;
    customerId?: string;
    connector?: string;
}

export interface RefundResult {
    refundId: string;
    transactionId: string;
    amountRefunded: number;
    currency: string;
    status: 'initiated' | 'pending' | 'completed' | 'failed';
    estimatedSettlementDays: number;
    auditLogEntry: string;
}

export interface ModifyOrderParams {
    tenantId: string;
    botId: string;
    orderId?: string;
    subscriptionId?: string;
    modificationType: OrderModificationType;
    newPlanId?: string;
    newQuantity?: number;
    newAddress?: string;
    effectiveDate?: 'immediate' | 'next_cycle';
    connector?: string;
}

export interface OrderModificationResult {
    modificationId: string;
    orderId?: string;
    subscriptionId?: string;
    modificationType: OrderModificationType;
    status: 'applied' | 'scheduled' | 'failed';
    effectiveDate: string;
    auditLogEntry: string;
}

// ---------------------------------------------------------------------------
// Connector resolution
// ---------------------------------------------------------------------------

function resolvePaymentUrl(connector?: string): string {
    const candidates = [
        connector && process.env[`MCP_${connector.toUpperCase()}_URL`],
        process.env['MCP_STRIPE_URL'],
        process.env['MCP_BRAINTREE_URL'],
        process.env['MCP_RAZORPAY_URL'],
        process.env['MCP_SHOPIFY_URL'],
        process.env['MCP_PAYMENT_URL'],
    ];
    for (const c of candidates) {
        if (c && c.trim()) return c.trim();
    }
    throw new Error(
        'No payment connector configured. Set MCP_STRIPE_URL, MCP_BRAINTREE_URL, ' +
        'MCP_RAZORPAY_URL, MCP_SHOPIFY_URL, or MCP_PAYMENT_URL.',
    );
}

function settlementDays(connector?: string): number {
    const lower = (connector ?? '').toLowerCase();
    if (lower.includes('stripe')) return 5;
    if (lower.includes('braintree')) return 3;
    if (lower.includes('razorpay')) return 7;
    if (lower.includes('shopify')) return 5;
    return 7;
}

// ---------------------------------------------------------------------------
// Operations
// ---------------------------------------------------------------------------

export async function processRefund(params: ProcessRefundParams): Promise<RefundResult> {
    const url = resolvePaymentUrl(params.connector);

    const res = await fetch(`${url}/refunds`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            tenantId: params.tenantId,
            botId: params.botId,
            transactionId: params.transactionId,
            amount: params.amount,
            currency: params.currency,
            reason: params.reason,
            reasonNote: params.reasonNote,
            customerId: params.customerId,
        }),
    });

    if (!res.ok) {
        throw new Error(`Payment connector returned HTTP ${res.status}: ${await res.text()}`);
    }

    const data = (await res.json()) as Partial<RefundResult>;
    const days = settlementDays(params.connector);

    return {
        refundId: data.refundId ?? `ref-${Date.now()}`,
        transactionId: params.transactionId,
        amountRefunded: data.amountRefunded ?? params.amount ?? 0,
        currency: data.currency ?? params.currency ?? 'USD',
        status: data.status ?? 'initiated',
        estimatedSettlementDays: days,
        auditLogEntry: `Refund initiated by botId=${params.botId} for txn=${params.transactionId} reason=${params.reason} at ${new Date().toISOString()}`,
    };
}

export async function modifyOrder(params: ModifyOrderParams): Promise<OrderModificationResult> {
    const url = resolvePaymentUrl(params.connector);

    const res = await fetch(`${url}/orders/modify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            tenantId: params.tenantId,
            botId: params.botId,
            orderId: params.orderId,
            subscriptionId: params.subscriptionId,
            modificationType: params.modificationType,
            newPlanId: params.newPlanId,
            newQuantity: params.newQuantity,
            newAddress: params.newAddress,
            effectiveDate: params.effectiveDate ?? 'next_cycle',
        }),
    });

    if (!res.ok) {
        throw new Error(`Payment connector returned HTTP ${res.status}: ${await res.text()}`);
    }

    const data = (await res.json()) as Partial<OrderModificationResult>;

    return {
        modificationId: data.modificationId ?? `mod-${Date.now()}`,
        orderId: params.orderId,
        subscriptionId: params.subscriptionId,
        modificationType: params.modificationType,
        status: data.status ?? 'applied',
        effectiveDate: data.effectiveDate ?? (params.effectiveDate ?? 'next_cycle'),
        auditLogEntry: `Order modified by botId=${params.botId} type=${params.modificationType} at ${new Date().toISOString()}`,
    };
}
