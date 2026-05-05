"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
    Activity,
    AlertTriangle,
    Bot,
    CircleDollarSign,
    CheckCircle2,
    ClipboardList,
    Crown,
    DatabaseZap,
    FileWarning,
    LifeBuoy,
    Network,
    RefreshCw,
    Shield,
    ShieldCheck,
    TerminalSquare,
    Users,
    XCircle,
    Download,
    LogIn,
    MonitorOff,
    Plus,
    UserCheck,
    type LucideIcon,
} from "lucide-react";

type UserRole = "superadmin" | "admin" | "member";
type FleetBotStatus = "active" | "paused" | "error" | "maintenance";
type IncidentStatus = "open" | "investigating" | "resolved";
type IntegrationStatus = "healthy" | "warning" | "down";
type LogLevel = "info" | "warn" | "error";

type TenantStatus = "healthy" | "degraded" | "incident";

type TenantRecord = {
    id: string;
    name: string;
    plan: string;
    status: TenantStatus;
    region: string;
    mrrCents: number;
    openInvoices: number;
    lastHeartbeatAt: number;
};

type UserPublic = {
    id: string;
    email: string;
    name: string;
    company: string;
    role: UserRole;
    createdAt: number;
};

type BotStatus = "active" | "paused" | "error" | "maintenance";

type FleetBotRecord = {
    id: string;
    tenantId: string;
    tenantName: string;
    botSlug: string;
    displayName: string;
    status: FleetBotStatus;
    reliabilityPct: number;
    tasksCompleted: number;
    lastActivityAt: number;
};

type IncidentRecord = {
    id: string;
    tenantId: string;
    tenantName: string;
    title: string;
    severity: "low" | "medium" | "high" | "critical";
    status: IncidentStatus;
    source: string;
    createdAt: number;
    resolvedAt: number | null;
    resolutionNote: string;
    assigneeEmail: string;
};

type OperatorSession = {
    sessionId: string;
    userId: string;
    userEmail: string;
    userName: string;
    createdAt: number;
    expiresAt: number;
    lastSeenAt: number;
};

type IntegrationRecord = {
    id: string;
    tenantId: string;
    tenantName: string;
    integration: string;
    status: IntegrationStatus;
    lastCheckAt: number;
    errorMessage: string;
};

type BillingSummary = {
    totalMrrCents: number;
    openInvoices: number;
    tenantsOnEnterprise: number;
    byTenant: Array<{
        tenantId: string;
        tenantName: string;
        plan: string;
        mrrCents: number;
        openInvoices: number;
    }>;
};

type TenantLogRecord = {
    id: string;
    tenantId: string;
    tenantName: string;
    level: LogLevel;
    service: string;
    message: string;
    traceId: string;
    createdAt: number;
};

type OverviewMetrics = {
    tenants: number;
    fleetBots: number;
    openIncidents: number;
    fleetErrors: number;
    integrationsDown: number;
    totalMrrCents: number;
    openInvoices: number;
};

type AuditEventRecord = {
    id: string;
    actorId: string;
    actorEmail: string;
    action: string;
    targetType: string;
    targetId: string;
    tenantId: string;
    beforeState: string;
    afterState: string;
    reason: string;
    createdAt: number;
};

type PendingFleetAction = { fleetId: string; botName: string; newStatus: FleetBotStatus };
type PendingIncidentAction = { incidentId: string; title: string };
type PendingRoleAction = { userId: string; userName: string; newRole: UserRole };

const roleStyles: Record<UserRole, string> = {
    superadmin: "bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-900/40 dark:text-fuchsia-300",
    admin: "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300",
    member: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
};

const statusStyles: Record<BotStatus, string> = {
    active: "text-emerald-600",
    paused: "text-amber-500",
    error: "text-rose-600",
    maintenance: "text-slate-500",
};

const tenantStatusStyles: Record<TenantStatus, string> = {
    healthy: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
    degraded: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
    incident: "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300",
};

const integrationStyles: Record<IntegrationStatus, string> = {
    healthy: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
    warning: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
    down: "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300",
};

const incidentStyles: Record<IncidentStatus, string> = {
    open: "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300",
    investigating: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
    resolved: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
};

const levelStyles: Record<LogLevel, string> = {
    info: "text-sky-600 dark:text-sky-400",
    warn: "text-amber-600 dark:text-amber-400",
    error: "text-rose-600 dark:text-rose-400",
};

