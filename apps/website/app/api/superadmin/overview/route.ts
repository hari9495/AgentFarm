export const runtime = 'edge'

import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
    getSessionUser,
    isCompanyOperatorEmail,
    listCompanyTenants,
    listCompanyFleetBots,
    listCompanyIncidents,
    listCompanyIntegrations,
    getCompanyBillingSummary,
} from "@/lib/auth-store";

const COOKIE_NAME = "agentfarm_session";

export async function GET() {
    const jar = await cookies();
    const token = jar.get(COOKIE_NAME)?.value;
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const user = await getSessionUser(token);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!isCompanyOperatorEmail(user.email)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const tenants = await listCompanyTenants();
    const fleet = await listCompanyFleetBots();
    const incidents = await listCompanyIncidents();
    const integrations = await listCompanyIntegrations();
    const billing = await getCompanyBillingSummary();

    const openIncidents = incidents.filter((item) => item.status !== "resolved").length;
    const fleetErrors = fleet.filter((item) => item.status === "error" || item.status === "maintenance").length;
    const integrationsDown = integrations.filter((item) => item.status === "down").length;

    return NextResponse.json({
        metrics: {
            tenants: tenants.length,
            fleetBots: fleet.length,
            openIncidents,
            fleetErrors,
            integrationsDown,
            totalMrrCents: billing.totalMrrCents,
            openInvoices: billing.openInvoices,
        },
        tenants,
    });
}

