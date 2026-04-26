import fs from "node:fs";
import path from "node:path";

const appDir = path.resolve("app");
const baseUrl = process.env.WEBSITE_URL ?? "http://localhost:3002";

const authProtectedPrefixes = ["/admin", "/dashboard", "/company"];
const dynamicRoutes = [
    "/marketplace/ai-backend-developer",
    "/dashboard/agents/ai-backend-developer",
    "/dashboard/agents/ai-backend-developer/approvals",
    "/company/tenants/sample",
];

function collectStaticRoutes(rootDir) {
    const routes = [];

    function walk(dir) {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                walk(full);
                continue;
            }
            if (!entry.isFile() || entry.name !== "page.tsx") continue;

            let rel = path.relative(rootDir, full).replace(/\\/g, "/");
            if (rel === "page.tsx") {
                rel = "";
            } else {
                rel = rel.replace(/\/page\.tsx$/, "");
            }
            rel = rel.replace(/\([^/]+\)\//g, "");
            if (rel.includes("[")) continue;

            const route = rel === "" ? "/" : `/${rel}`;
            routes.push(route);
        }
    }

    walk(rootDir);
    return [...new Set(routes)].sort();
}

function isAuthProtected(route) {
    return authProtectedPrefixes.some((prefix) => route === prefix || route.startsWith(`${prefix}/`));
}

function hasRenderSignal(html) {
    return /<main[\s>]|<h1[\s>]/i.test(html);
}

async function checkRoute(route) {
    const response = await fetch(new URL(route, baseUrl), { redirect: "follow" });
    const finalPath = new URL(response.url).pathname;
    const html = await response.text();

    const protectedRoute = isAuthProtected(route);
    const redirectedToLogin = protectedRoute && finalPath === "/login";

    const ok = response.ok && (redirectedToLogin || hasRenderSignal(html));

    return {
        route,
        status: response.status,
        finalPath,
        protectedRoute,
        redirectedToLogin,
        renderSignal: hasRenderSignal(html),
        ok,
    };
}

async function main() {
    const staticRoutes = collectStaticRoutes(appDir);
    const routes = [...new Set([...staticRoutes, ...dynamicRoutes])].sort();

    const results = [];
    for (const route of routes) {
        try {
            results.push(await checkRoute(route));
        } catch (error) {
            results.push({ route, ok: false, status: 0, finalPath: "", renderSignal: false, error: String(error) });
        }
    }

    const failures = results.filter((r) => !r.ok);

    console.log("UI smoke check:");
    console.table(
        results.map((r) => ({
            route: r.route,
            status: r.status,
            finalPath: r.finalPath,
            loginRedirect: r.redirectedToLogin ?? false,
            renderSignal: r.renderSignal ?? false,
            ok: r.ok,
        }))
    );

    if (failures.length > 0) {
        console.error("\nFailed routes:");
        for (const f of failures) {
            console.error(`- ${f.route} (status=${f.status}, finalPath=${f.finalPath || "n/a"})`);
            if (f.error) console.error(`  error: ${f.error}`);
        }
        process.exitCode = 1;
        return;
    }

    console.log(`\nPASS: ${results.length} routes checked.`);
}

await main();
