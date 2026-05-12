import { type NextRequest, NextResponse } from "next/server";

const COOKIE_NAME = "agentfarm_session";

/**
 * Maintenance mode: set NEXT_PUBLIC_MAINTENANCE_MODE=true in the environment
 * to return a 503 for all traffic except /api/health and /maintenance itself.
 * This lets you pause the site without redeploying.
 */
const MAINTENANCE_MODE = process.env["NEXT_PUBLIC_MAINTENANCE_MODE"] === "true";
const MAINTENANCE_BYPASS_PATHS = new Set(["/api/health", "/maintenance"]);

/**
 * Protected path prefixes. Any request whose pathname starts with one of these
 * prefixes requires a valid session cookie.  Full DB-level validation is done
 * inside server components (layouts) and route handlers; middleware acts as a
 * fast first gate on the Edge to avoid an unnecessary server round-trip for
 * clearly unauthenticated requests.
 */
const PROTECTED_PREFIXES = [
    "/dashboard",
    "/admin",
    "/onboarding",
    "/api/activity",
    "/api/approvals",
    "/api/connectors",
    "/api/deployments",
    "/api/marketplace",
    "/api/onboarding",
    "/api/provisioning",
    "/api/superadmin",
    "/api/admin",
];

/**
 * Paths that are always public even if they share a prefix with a protected
 * route (e.g. /api/auth/* must remain open for login/signup/session checks).
 */
const PUBLIC_PREFIXES = ["/api/auth"];

function isProtected(pathname: string): boolean {
    if (PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
        return false;
    }
    return PROTECTED_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

function hasCookie(request: NextRequest): boolean {
    const cookieHeader = request.headers.get("cookie");
    if (!cookieHeader) return false;
    return cookieHeader.split(";").some((part) => {
        const trimmed = part.trim();
        if (!trimmed.startsWith(`${COOKIE_NAME}=`)) return false;
        const value = trimmed.slice(COOKIE_NAME.length + 1);
        return value.length > 0;
    });
}

export function middleware(request: NextRequest): NextResponse {
    const { pathname } = request.nextUrl;

    // Maintenance mode: 503 for everything except health check and the maintenance page.
    if (MAINTENANCE_MODE && !MAINTENANCE_BYPASS_PATHS.has(pathname)) {
        if (pathname.startsWith("/api/")) {
            return NextResponse.json(
                { error: "Service temporarily unavailable. Please try again later." },
                { status: 503, headers: { "Retry-After": "300" } },
            );
        }
        const maintenanceUrl = request.nextUrl.clone();
        maintenanceUrl.pathname = "/maintenance";
        return NextResponse.redirect(maintenanceUrl);
    }

    if (!isProtected(pathname)) {
        return NextResponse.next();
    }

    if (hasCookie(request)) {
        return NextResponse.next();
    }

    // API routes get a 401 JSON response; page routes get a redirect.
    if (pathname.startsWith("/api/")) {
        return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }

    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("from", pathname);
    return NextResponse.redirect(loginUrl);
}

export const config = {
    matcher: [
        /*
         * Match all paths except static assets and Next.js internals.
         * This lets the middleware run on page routes and API routes without
         * processing /_next/*, /favicon.ico, or /public/* assets.
         */
        "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|opengraph-image|.*\\.(?:png|jpg|jpeg|gif|svg|ico|webp|woff2?|ttf|otf|eot|css|js|map)).*)",
    ],
};
