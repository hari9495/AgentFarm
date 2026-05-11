'use client';

import { useState, useEffect, type ReactNode } from 'react';

type SubscriptionStatus = 'active' | 'expired' | 'suspended' | 'none' | null;

type SubscriptionData = {
    status: SubscriptionStatus;
};

type Props = {
    tenantId: string;
    children: ReactNode;
};

export function SuspensionWall({ tenantId, children }: Props) {
    const [status, setStatus] = useState<SubscriptionStatus>(null);

    useEffect(() => {
        if (!tenantId || tenantId === '__TENANT_ID__') return;

        fetch(`/api/billing/subscription?tenantId=${encodeURIComponent(tenantId)}`, {
            cache: 'no-store',
        })
            .then((res) => res.json() as Promise<SubscriptionData>)
            .then((body) => setStatus(body.status))
            .catch(() => null);
    }, [tenantId]);

    if (status !== 'suspended') {
        return <>{children}</>;
    }

    return (
        <>
            <div
                role="dialog"
                aria-modal="true"
                aria-label="Subscription suspended"
                style={{
                    position: 'fixed',
                    inset: 0,
                    zIndex: 1000,
                    background: 'rgba(0,0,0,0.85)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                }}
            >
                <div
                    style={{
                        background: '#fff',
                        borderRadius: '12px',
                        padding: '40px',
                        maxWidth: '480px',
                        width: '100%',
                        textAlign: 'center',
                        color: '#111',
                    }}
                >
                    <div style={{ fontSize: '48px', marginBottom: '16px' }}>🔒</div>
                    <h2 style={{ margin: '0 0 8px' }}>Subscription Suspended</h2>
                    <p style={{ margin: '0 0 8px', color: '#444' }}>
                        Your subscription has been suspended due to non-payment.
                    </p>
                    <p style={{ margin: '0 0 24px', color: '#444' }}>
                        You can still access your audit reports below.
                    </p>
                    <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
                        <a
                            href="/billing"
                            style={{
                                display: 'inline-block',
                                padding: '10px 20px',
                                background: '#111',
                                color: '#fff',
                                borderRadius: '6px',
                                textDecoration: 'none',
                                fontWeight: 600,
                            }}
                        >
                            Renew Subscription
                        </a>
                        <a
                            href="/audit"
                            style={{
                                display: 'inline-block',
                                padding: '10px 20px',
                                background: 'transparent',
                                color: '#111',
                                border: '1px solid #111',
                                borderRadius: '6px',
                                textDecoration: 'none',
                                fontWeight: 600,
                            }}
                        >
                            View Audit Report
                        </a>
                    </div>
                </div>
            </div>
            {children}
        </>
    );
}