const money = (cents: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(
        cents / 100,
    );

const formatAgo = (ts: number) => {
    const diff = Date.now() - ts;
    if (diff < 60000) return "just now";
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return `${Math.floor(diff / 86400000)}d ago`;
};

export default function CompanyPortalPage() {
    const [authorized, setAuthorized] = useState<boolean | null>(null);
    const [sessionEmail, setSessionEmail] = useState<string | null>(null);
    const [users, setUsers] = useState<UserPublic[]>([]);
    const [tenants, setTenants] = useState<TenantRecord[]>([]);
    const [fleet, setFleet] = useState<FleetBotRecord[]>([]);
    const [incidents, setIncidents] = useState<IncidentRecord[]>([]);
    const [integrations, setIntegrations] = useState<IntegrationRecord[]>([]);
    const [billing, setBilling] = useState<BillingSummary | null>(null);
    const [logs, setLogs] = useState<TenantLogRecord[]>([]);
    const [auditEvents, setAuditEvents] = useState<AuditEventRecord[]>([]);
    const [metrics, setMetrics] = useState<OverviewMetrics | null>(null);
    const [logTenantFilter, setLogTenantFilter] = useState<string>("all");
    const [logLevelFilter, setLogLevelFilter] = useState<"all" | LogLevel>("all");
    const [auditActorFilter, setAuditActorFilter] = useState<string>("");
    const [auditTenantFilter, setAuditTenantFilter] = useState<string>("all");
    const [auditActionFilter, setAuditActionFilter] = useState<string>("all");
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [savingUserId, setSavingUserId] = useState<string | null>(null);
    const [savingFleetId, setSavingFleetId] = useState<string | null>(null);
    const [resolvingIncidentId, setResolvingIncidentId] = useState<string | null>(null);
    const [toast, setToast] = useState<{ ok: boolean; message: string } | null>(null);

    // Reason-modal state
    const [pendingFleet, setPendingFleet] = useState<PendingFleetAction | null>(null);
    const [pendingIncident, setPendingIncident] = useState<PendingIncidentAction | null>(null);
    const [pendingRole, setPendingRole] = useState<PendingRoleAction | null>(null);
    const [reasonText, setReasonText] = useState("");

    // Feature B: bulk fleet
    const [selectedBotIds, setSelectedBotIds] = useState<Set<string>>(new Set());
    const [pendingBulkFleet, setPendingBulkFleet] = useState<{ ids: string[]; status: FleetBotStatus } | null>(null);
    const [bulkSaving, setBulkSaving] = useState(false);

    // Feature C: incident escalation
    const [pendingAssign, setPendingAssign] = useState<{ incidentId: string; title: string; tenantId: string } | null>(null);
    const [assigneeInput, setAssigneeInput] = useState("");
    const [assignSeverity, setAssignSeverity] = useState<"low" | "medium" | "high" | "critical" | "">("");
    const [assignReason, setAssignReason] = useState("");
    const [savingAssign, setSavingAssign] = useState(false);

    // Feature D: audit auto-poll badge
    const [newAuditCount, setNewAuditCount] = useState(0);

    // Feature E: operator sessions
    const [operatorSessions, setOperatorSessions] = useState<OperatorSession[]>([]);
    const [revokingSessionId, setRevokingSessionId] = useState<string | null>(null);

    // Feature G: tenant provisioning modal
    const [showProvisionModal, setShowProvisionModal] = useState(false);
    const [provisionName, setProvisionName] = useState("");
    const [provisionPlan, setProvisionPlan] = useState<"starter" | "growth" | "enterprise">("starter");
    const [provisionRegion, setProvisionRegion] = useState("eastus");
    const [provisioning, setProvisioning] = useState(false);

    const showToast = (ok: boolean, message: string) => {
        setToast({ ok, message });
        setTimeout(() => setToast(null), 3200);
    };

    const readJson = useCallback(async <T,>(res: Response): Promise<T | null> => {
        const contentType = res.headers.get("content-type") ?? "";
        if (!contentType.toLowerCase().includes("application/json")) {
            return null;
        }
        return (await res.json().catch(() => null)) as T | null;
    }, []);

    const checkAccess = useCallback(async () => {
        const res = await fetch("/api/auth/session", { cache: "no-store" });
        const data = await res.json().catch(() => null);
        if (!res.ok || !data?.user) {
            // Not signed in — will prompt to log in
            setSessionEmail(null);
            setAuthorized(false);
            return;
        }
        setSessionEmail(data.user.email ?? null);
        setAuthorized(Boolean(data?.isCompanyOperator));
    }, []);

    const loadLogs = useCallback(async () => {
        try {
            const params = new URLSearchParams();
            if (logTenantFilter !== "all") params.set("tenantId", logTenantFilter);
            if (logLevelFilter !== "all") params.set("level", logLevelFilter);
            const res = await fetch(`/api/superadmin/logs?${params.toString()}`, { cache: "no-store" });
            const data = await readJson<{ logs?: TenantLogRecord[]; error?: string }>(res);
            if (res.status === 401 || res.status === 403) {
                setAuthorized(false);
                return;
            }
            if (res.ok) setLogs(data?.logs ?? []);
        } catch {
            setLogs([]);
        }
    }, [logTenantFilter, logLevelFilter, readJson]);

    const loadAuditEvents = useCallback(async () => {
        try {
            const params = new URLSearchParams();
            if (auditActorFilter.trim()) params.set("actorEmail", auditActorFilter.trim());
            if (auditTenantFilter !== "all") params.set("tenantId", auditTenantFilter);
            if (auditActionFilter !== "all") params.set("action", auditActionFilter);
            const res = await fetch(`/api/superadmin/audit?${params.toString()}`, { cache: "no-store" });
            const data = await readJson<{ events?: AuditEventRecord[]; error?: string }>(res);
            if (res.status === 401 || res.status === 403) {
                setAuthorized(false);
                return;
            }
            if (res.ok) {
                const incoming: AuditEventRecord[] = data?.events ?? [];
                setAuditEvents((prev) => {
                    if (prev.length > 0 && incoming.length > prev.length) {
                        setNewAuditCount((c) => c + (incoming.length - prev.length));
                    }
                    return incoming;
                });
            }
        } catch {
            // Ignore poll errors; next refresh will retry.
        }
    }, [auditActorFilter, auditTenantFilter, auditActionFilter, readJson]);

    const loadSessions = useCallback(async () => {
        try {
            const res = await fetch("/api/superadmin/sessions", { cache: "no-store" });
            const data = await readJson<{ sessions?: OperatorSession[]; error?: string }>(res);
            if (res.status === 401 || res.status === 403) {
                setAuthorized(false);
                return;
            }
            if (res.ok) setOperatorSessions(data?.sessions ?? []);
        } catch {
            setOperatorSessions([]);
        }
    }, [readJson]);

    const loadData = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const [usersRes, overviewRes, fleetRes, incidentsRes, integrationsRes, billingRes] = await Promise.all([
                fetch("/api/admin/users", { cache: "no-store" }),
                fetch("/api/superadmin/overview", { cache: "no-store" }),
                fetch("/api/superadmin/fleet", { cache: "no-store" }),
                fetch("/api/superadmin/incidents", { cache: "no-store" }),
                fetch("/api/superadmin/integrations", { cache: "no-store" }),
                fetch("/api/superadmin/billing", { cache: "no-store" }),
            ]);

            const usersData = await readJson<{ users?: UserPublic[]; error?: string }>(usersRes);
            const overviewData = await readJson<{ metrics?: OverviewMetrics; tenants?: TenantRecord[]; error?: string }>(overviewRes);
            const fleetData = await readJson<{ fleet?: FleetBotRecord[]; error?: string }>(fleetRes);
            const incidentsData = await readJson<{ incidents?: IncidentRecord[]; error?: string }>(incidentsRes);
            const integrationsData = await readJson<{ integrations?: IntegrationRecord[]; error?: string }>(integrationsRes);
            const billingData = await readJson<{ billing?: BillingSummary; error?: string }>(billingRes);

            if (
                overviewRes.status === 401 || overviewRes.status === 403 ||
                fleetRes.status === 401 || fleetRes.status === 403 ||
                incidentsRes.status === 401 || incidentsRes.status === 403 ||
                integrationsRes.status === 401 || integrationsRes.status === 403 ||
                billingRes.status === 401 || billingRes.status === 403
            ) {
                setAuthorized(false);
                setSessionEmail(null);
                throw new Error("Your session expired. Please sign in again.");
            }

            if (usersRes.ok) {
                setUsers(usersData?.users ?? []);
            } else {
                setUsers([]);
            }
            if (!overviewRes.ok) throw new Error(overviewData?.error ?? "Failed to load overview");
            if (!fleetRes.ok) throw new Error(fleetData?.error ?? "Failed to load fleet");
            if (!incidentsRes.ok) throw new Error(incidentsData?.error ?? "Failed to load incidents");
            if (!integrationsRes.ok) throw new Error(integrationsData?.error ?? "Failed to load integrations");
            if (!billingRes.ok) throw new Error(billingData?.error ?? "Failed to load billing");

            setMetrics(overviewData?.metrics ?? null);
            setTenants(overviewData?.tenants ?? []);
            setFleet(fleetData?.fleet ?? []);
            setIncidents(incidentsData?.incidents ?? []);
            setIntegrations(integrationsData?.integrations ?? []);
            setBilling(billingData?.billing ?? null);
            await loadLogs();
            await loadAuditEvents();
            await loadSessions();
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to load overview");
        } finally {
            setLoading(false);
        }
    }, [loadAuditEvents, loadLogs, loadSessions, readJson]);

    useEffect(() => {
        checkAccess();
    }, [checkAccess]);

    useEffect(() => {
        if (authorized) {
            loadData();
        }
    }, [authorized, loadData]);

    useEffect(() => {
        if (authorized) {
            loadLogs();
        }
    }, [authorized, loadLogs]);

    useEffect(() => {
        if (authorized) {
            loadAuditEvents();
        }
    }, [authorized, loadAuditEvents]);

    // Feature D: auto-poll audit trail every 30 seconds
    useEffect(() => {
        if (!authorized) return;
        const interval = setInterval(() => {
            loadAuditEvents();
        }, 30_000);
        return () => clearInterval(interval);
    }, [authorized, loadAuditEvents]);

    const changeRole = async (userId: string, role: UserRole, reason: string) => {
        setSavingUserId(userId);
        try {
            const res = await fetch(`/api/admin/users/${userId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ role, reason }),
            });
            const data = await res.json();
            if (!res.ok) {
                showToast(false, data.error ?? "Failed to update role");
                return;
            }
            setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, role } : u)));
            await loadAuditEvents();
            showToast(true, "Role updated successfully.");
        } catch {
            showToast(false, "Network error while updating role.");
        } finally {
            setSavingUserId(null);
        }
    };

    const roleMetrics = useMemo(() => {
        return {
            superAdmins: users.filter((u) => u.role === "superadmin").length,
            admins: users.filter((u) => u.role === "admin").length,
            members: users.filter((u) => u.role === "member").length,
        };
    }, [users]);

    const changeFleetStatus = async (fleetId: string, status: FleetBotStatus, reason: string) => {
        setSavingFleetId(fleetId);
        try {
            const res = await fetch(`/api/superadmin/fleet/${fleetId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ status, reason }),
            });
            const data = await res.json();
            if (!res.ok) {
                showToast(false, data.error ?? "Failed to update bot status");
                return;
            }
            setFleet((prev) =>
                prev.map((item) => (item.id === fleetId ? { ...item, status, lastActivityAt: Date.now() } : item)),
            );
            await loadAuditEvents();
            showToast(true, "Bot status updated from company portal.");
        } catch {
            showToast(false, "Network error while updating fleet bot.");
        } finally {
            setSavingFleetId(null);
        }
    };

    const resolveIncident = async (incidentId: string, reason: string) => {
        setResolvingIncidentId(incidentId);
        try {
            const res = await fetch(`/api/superadmin/incidents/${incidentId}/resolve`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ reason }),
            });
            const data = await res.json();
            if (!res.ok) {
                showToast(false, data.error ?? "Failed to resolve incident");
                return;
            }
            setIncidents((prev) =>
                prev.map((incident) =>
                    incident.id === incidentId
                        ? {
                            ...incident,
                            status: "resolved",
                            resolvedAt: Date.now(),
                            resolutionNote: reason,
                        }
                        : incident,
                ),
            );
            await loadAuditEvents();
            showToast(true, "Incident resolved successfully.");
        } catch {
            showToast(false, "Network error while resolving incident.");
        } finally {
            setResolvingIncidentId(null);
        }
    };

    const SENSITIVE_FLEET_STATUSES: FleetBotStatus[] = ["paused", "maintenance"];

    const handleFleetStatusChange = (bot: FleetBotRecord, newStatus: FleetBotStatus) => {
        if (SENSITIVE_FLEET_STATUSES.includes(newStatus)) {
            setReasonText("");
            setPendingFleet({ fleetId: bot.id, botName: bot.displayName, newStatus });
        } else {
            changeFleetStatus(bot.id, newStatus, "");
        }
    };

    const handleResolveIncident = (incident: IncidentRecord) => {
        setReasonText("");
        setPendingIncident({ incidentId: incident.id, title: incident.title });
    };

    const handleRoleChange = (user: UserPublic, newRole: UserRole) => {
        setReasonText("");
        setPendingRole({ userId: user.id, userName: user.name, newRole });
    };

    const confirmFleetAction = async () => {
        if (!pendingFleet) return;
        await changeFleetStatus(pendingFleet.fleetId, pendingFleet.newStatus, reasonText);
        setPendingFleet(null);
        setReasonText("");
    };

    const confirmIncidentAction = async () => {
        if (!pendingIncident) return;
        await resolveIncident(pendingIncident.incidentId, reasonText);
        setPendingIncident(null);
        setReasonText("");
    };

    const confirmRoleAction = async () => {
        if (!pendingRole) return;
        await changeRole(pendingRole.userId, pendingRole.newRole, reasonText);
        setPendingRole(null);
        setReasonText("");
    };

    const dismissModal = () => {
        setPendingFleet(null);
        setPendingIncident(null);
        setPendingRole(null);
        setPendingBulkFleet(null);
        setPendingAssign(null);
        setReasonText("");
        setAssigneeInput("");
        setAssignSeverity("");
        setAssignReason("");
    };

    // Feature B: bulk fleet action
    const toggleBotSelect = (botId: string) => {
        setSelectedBotIds((prev) => {
            const next = new Set(prev);
            if (next.has(botId)) next.delete(botId);
            else next.add(botId);
            return next;
        });
    };

    const toggleSelectAll = () => {
        if (selectedBotIds.size === fleet.length) {
            setSelectedBotIds(new Set());
        } else {
            setSelectedBotIds(new Set(fleet.map((b) => b.id)));
        }
    };

    const confirmBulkFleet = async (ids: string[], status: FleetBotStatus, reason: string) => {
        setBulkSaving(true);
        try {
            const res = await fetch("/api/superadmin/fleet/bulk", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ ids, status, reason }),
            });
            const data = await res.json();
            if (!res.ok) {
                showToast(false, data.error ?? "Bulk action failed");
                return;
            }
            setFleet((prev) => prev.map((b) => (ids.includes(b.id) ? { ...b, status, lastActivityAt: Date.now() } : b)));
            setSelectedBotIds(new Set());
            await loadAuditEvents();
            showToast(true, `${data.updated} bot(s) set to ${status}.`);
        } catch {
            showToast(false, "Network error during bulk action.");
        } finally {
            setBulkSaving(false);
        }
    };

    const handleBulkFleetAction = (status: FleetBotStatus) => {
        if (selectedBotIds.size === 0) return;
        const sensitiveStatuses: FleetBotStatus[] = ["paused", "maintenance"];
        if (sensitiveStatuses.includes(status)) {
            setReasonText("");
            setPendingBulkFleet({ ids: Array.from(selectedBotIds), status });
            return;
        }
        void confirmBulkFleet(Array.from(selectedBotIds), status, "");
    };

    const confirmBulkFleetModal = async () => {
        if (!pendingBulkFleet) return;
        await confirmBulkFleet(pendingBulkFleet.ids, pendingBulkFleet.status, reasonText);
        setPendingBulkFleet(null);
        setReasonText("");
    };

    // Feature C: incident assign/escalate
    const handleAssignIncident = (incident: IncidentRecord) => {
        setAssigneeInput(incident.assigneeEmail ?? "");
        setAssignSeverity(incident.severity);
        setAssignReason("");
        setPendingAssign({ incidentId: incident.id, title: incident.title, tenantId: incident.tenantId });
    };

    const confirmAssignIncident = async () => {
        if (!pendingAssign || !assignReason.trim()) return;
        setSavingAssign(true);
        try {
            const body: Record<string, string> = { reason: assignReason.trim() };
            if (assigneeInput.trim()) body.assigneeEmail = assigneeInput.trim().toLowerCase();
            if (assignSeverity) body.severity = assignSeverity;

            const res = await fetch(`/api/superadmin/incidents/${pendingAssign.incidentId}/assign`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });
            const data = await res.json();
            if (!res.ok) {
                showToast(false, data.error ?? "Escalation failed");
                return;
            }

            setIncidents((prev) =>
                prev.map((inc) =>
                    inc.id === pendingAssign.incidentId
                        ? {
                            ...inc,
                            assigneeEmail: assigneeInput.trim().toLowerCase(),
                            severity: (assignSeverity || inc.severity) as IncidentRecord["severity"],
                        }
                        : inc,
                ),
            );
            await loadAuditEvents();
            showToast(true, "Incident updated.");
        } catch {
            showToast(false, "Network error during escalation.");
        } finally {
            setSavingAssign(false);
            setPendingAssign(null);
            setAssigneeInput("");
            setAssignSeverity("");
            setAssignReason("");
        }
    };

    // Feature E: revoke session
    const revokeSession = async (sessionId: string) => {
        setRevokingSessionId(sessionId);
        try {
            const res = await fetch(`/api/superadmin/sessions/${sessionId}`, { method: "DELETE" });
            if (!res.ok) {
                showToast(false, "Failed to revoke session");
                return;
            }
            setOperatorSessions((prev) => prev.filter((s) => s.sessionId !== sessionId));
            await loadAuditEvents();
            showToast(true, "Session revoked.");
        } catch {
            showToast(false, "Network error revoking session.");
        } finally {
            setRevokingSessionId(null);
        }
    };

    // Feature G: provision tenant
    const provisionTenant = async () => {
        if (!provisionName.trim()) return;
        setProvisioning(true);
        try {
            const res = await fetch("/api/superadmin/tenants", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: provisionName.trim(), plan: provisionPlan, region: provisionRegion }),
            });
            const data = await res.json();
            if (!res.ok) {
                showToast(false, data.error ?? "Provisioning failed");
                return;
            }
            setShowProvisionModal(false);
            setProvisionName("");
            setProvisionPlan("starter");
            setProvisionRegion("eastus");
            await loadAuditEvents();
            showToast(true, `Tenant "${data.tenant.name}" provisioned.`);
            void loadData();
        } catch {
            showToast(false, "Network error during provisioning.");
        } finally {
            setProvisioning(false);
        }
    };

    // Feature F: health score computation
    const computeHealthScore = (tenant: TenantRecord): { score: number; color: string } => {
        const tenantIncidents = incidents.filter((i) => i.tenantId === tenant.id && i.status !== "resolved");
        const tenantFleet = fleet.filter((b) => b.tenantId === tenant.id);
        const tenantIntegrations = integrations.filter((ig) => ig.tenantId === tenant.id);
        let score = 100;

        score -= Math.min(40, tenantIncidents.length * 10);
        const errorBots = tenantFleet.filter((b) => b.status === "error").length;
        const errorRate = tenantFleet.length > 0 ? errorBots / tenantFleet.length : 0;
        score -= Math.round(errorRate * 30);

        const downIntegrations = tenantIntegrations.filter((ig) => ig.status === "down").length;
        score -= Math.min(20, downIntegrations * 10);
        if (tenant.openInvoices > 0) score -= 10;

        score = Math.max(0, Math.min(100, score));
        const color =
            score >= 80
                ? "text-emerald-600 dark:text-emerald-400"
                : score >= 60
                    ? "text-amber-500 dark:text-amber-400"
                    : "text-rose-600 dark:text-rose-400";
        return { score, color };
    };

    // Feature H: export audit trail to CSV
    const exportAuditCsv = () => {
        if (auditEvents.length === 0) {
            showToast(false, "No audit events to export.");
            return;
        }
        const headers = ["id", "actorEmail", "action", "targetId", "tenantId", "beforeState", "afterState", "reason", "createdAt"];
        const rows = auditEvents.map((evt) =>
            headers
                .map((h) => {
                    const val = String((evt as Record<string, unknown>)[h] ?? "");
                    return `"${val.replace(/"/g, '""')}"`;
                })
                .join(","),
        );
        const csv = [headers.join(","), ...rows].join("\n");
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `audit-trail-${new Date().toISOString().slice(0, 10)}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    if (authorized === false) {
        // Not signed in → redirect to login with return URL
        if (sessionEmail === null) {
            return (
                <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-6">
                    <div className="max-w-md rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 text-center">
                        <Shield className="w-9 h-9 text-violet-500 mx-auto" />
                        <h1 className="mt-3 text-xl font-bold text-slate-900 dark:text-slate-100">Sign in to continue</h1>
                        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                            The Company Portal requires a company operator account.
                        </p>
                        <Link
                            href="/login?next=/company"
                            className="mt-5 inline-flex items-center gap-2 rounded-lg bg-violet-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-violet-700"
                        >
                            Sign in
                        </Link>
                    </div>
                </div>
            );
        }

        // Signed in but email not on the company operator allow-list
        return (
            <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-6">
                <div className="max-w-lg rounded-2xl border border-rose-200 dark:border-rose-900/40 bg-white dark:bg-slate-900 p-8 text-center">
                    <XCircle className="w-9 h-9 text-rose-500 mx-auto" />
                    <h1 className="mt-3 text-xl font-bold text-slate-900 dark:text-slate-100">Access not granted</h1>
                    <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                        <span className="font-semibold text-slate-700 dark:text-slate-200">{sessionEmail}</span> is not
                        on the company operator allow-list.
                    </p>
                    <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
                        Ask your administrator to add your email or domain to{" "}
                        <code className="rounded bg-slate-100 dark:bg-slate-800 px-1 py-0.5">AGENTFARM_COMPANY_EMAILS</code>{" "}
                        or{" "}
                        <code className="rounded bg-slate-100 dark:bg-slate-800 px-1 py-0.5">AGENTFARM_COMPANY_DOMAINS</code>.
                    </p>
                    <div className="mt-5 flex items-center justify-center gap-3">
                        <Link
                            href="/admin"
                            className="inline-flex items-center rounded-lg border border-slate-200 dark:border-slate-700 px-4 py-2 text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
                        >
                            Admin Console
                        </Link>
                        <Link
                            href="/api/auth/logout"
                            className="inline-flex items-center rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700"
                        >
                            Sign out
                        </Link>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
            {toast && (
                <div className={`fixed top-4 right-4 z-50 rounded-xl px-4 py-2 text-sm font-semibold ${toast.ok ? "bg-emerald-600 text-white" : "bg-rose-600 text-white"}`}>
                    {toast.message}
                </div>
            )}

            {/* ── Reason modals ── */}
            {/* Feature B: Bulk fleet reason modal */}
            {pendingBulkFleet && (
                <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 backdrop-blur-sm px-4">
                    <div className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-2xl p-6 space-y-4">
                        <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                            Bulk set {pendingBulkFleet.ids.length} bot(s) to {pendingBulkFleet.status}
                        </h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400">This action requires a reason for the audit trail.</p>
                        <textarea rows={3} placeholder="Enter reason…" value={reasonText} onChange={(e) => setReasonText(e.target.value)}
                            className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100 px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-violet-500" />
                        <div className="flex gap-2 justify-end">
                            <button onClick={() => { setPendingBulkFleet(null); setReasonText(""); }}
                                className="rounded-lg border border-slate-200 dark:border-slate-700 px-3.5 py-2 text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800">Cancel</button>
                            <button onClick={confirmBulkFleetModal} disabled={!reasonText.trim() || bulkSaving}
                                className="rounded-lg bg-violet-600 text-white px-3.5 py-2 text-sm font-semibold hover:bg-violet-700 disabled:opacity-50">
                                {bulkSaving ? "Saving…" : "Confirm"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Feature C: Incident assign/escalate modal */}
            {pendingAssign && (
                <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 backdrop-blur-sm px-4">
                    <div className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-2xl p-6 space-y-4">
                        <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">Escalate: {pendingAssign.title}</h3>
                        <div className="space-y-2">
                            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">Assign to (email)</label>
                            <input type="email" value={assigneeInput} onChange={(e) => setAssigneeInput(e.target.value)} placeholder="operator@company.com"
                                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-violet-500" />
                        </div>
                        <div className="space-y-2">
                            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">Set Severity</label>
                            <select value={assignSeverity} onChange={(e) => setAssignSeverity(e.target.value as typeof assignSeverity)}
                                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-700 dark:text-slate-200 px-3 py-2">
                                <option value="">— no change —</option>
                                <option value="low">low</option>
                                <option value="medium">medium</option>
                                <option value="high">high</option>
                                <option value="critical">critical</option>
                            </select>
                        </div>
                        <div className="space-y-2">
                            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">Reason (required)</label>
                            <textarea rows={2} placeholder="Enter reason…" value={assignReason} onChange={(e) => setAssignReason(e.target.value)}
                                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100 px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-violet-500" />
                        </div>
                        <div className="flex gap-2 justify-end">
                            <button onClick={() => { setPendingAssign(null); setAssigneeInput(""); setAssignSeverity(""); setAssignReason(""); }}
                                className="rounded-lg border border-slate-200 dark:border-slate-700 px-3.5 py-2 text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800">Cancel</button>
                            <button onClick={confirmAssignIncident} disabled={(!assigneeInput.trim() && !assignSeverity) || !assignReason.trim() || savingAssign}
                                className="rounded-lg bg-violet-600 text-white px-3.5 py-2 text-sm font-semibold hover:bg-violet-700 disabled:opacity-50">
                                {savingAssign ? "Saving…" : "Save"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Feature G: Provision tenant modal */}
            {showProvisionModal && (
                <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 backdrop-blur-sm px-4">
                    <div className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-2xl p-6 space-y-4">
                        <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">Provision New Tenant</h3>
                        <div className="space-y-2">
                            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">Tenant Name</label>
                            <input type="text" value={provisionName} onChange={(e) => setProvisionName(e.target.value)} placeholder="Acme Corp"
                                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-violet-500" />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-2">
                                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">Plan</label>
                                <select value={provisionPlan} onChange={(e) => setProvisionPlan(e.target.value as typeof provisionPlan)}
                                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-700 dark:text-slate-200 px-3 py-2">
                                    <option value="starter">Starter</option>
                                    <option value="growth">Growth</option>
                                    <option value="enterprise">Enterprise</option>
                                </select>
                            </div>
                            <div className="space-y-2">
                                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">Region</label>
                                <input type="text" value={provisionRegion} onChange={(e) => setProvisionRegion(e.target.value)} placeholder="us-east-1"
                                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-violet-500" />
                            </div>
                        </div>
                        <div className="flex gap-2 justify-end">
                            <button onClick={() => { setShowProvisionModal(false); setProvisionName(""); setProvisionPlan("starter"); setProvisionRegion(""); }}
                                className="rounded-lg border border-slate-200 dark:border-slate-700 px-3.5 py-2 text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800">Cancel</button>
                            <button onClick={provisionTenant} disabled={!provisionName.trim() || provisioning}
                                className="rounded-lg bg-violet-600 text-white px-3.5 py-2 text-sm font-semibold hover:bg-violet-700 disabled:opacity-50">
                                {provisioning ? "Provisioning…" : "Provision"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Reason modal (fleet / incident / role) ── */}
            {(pendingFleet || pendingIncident || pendingRole) && (
                <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 backdrop-blur-sm px-4">
                    <div className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-2xl p-6 space-y-4">
                        <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                            {pendingFleet
                                ? `Set ${pendingFleet.botName} to ${pendingFleet.newStatus}`
                                : pendingIncident
                                    ? `Resolve incident: ${pendingIncident.title}`
                                    : `Update ${pendingRole?.userName} role to ${pendingRole?.newRole}`}
                        </h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400">Reason required for audit trail.</p>
                        <textarea rows={3} placeholder="Enter reason…" value={reasonText} onChange={(e) => setReasonText(e.target.value)}
                            className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100 px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-violet-500" />
                        <div className="flex gap-2 justify-end">
                            <button onClick={dismissModal}
                                className="rounded-lg border border-slate-200 dark:border-slate-700 px-3.5 py-2 text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800">
                                Cancel
                            </button>
                            <button
                                onClick={pendingFleet ? confirmFleetAction : pendingIncident ? confirmIncidentAction : confirmRoleAction}
                                disabled={!reasonText.trim()}
                                className="rounded-lg bg-violet-600 text-white px-3.5 py-2 text-sm font-semibold hover:bg-violet-700 disabled:opacity-50"
                            >
                                Confirm
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <section className="border-b border-slate-200 dark:border-slate-800 bg-gradient-to-br from-fuchsia-700 via-violet-700 to-slate-900">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
                    <div className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-fuchsia-200 mb-4">
                        <Crown className="w-3.5 h-3.5" />
                        AgentFarm Company Portal
                    </div>
                    <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight leading-tight">
                        Control every customer tenant from one place
                    </h1>
                    <p className="mt-2 text-fuchsia-100 max-w-3xl">
                        Fleet operations, incident response, billing oversight, integration health, logs, and role governance.
                    </p>
                    <div className="mt-5 flex flex-wrap gap-3">
                        <button
                            onClick={loadData}
                            disabled={loading}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-white/15 border border-white/20 px-3.5 py-2 text-sm font-semibold text-white hover:bg-white/20 disabled:opacity-60"
                        >
                            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
                            Refresh Snapshot
                        </button>
                        <Link
                            href="/admin"
                            className="inline-flex items-center gap-1.5 rounded-lg bg-white/10 border border-white/20 px-3.5 py-2 text-sm font-semibold text-white hover:bg-white/20"
                        >
                            Back to Admin
                        </Link>
                    </div>
                </div>
            </section>

            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4">
                    <MetricCard label="Tenants" value={String(metrics?.tenants ?? 0)} icon={Network} tone="slate" />
                    <MetricCard label="Fleet Bots" value={String(metrics?.fleetBots ?? 0)} icon={Bot} tone="violet" />
                    <MetricCard label="Open Incidents" value={String(metrics?.openIncidents ?? 0)} icon={FileWarning} tone="rose" />
                    <MetricCard label="Integrations Down" value={String(metrics?.integrationsDown ?? 0)} icon={DatabaseZap} tone="rose" />
                    <MetricCard label="Open Invoices" value={String(metrics?.openInvoices ?? 0)} icon={CircleDollarSign} tone="amber" />
                    <MetricCard label="Monthly MRR" value={money(metrics?.totalMrrCents ?? 0)} icon={CheckCircle2} tone="emerald" />
                </div>

                {error && (
                    <div className="rounded-xl border border-rose-200 dark:border-rose-900/40 bg-rose-50 dark:bg-rose-950/20 px-4 py-3 text-sm text-rose-700 dark:text-rose-300">
                        {error}
                    </div>
                )}

                <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
                    <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">Tenant Registry</h2>
                            <span className="text-xs text-slate-500 dark:text-slate-400">Live tenant heartbeat and plan visibility</span>
                        </div>
                        <button onClick={() => setShowProvisionModal(true)}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 text-white px-3 py-1.5 text-xs font-semibold hover:bg-violet-700">
                            <Plus className="w-3.5 h-3.5" />
                            Provision Tenant
                        </button>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[840px] text-sm">
                            <thead>
                                <tr className="bg-slate-50 dark:bg-slate-800/50 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                                    <th className="text-left px-5 py-3">Tenant</th>
                                    <th className="text-left px-4 py-3">Plan</th>
                                    <th className="text-left px-4 py-3">Status</th>
                                    <th className="text-left px-4 py-3">Region</th>
                                    <th className="text-left px-4 py-3">MRR</th>
                                    <th className="text-left px-4 py-3">Open Invoices</th>
                                    <th className="text-left px-4 py-3">Heartbeat</th>
                                    <th className="text-left px-4 py-3">Health</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
                                {tenants.map((tenant) => (
                                    <tr key={tenant.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                                        <td className="px-5 py-3.5 font-semibold text-slate-900 dark:text-slate-100">
                                            <Link href={`/company/tenants/${tenant.id}`} className="hover:text-violet-600 dark:hover:text-violet-400 underline-offset-2 hover:underline">{tenant.name}</Link>
                                        </td>
                                        <td className="px-4 py-3.5 text-xs text-slate-600 dark:text-slate-300 capitalize">{tenant.plan}</td>
                                        <td className="px-4 py-3.5">
                                            <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${tenantStatusStyles[tenant.status]}`}>
                                                {tenant.status}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3.5 text-xs text-slate-500 dark:text-slate-400">{tenant.region}</td>
                                        <td className="px-4 py-3.5 text-xs font-semibold text-slate-700 dark:text-slate-200">{money(tenant.mrrCents)}</td>
                                        <td className="px-4 py-3.5 text-xs text-slate-500 dark:text-slate-400">{tenant.openInvoices}</td>
                                        <td className="px-4 py-3.5 text-xs text-slate-500 dark:text-slate-400">{formatAgo(tenant.lastHeartbeatAt)}</td>
                                        <td className="px-4 py-3.5">
                                            {(() => {
                                                const hs = computeHealthScore(tenant); return (
                                                    <span className={`font-bold text-sm ${hs.color}`}>{hs.score}</span>
                                                );
                                            })()}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>

                <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                    <div className="xl:col-span-2 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
                        <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">Fleet Operations</h2>
                            <span className="text-xs text-slate-500 dark:text-slate-400">Pause, resume, or move bots to maintenance</span>
                        </div>
                        {selectedBotIds.size > 0 && (
                            <div className="px-5 py-2.5 border-b border-slate-100 dark:border-slate-800 bg-violet-50 dark:bg-violet-950/20 flex items-center gap-2 flex-wrap">
                                <span className="text-xs font-semibold text-violet-700 dark:text-violet-300">{selectedBotIds.size} bot(s) selected</span>
                                <button onClick={() => handleBulkFleetAction("active")} disabled={bulkSaving}
                                    className="rounded px-2.5 py-1 text-xs font-semibold bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 disabled:opacity-60">Active</button>
                                <button onClick={() => handleBulkFleetAction("paused")} disabled={bulkSaving}
                                    className="rounded px-2.5 py-1 text-xs font-semibold bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 disabled:opacity-60">Pause</button>
                                <button onClick={() => handleBulkFleetAction("maintenance")} disabled={bulkSaving}
                                    className="rounded px-2.5 py-1 text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 disabled:opacity-60">Maintenance</button>
                                <button onClick={() => setSelectedBotIds(new Set())}
                                    className="ml-auto text-xs text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200">Clear</button>
                            </div>
                        )}
                        <div className="overflow-x-auto">
                            <table className="w-full min-w-[960px] text-sm">
                                <thead>
                                    <tr className="bg-slate-50 dark:bg-slate-800/50 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                                        <th className="px-4 py-3 w-8">
                                            <input type="checkbox" checked={selectedBotIds.size === fleet.length && fleet.length > 0}
                                                onChange={toggleSelectAll} className="rounded" />
                                        </th>
                                        <th className="text-left px-5 py-3">Tenant</th>
                                        <th className="text-left px-4 py-3">Bot</th>
                                        <th className="text-left px-4 py-3">Status</th>
                                        <th className="text-left px-4 py-3">Reliability</th>
                                        <th className="text-left px-4 py-3">Tasks</th>
                                        <th className="text-left px-4 py-3">Last Activity</th>
                                        <th className="text-left px-4 py-3">Control</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
                                    {fleet.map((bot) => (
                                        <tr key={bot.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                                            <td className="px-4 py-3">
                                                <input type="checkbox" checked={selectedBotIds.has(bot.id)} onChange={() => toggleBotSelect(bot.id)} className="rounded" />
                                            </td>
                                            <td className="px-5 py-3.5 text-xs text-slate-700 dark:text-slate-200">{bot.tenantName}</td>
                                            <td className="px-4 py-3.5">
                                                <p className="font-semibold text-slate-900 dark:text-slate-100 text-sm">{bot.displayName}</p>
                                                <p className="text-xs text-slate-500 dark:text-slate-400">{bot.botSlug}</p>
                                            </td>
                                            <td className="px-4 py-3.5">
                                                <span className={`inline-flex items-center gap-1 text-xs font-semibold ${statusStyles[bot.status as BotStatus]}`}>
                                                    <Activity className="w-3.5 h-3.5" />
                                                    {bot.status}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3.5 text-xs font-semibold text-slate-700 dark:text-slate-200">{bot.reliabilityPct}%</td>
                                            <td className="px-4 py-3.5 text-xs text-slate-500 dark:text-slate-400">{bot.tasksCompleted}</td>
                                            <td className="px-4 py-3.5 text-xs text-slate-500 dark:text-slate-400">{formatAgo(bot.lastActivityAt)}</td>
                                            <td className="px-4 py-3.5">
                                                <select
                                                    value={bot.status}
                                                    onChange={(e) => handleFleetStatusChange(bot, e.target.value as FleetBotStatus)}
                                                    disabled={savingFleetId === bot.id}
                                                    className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold text-slate-700 dark:text-slate-200 px-2.5 py-1.5 disabled:opacity-60"
                                                >
                                                    <option value="active">active</option>
                                                    <option value="paused">paused</option>
                                                    <option value="maintenance">maintenance</option>
                                                    <option value="error">error</option>
                                                </select>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
                        <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">Incident Center</h2>
                            <LifeBuoy className="w-4 h-4 text-rose-500" />
                        </div>
                        <div className="p-4 space-y-3 max-h-[480px] overflow-auto">
                            {incidents.filter((i) => i.severity === "critical" && i.status !== "resolved").length > 0 && (
                                <div className="rounded-xl border border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/30 px-3 py-2 flex items-center gap-2">
                                    <AlertTriangle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
                                    <span className="text-xs font-semibold text-rose-700 dark:text-rose-300">
                                        {incidents.filter((i) => i.severity === "critical" && i.status !== "resolved").length} critical incident(s) require immediate attention
                                    </span>
                                </div>
                            )}
                            {incidents.map((incident) => (
                                <div key={incident.id} className="rounded-xl border border-slate-200 dark:border-slate-800 p-3 space-y-2">
                                    <div className="flex items-center justify-between gap-2">
                                        <p className="font-semibold text-sm text-slate-900 dark:text-slate-100">{incident.title}</p>
                                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${incidentStyles[incident.status]}`}>
                                            {incident.status}
                                        </span>
                                    </div>
                                    <p className="text-xs text-slate-500 dark:text-slate-400">{incident.tenantName} • {incident.source} • {incident.severity}</p>
                                    <p className="text-xs text-slate-400 dark:text-slate-500">
                                        Opened {formatAgo(incident.createdAt)}
                                        {incident.assigneeEmail ? <span className="ml-2 text-violet-600 dark:text-violet-400">→ {incident.assigneeEmail}</span> : null}
                                    </p>
                                    {incident.status !== "resolved" ? (
                                        <div className="flex flex-wrap gap-1.5">
                                            <button onClick={() => handleResolveIncident(incident)} disabled={resolvingIncidentId === incident.id}
                                                className="inline-flex items-center gap-1 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 px-2.5 py-1.5 text-xs font-semibold disabled:opacity-60">
                                                {resolvingIncidentId === incident.id ? "Resolving..." : "Resolve"}
                                            </button>
                                            <button onClick={() => handleAssignIncident(incident)}
                                                className="inline-flex items-center gap-1 rounded-lg bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 px-2.5 py-1.5 text-xs font-semibold">
                                                <UserCheck className="w-3 h-3" />
                                                Escalate
                                            </button>
                                        </div>
                                    ) : (
                                        <p className="text-xs text-emerald-600 dark:text-emerald-400">Resolved {incident.resolvedAt ? formatAgo(incident.resolvedAt) : ""}</p>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                    <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
                        <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">Billing Oversight</h2>
                            <CircleDollarSign className="w-4 h-4 text-amber-500" />
                        </div>
                        <div className="p-4">
                            <div className="grid grid-cols-3 gap-3 mb-4">
                                <div className="rounded-lg bg-slate-50 dark:bg-slate-800 p-3">
                                    <p className="text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400">Total MRR</p>
                                    <p className="mt-1 text-lg font-extrabold text-slate-900 dark:text-slate-100">{money(billing?.totalMrrCents ?? 0)}</p>
                                </div>
                                <div className="rounded-lg bg-slate-50 dark:bg-slate-800 p-3">
                                    <p className="text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400">Open Invoices</p>
                                    <p className="mt-1 text-lg font-extrabold text-slate-900 dark:text-slate-100">{billing?.openInvoices ?? 0}</p>
                                </div>
                                <div className="rounded-lg bg-slate-50 dark:bg-slate-800 p-3">
                                    <p className="text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400">Enterprise</p>
                                    <p className="mt-1 text-lg font-extrabold text-slate-900 dark:text-slate-100">{billing?.tenantsOnEnterprise ?? 0}</p>
                                </div>
                            </div>
                            <div className="space-y-2 max-h-[260px] overflow-auto">
                                {billing?.byTenant.map((row) => (
                                    <div key={row.tenantId} className="rounded-lg border border-slate-200 dark:border-slate-800 p-3 flex items-center justify-between">
                                        <div>
                                            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{row.tenantName}</p>
                                            <p className="text-xs text-slate-500 dark:text-slate-400">{row.plan} • {row.openInvoices} open invoice(s)</p>
                                        </div>
                                        <p className="text-sm font-bold text-slate-900 dark:text-slate-100">{money(row.mrrCents)}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
                        <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">Integration Health</h2>
                            <DatabaseZap className="w-4 h-4 text-violet-500" />
                        </div>
                        <div className="p-4 space-y-2 max-h-[360px] overflow-auto">
                            {integrations.map((integration) => (
                                <div key={integration.id} className="rounded-lg border border-slate-200 dark:border-slate-800 p-3">
                                    <div className="flex items-center justify-between gap-2">
                                        <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{integration.tenantName} • {integration.integration}</p>
                                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${integrationStyles[integration.status]}`}>
                                            {integration.status}
                                        </span>
                                    </div>
                                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Checked {formatAgo(integration.lastCheckAt)}</p>
                                    {integration.errorMessage ? (
                                        <p className="text-xs text-rose-600 dark:text-rose-400 mt-1">{integration.errorMessage}</p>
                                    ) : null}
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
                    <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex flex-wrap gap-3 items-center justify-between">
                        <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">Global Logs</h2>
                        <div className="flex items-center gap-2">
                            <select
                                value={logTenantFilter}
                                onChange={(e) => setLogTenantFilter(e.target.value)}
                                className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold text-slate-700 dark:text-slate-200 px-2.5 py-1.5"
                            >
                                <option value="all">All tenants</option>
                                {tenants.map((tenant) => (
                                    <option key={tenant.id} value={tenant.id}>{tenant.name}</option>
                                ))}
                            </select>
                            <select
                                value={logLevelFilter}
                                onChange={(e) => setLogLevelFilter(e.target.value as "all" | LogLevel)}
                                className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold text-slate-700 dark:text-slate-200 px-2.5 py-1.5"
                            >
                                <option value="all">All levels</option>
                                <option value="info">info</option>
                                <option value="warn">warn</option>
                                <option value="error">error</option>
                            </select>
                            <button
                                onClick={loadLogs}
                                className="inline-flex items-center gap-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 px-2.5 py-1.5 text-xs font-semibold"
                            >
                                <RefreshCw className="w-3.5 h-3.5" />
                                Refresh
                            </button>
                        </div>
                    </div>
                    <div className="p-4 space-y-2 max-h-[360px] overflow-auto">
                        {logs.map((log) => (
                            <div key={log.id} className="rounded-lg border border-slate-200 dark:border-slate-800 p-3">
                                <div className="flex items-center justify-between gap-2">
                                    <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{log.tenantName} • {log.service}</p>
                                    <span className={`text-xs font-semibold uppercase ${levelStyles[log.level]}`}>{log.level}</span>
                                </div>
                                <p className="text-xs text-slate-600 dark:text-slate-300 mt-1">{log.message}</p>
                                <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">{log.traceId} • {formatAgo(log.createdAt)}</p>
                            </div>
                        ))}
                    </div>
                </div>

                {/* ── Audit Trail ── */}
                <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
                    <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex flex-wrap gap-3 items-center justify-between">
                        <div className="flex items-center gap-2">
                            <ClipboardList className="w-4 h-4 text-violet-500" />
                            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">Company Audit Trail</h2>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                            {newAuditCount > 0 && (
                                <span className="inline-flex items-center rounded-full bg-violet-600 text-white px-2 py-0.5 text-[10px] font-bold">
                                    +{newAuditCount} new
                                </span>
                            )}
                            <input
                                type="text"
                                placeholder="Filter by actor email…"
                                value={auditActorFilter}
                                onChange={(e) => setAuditActorFilter(e.target.value)}
                                className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold text-slate-700 dark:text-slate-200 px-2.5 py-1.5 w-44"
                            />
                            <select
                                value={auditTenantFilter}
                                onChange={(e) => setAuditTenantFilter(e.target.value)}
                                className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold text-slate-700 dark:text-slate-200 px-2.5 py-1.5"
                            >
                                <option value="all">All tenants</option>
                                {tenants.map((t) => (
                                    <option key={t.id} value={t.id}>{t.name}</option>
                                ))}
                            </select>
                            <select
                                value={auditActionFilter}
                                onChange={(e) => setAuditActionFilter(e.target.value)}
                                className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold text-slate-700 dark:text-slate-200 px-2.5 py-1.5"
                            >
                                <option value="all">All actions</option>
                                <option value="fleet.status_change">fleet.status_change</option>
                                <option value="incident.resolve">incident.resolve</option>
                                <option value="user.role_change">user.role_change</option>
                                <option value="incident.escalate">incident.escalate</option>
                                <option value="incident.critical_alert">incident.critical_alert</option>
                                <option value="tenant.provision">tenant.provision</option>
                                <option value="session.revoke">session.revoke</option>
                            </select>
                            <button onClick={() => { loadAuditEvents(); setNewAuditCount(0); }}
                                className="inline-flex items-center gap-1 rounded-lg bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 px-2.5 py-1.5 text-xs font-semibold">
                                <RefreshCw className="w-3.5 h-3.5" />
                                Refresh
                            </button>
                            <button onClick={exportAuditCsv}
                                className="inline-flex items-center gap-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 px-2.5 py-1.5 text-xs font-semibold hover:bg-slate-200 dark:hover:bg-slate-700">
                                <Download className="w-3.5 h-3.5" />
                                Export CSV
                            </button>
                        </div>
                    </div>
                    {auditEvents.length === 0 ? (
                        <div className="p-8 text-center text-xs text-slate-400 dark:text-slate-500">
                            No audit events recorded yet. Actions appear here after fleet changes, incident resolves, and role updates.
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full min-w-[860px] text-sm">
                                <thead>
                                    <tr className="bg-slate-50 dark:bg-slate-800/50 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                                        <th className="text-left px-5 py-3">Actor</th>
                                        <th className="text-left px-4 py-3">Action</th>
                                        <th className="text-left px-4 py-3">Target</th>
                                        <th className="text-left px-4 py-3">Before → After</th>
                                        <th className="text-left px-4 py-3">Reason</th>
                                        <th className="text-left px-4 py-3">When</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
                                    {auditEvents.map((evt) => {
                                        let before = "—";
                                        let after = "—";
                                        try {
                                            const b = JSON.parse(evt.beforeState);
                                            const a = JSON.parse(evt.afterState);
                                            before = Object.values(b).join(", ") || "—";
                                            after = Object.values(a).join(", ") || "—";
                                        } catch { /* ignore */ }
                                        return (
                                            <tr key={evt.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                                                <td className="px-5 py-3 text-xs text-slate-700 dark:text-slate-200">{evt.actorEmail}</td>
                                                <td className="px-4 py-3">
                                                    <span className="inline-flex items-center rounded-full bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300 px-2 py-0.5 text-[10px] font-semibold">
                                                        {evt.action}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400 font-mono">{evt.targetId}</td>
                                                <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-300">
                                                    <span className="text-rose-500">{before}</span>
                                                    {" → "}
                                                    <span className="text-emerald-600">{after}</span>
                                                </td>
                                                <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400 max-w-[220px] truncate" title={evt.reason}>
                                                    {evt.reason || <span className="italic text-slate-400 dark:text-slate-500">—</span>}
                                                </td>
                                                <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">{formatAgo(evt.createdAt)}</td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

                <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                    <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
                        <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">All Users and Roles</h2>
                            <span className="text-xs text-slate-500 dark:text-slate-400">Super admin can promote/demote any user</span>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full min-w-[720px] text-sm">
                                <thead>
                                    <tr className="bg-slate-50 dark:bg-slate-800/50 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                                        <th className="text-left px-5 py-3">Name</th>
                                        <th className="text-left px-4 py-3">Email</th>
                                        <th className="text-left px-4 py-3">Company</th>
                                        <th className="text-left px-4 py-3">Current Role</th>
                                        <th className="text-left px-4 py-3">Set Role</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
                                    {users.map((user) => (
                                        <tr key={user.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                                            <td className="px-5 py-3.5 font-semibold text-slate-900 dark:text-slate-100">{user.name}</td>
                                            <td className="px-4 py-3.5 text-xs text-slate-500 dark:text-slate-400">{user.email}</td>
                                            <td className="px-4 py-3.5 text-xs text-slate-500 dark:text-slate-400">{user.company}</td>
                                            <td className="px-4 py-3.5">
                                                <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${roleStyles[user.role]}`}>
                                                    {user.role === "superadmin" ? "Super Admin" : user.role === "admin" ? "Admin" : "Member"}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3.5">
                                                <select
                                                    value={user.role}
                                                    onChange={(e) => handleRoleChange(user, e.target.value as UserRole)}
                                                    disabled={savingUserId === user.id}
                                                    className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold text-slate-700 dark:text-slate-200 px-2.5 py-1.5 disabled:opacity-60"
                                                >
                                                    <option value="superadmin">Super Admin</option>
                                                    <option value="admin">Admin</option>
                                                    <option value="member">Member</option>
                                                </select>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
                        <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800">
                            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">Role Summary</h2>
                        </div>
                        <div className="p-5 grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <div className="rounded-lg bg-slate-50 dark:bg-slate-800 p-3">
                                <p className="text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400">Super Admins</p>
                                <p className="text-2xl font-extrabold text-slate-900 dark:text-slate-100 mt-1">{roleMetrics.superAdmins}</p>
                            </div>
                            <div className="rounded-lg bg-slate-50 dark:bg-slate-800 p-3">
                                <p className="text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400">Admins</p>
                                <p className="text-2xl font-extrabold text-slate-900 dark:text-slate-100 mt-1">{roleMetrics.admins}</p>
                            </div>
                            <div className="rounded-lg bg-slate-50 dark:bg-slate-800 p-3">
                                <p className="text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400">Members</p>
                                <p className="text-2xl font-extrabold text-slate-900 dark:text-slate-100 mt-1">{roleMetrics.members}</p>
                            </div>
                            <div className="sm:col-span-3 rounded-lg border border-violet-200 dark:border-violet-900/50 bg-violet-50 dark:bg-violet-950/20 p-3 text-xs text-violet-800 dark:text-violet-300">
                                Company operators can resolve incidents and control fleet bots directly without logging into each customer instance.
                            </div>
                        </div>
                    </div>
                </div>

                <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
                    <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <LogIn className="w-4 h-4 text-violet-500" />
                            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">Active Operator Sessions</h2>
                        </div>
                        <button onClick={loadSessions}
                            className="inline-flex items-center gap-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 px-2.5 py-1.5 text-xs font-semibold hover:bg-slate-200 dark:hover:bg-slate-700">
                            <RefreshCw className="w-3 h-3" />
                            Refresh
                        </button>
                    </div>
                    {operatorSessions.length === 0 ? (
                        <div className="p-8 text-center text-xs text-slate-400 dark:text-slate-500">No active sessions.</div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full min-w-[680px] text-sm">
                                <thead>
                                    <tr className="bg-slate-50 dark:bg-slate-800/50 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                                        <th className="text-left px-5 py-3">User</th>
                                        <th className="text-left px-4 py-3">Email</th>
                                        <th className="text-left px-4 py-3">Last Seen</th>
                                        <th className="text-left px-4 py-3">Expires</th>
                                        <th className="text-left px-4 py-3">Action</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
                                    {operatorSessions.map((s) => (
                                        <tr key={s.sessionId} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                                            <td className="px-5 py-3.5 font-semibold text-slate-900 dark:text-slate-100">{s.userName}</td>
                                            <td className="px-4 py-3.5 text-xs text-slate-500 dark:text-slate-400">{s.userEmail}</td>
                                            <td className="px-4 py-3.5 text-xs text-slate-500 dark:text-slate-400">{formatAgo(s.lastSeenAt)}</td>
                                            <td className="px-4 py-3.5 text-xs text-slate-500 dark:text-slate-400">{formatAgo(s.expiresAt)}</td>
                                            <td className="px-4 py-3.5">
                                                <button onClick={() => revokeSession(s.sessionId)} disabled={revokingSessionId === s.sessionId}
                                                    className="inline-flex items-center gap-1 rounded-lg bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300 px-2.5 py-1.5 text-xs font-semibold disabled:opacity-60">
                                                    <MonitorOff className="w-3.5 h-3.5" />
                                                    {revokingSessionId === s.sessionId ? "Revoking..." : "Revoke"}
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

function MetricCard({
    label,
    value,
    icon: Icon,
    tone,
}: {
    label: string;
    value: string;
    icon: LucideIcon;
    tone: "fuchsia" | "violet" | "slate" | "emerald" | "rose" | "amber";
}) {
    const styleMap: Record<typeof tone, string> = {
        fuchsia: "bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-900/40 dark:text-fuchsia-300",
        violet: "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300",
        slate: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
        emerald: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
        rose: "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300",
        amber: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
    };

    return (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
            <span className={`inline-flex items-center justify-center w-9 h-9 rounded-xl ${styleMap[tone]}`}>
                <Icon className="w-4.5 h-4.5" />
            </span>
            <p className="mt-3 text-2xl font-extrabold text-slate-900 dark:text-slate-100">{value}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{label}</p>
        </div>
    );
}
