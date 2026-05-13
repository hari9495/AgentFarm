import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { User, AlertCircle, Mail, Calendar, Hash, ExternalLink } from "lucide-react";

const GATEWAY_URL =
    process.env.API_GATEWAY_URL ??
    process.env.NEXT_PUBLIC_API_URL ??
    "http://localhost:3000";

interface AccountRecord {
    id: string;
    email: string;
    displayName: string | null;
    role: string;
    createdAt: string;
    lastLoginAt: string | null;
}

interface TenantRecord {
    id: string;
    name: string;
    status: string;
}

interface ProfileResponse {
    account: AccountRecord;
    tenant: TenantRecord | null;
}

function InfoRow({
    icon: Icon,
    label,
    children,
}: {
    icon: React.ComponentType<{ className?: string }>;
    label: string;
    children: React.ReactNode;
}) {
    return (
        <div className="flex items-start gap-3 py-4 border-b border-slate-100 dark:border-slate-800 last:border-0">
            <div className="h-7 w-7 rounded-lg bg-sky-100 dark:bg-sky-950/50 flex items-center justify-center mt-0.5 shrink-0">
                <Icon className="h-3.5 w-3.5 text-sky-600 dark:text-sky-400" />
            </div>
            <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-0.5">
                    {label}
                </p>
                <div className="text-sm text-slate-900 dark:text-slate-100">{children}</div>
            </div>
        </div>
    );
}

export default async function PortalProfilePage() {
    const cookieStore = await cookies();
    const token = cookieStore.get("portal_session")?.value;

    if (!token) {
        redirect("/portal/login");
    }

    let profile: ProfileResponse | null = null;
    let fetchError = false;

    try {
        const res = await fetch(`${GATEWAY_URL}/portal/data/profile`, {
            headers: { cookie: `portal_session=${token}` },
            cache: "no-store",
        });

        if (res.status === 401) {
            redirect("/portal/login");
        }

        if (res.ok) {
            profile = (await res.json()) as ProfileResponse;
        } else {
            fetchError = true;
        }
    } catch {
        fetchError = true;
    }

    return (
        <div>
            <div className="mb-6">
                <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">Profile</h1>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                    Your account details and tenant information
                </p>
            </div>

            {fetchError && (
                <div className="flex items-center gap-3 rounded-xl border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/30 px-4 py-3 text-sm text-rose-700 dark:text-rose-400 mb-6">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    Failed to load profile. Please refresh the page.
                </div>
            )}

            {!fetchError && !profile && (
                <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 py-16 px-4 text-center">
                    <User className="h-10 w-10 text-slate-300 dark:text-slate-600 mb-3" />
                    <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                        No profile data available
                    </p>
                </div>
            )}

            {profile && (
                <div className="max-w-lg space-y-5">
                    {/* Account card */}
                    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm px-5 py-2">
                        <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide pt-4 pb-2">
                            Account
                        </p>

                        <InfoRow icon={Mail} label="Email">
                            {profile.account.email}
                        </InfoRow>

                        <InfoRow icon={User} label="Display name">
                            {profile.account.displayName ?? (
                                <span className="text-slate-400 dark:text-slate-500 italic">Not set</span>
                            )}
                        </InfoRow>

                        <InfoRow icon={Calendar} label="Member since">
                            {new Date(profile.account.createdAt).toLocaleDateString(undefined, {
                                year: "numeric",
                                month: "long",
                                day: "numeric",
                            })}
                        </InfoRow>
                    </div>

                    {/* Tenant card */}
                    {profile.tenant && (
                        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm px-5 py-2">
                            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide pt-4 pb-2">
                                Tenant
                            </p>

                            <InfoRow icon={Hash} label="Tenant ID">
                                <span className="font-mono text-xs bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 px-2 py-0.5 rounded-md select-all">
                                    {profile.tenant.id}
                                </span>
                            </InfoRow>

                            <InfoRow icon={User} label="Organisation">
                                {profile.tenant.name}
                            </InfoRow>

                            <InfoRow icon={Calendar} label="Account status">
                                <span className="capitalize">{profile.tenant.status}</span>
                            </InfoRow>
                        </div>
                    )}

                    {/* Support link */}
                    <div className="bg-slate-50 dark:bg-slate-900/50 rounded-2xl border border-slate-200 dark:border-slate-800 px-5 py-4 flex items-center justify-between">
                        <div>
                            <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
                                Need help?
                            </p>
                            <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                                Our support team is available to assist you.
                            </p>
                        </div>
                        <a
                            href="mailto:support@agentfarm.ai"
                            className="inline-flex items-center gap-1.5 text-sm font-medium text-sky-600 dark:text-sky-400 hover:text-sky-700 dark:hover:text-sky-300 transition-colors"
                        >
                            Contact support
                            <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                    </div>
                </div>
            )}
        </div>
    );
}
