'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { CopyLinkButton } from './copy-link-button';
import { buildDashboardHref, type DashboardTab } from './dashboard-navigation';

type DashboardDeepLinkBarProps = {
    activeTab: DashboardTab;
    workspaceId: string;
};

const tabs: DashboardTab[] = ['overview', 'approvals', 'observability', 'audit'];

export function DashboardDeepLinkBar({ activeTab, workspaceId }: DashboardDeepLinkBarProps) {
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const currentHref = buildDashboardHref(pathname, searchParams.toString(), {
        tab: activeTab,
        workspaceId,
    });

    return (
        <div className="card dashboard-deep-links">
            <div className="dashboard-deep-links-row">
                <span className="dashboard-deep-links-title">Deep Links</span>
                <CopyLinkButton href={currentHref} label="Copy Current View" className="chip-button active" />
                {tabs.map((tab) => (
                    <CopyLinkButton
                        key={tab}
                        href={buildDashboardHref(pathname, searchParams.toString(), {
                            tab,
                            workspaceId,
                            params: {
                                approvalId: undefined,
                                correlationId: undefined,
                            },
                        })}
                        label={`Copy ${tab}`}
                        className="chip-button"
                    />
                ))}
            </div>
        </div>
    );
}
