'use client';

import { useState, useEffect } from 'react';

type SubscriptionStatus = 'active' | 'expired' | 'suspended' | 'none' | null;

type SubscriptionData = {
    status: SubscriptionStatus;
    daysUntilSuspension?: number | null;
};

type Props = {
    tenantId: string;
};

export function SubscriptionBanner({ tenantId }: Props) {
    const [data, setData] = useState<SubscriptionData | null>(null);

    useEffect(() => {
        if (!tenantId || tenantId === '__TENANT_ID__') return;

        fetch(`/api/billing/subscription?tenantId=${encodeURIComponent(tenantId)}`, {
            cache: 'no-store',
        })
            .then((res) => res.json() as Promise<SubscriptionData>)
            .then((body) => setData(body))
            .catch(() => null);
    }, [tenantId]);

    if (!data || data.status === 'active' || data.status === 'none' || data.status === null) {
        return null;
    }

    if (data.status === 'expired') {
        return (
            <div
                role="alert"
                style={{
                    background: '#fff3cd',
                    border: '1px solid #ffc107',
                    color: '#856404',
                    padding: '12px 16px',
                    borderRadius: '6px',
                    marginBottom: '12px',
                    font: 'inherit',
                }}
            >
                ⚠ Your subscription has expired. You have{' '}
                {data.daysUntilSuspension ?? 0} day(s) before access is suspended.{' '}
                <a href="/billing" style={{ color: '#856404', fontWeight: 600 }}>
                    Renew now →
                </a>
            </div>
        );
    }

    if (data.status === 'suspended') {
        return (
            <div
                role="alert"
                style={{
                    background: '#f8d7da',
                    border: '1px solid #dc3545',
                    color: '#721c24',
                    padding: '12px 16px',
                    borderRadius: '6px',
                    marginBottom: '12px',
                    font: 'inherit',
                }}
            >
                🔒 Your subscription is suspended. Renew to restore full access.{' '}
                <a href="/billing" style={{ color: '#721c24', fontWeight: 600 }}>
                    →
                </a>
            </div>
        );
    }

    return null;
}
