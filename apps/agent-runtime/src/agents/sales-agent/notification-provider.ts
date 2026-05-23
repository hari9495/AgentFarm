export interface WinLossNotificationPayload {
    outcome: 'won' | 'lost';
    dealId: string;
    prospectName: string;
    company: string;
    dealValue?: number;
    currency: string;
    daysToClose?: number;
    tenantId: string;
    botId: string;
}

export interface INotificationProvider {
    send(payload: WinLossNotificationPayload): Promise<{ sent: boolean; error?: string }>;
}
