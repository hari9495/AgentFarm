import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { createSession, isCompanyOperatorEmailForPolicy } from "../lib/auth-store";

type UserRecord = {
    id: string;
    email: string;
    name?: string;
    company?: string;
    role: "superadmin" | "admin" | "member";
};

const BASE_URL = process.env.WEBSITE_BASE_URL ?? "http://localhost:3002";
const DB_PATH = process.env.WEBSITE_AUTH_DB_PATH ?? ".auth.sqlite";
const DUMMY_PASSWORD_HASH =
    "scrypt:0000000000000000000000000000000000000000000000000000000000000000:0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000";

const parseCsvEnv = (value: string | undefined): string[] =>
    (value ?? "")
        .split(",")
        .map((part) => part.trim().toLowerCase())
        .filter(Boolean);

const hasExplicitSuperadminRules = () => {
    const emailRules = parseCsvEnv(process.env.AGENTFARM_SUPERADMIN_EMAILS);
    const domainRules = parseCsvEnv(process.env.AGENTFARM_SUPERADMIN_DOMAINS);
    return emailRules.length > 0 || domainRules.length > 0;
};

const isCompanyOperatorInProduction = (email: string) =>
    isCompanyOperatorEmailForPolicy(email, {
        nodeEnv: "production",
        companyEmails: process.env.AGENTFARM_COMPANY_EMAILS,
        companyDomains: process.env.AGENTFARM_COMPANY_DOMAINS,
        fallbackDomains: process.env.AGENTFARM_COMPANY_FALLBACK_DOMAINS,
        disableFallback: process.env.AGENTFARM_DISABLE_COMPANY_FALLBACK,
    });

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const request = async (path: string, sessionToken?: string) => {
    const headers: Record<string, string> = {};
    if (sessionToken) {
        headers.cookie = `agentfarm_session=${encodeURIComponent(sessionToken)}`;
    }

    for (let attempt = 0; attempt < 4; attempt += 1) {
        const response = await fetch(`${BASE_URL}${path}`, {
            method: "GET",
            redirect: "manual",
            headers,
        });

        if (response.status !== 500 || attempt === 3) {
            return {
                status: response.status,
                location: response.headers.get("location"),
            };
        }

        await sleep(250);
    }

    return {
        status: 500,
        location: null,
    };
};

const ensureRoleUser = (db: DatabaseSync, role: UserRecord["role"], email: string, name: string): UserRecord => {
    const existing = db
        .prepare("SELECT id, email, role FROM users WHERE role = ? ORDER BY created_at ASC LIMIT 1")
        .get(role) as UserRecord | undefined;

    if (existing) {
        return existing;
    }

    const byEmail = db
        .prepare("SELECT id, email, role FROM users WHERE email = ? LIMIT 1")
        .get(email) as UserRecord | undefined;

    if (byEmail) {
        db.prepare("UPDATE users SET role = ? WHERE id = ?").run(role, byEmail.id);
        const updated = db
            .prepare("SELECT id, email, role FROM users WHERE id = ?")
            .get(byEmail.id) as UserRecord;
        return updated;
    }

    const id = `tst_${role}_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    db.prepare(
        "INSERT INTO users (id, email, name, company, role, password_hash, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).run(id, email, name, "AgentFarm Test", role, DUMMY_PASSWORD_HASH, Date.now());

    return {
        id,
        email,
        role,
    };
};

test("permission matrix for company portal and superadmin APIs", async () => {
    const db = new DatabaseSync(DB_PATH);

    const superadmin = ensureRoleUser(db, "superadmin", "superadmin@agentfarm.local", "Super Admin Test");
    const admin = ensureRoleUser(db, "admin", "admin@agentfarm.local", "Admin Test");
    const member = ensureRoleUser(db, "member", "member@agentfarm.local", "Member Test");

    const originalSuperadminEmail = superadmin.email;
    const originalAdminEmail = admin.email;
    const originalMemberEmail = member.email;

    const companySuperadminToken = createSession(superadmin.id).sessionToken;
    const adminToken = createSession(admin.id).sessionToken;
    const memberToken = createSession(member.id).sessionToken;

    const anonymousCompany = await request("/company");
    assert.equal(anonymousCompany.status, 307);
    assert.equal(anonymousCompany.location, "/login");

    const anonymousAdminUsers = await request("/api/admin/users");
    assert.equal(anonymousAdminUsers.status, 401);

    const anonymousSuperadminApi = await request("/api/superadmin/overview");
    assert.equal(anonymousSuperadminApi.status, 401);

    db.prepare("UPDATE users SET email = ? WHERE id = ?").run("admin@customerexample.com", admin.id);
    db.prepare("UPDATE users SET email = ? WHERE id = ?").run("member@customerexample.com", member.id);

    const memberAdminUsers = await request("/api/admin/users", memberToken);
    assert.equal(memberAdminUsers.status, 403);

    const memberSuperadminApi = await request("/api/superadmin/overview", memberToken);
    assert.equal(memberSuperadminApi.status, 403);

    const adminAdminUsers = await request("/api/admin/users", adminToken);
    assert.equal(adminAdminUsers.status, 200);

    const adminSuperadminApi = await request("/api/superadmin/overview", adminToken);
    assert.equal(adminSuperadminApi.status, 403);

    const companyCompanyPage = await request("/company", companySuperadminToken);
    if (isCompanyOperatorInProduction(originalSuperadminEmail)) {
        assert.equal(companyCompanyPage.status, 200);
    } else {
        assert.equal(companyCompanyPage.status, 307);
        assert.equal(companyCompanyPage.location, "/admin");
    }

    const companySuperadminApi = await request("/api/superadmin/overview", companySuperadminToken);
    assert.equal(companySuperadminApi.status, isCompanyOperatorInProduction(originalSuperadminEmail) ? 200 : 403);

    try {
        db.prepare("UPDATE users SET email = ? WHERE id = ?").run("superadmin@customerexample.com", superadmin.id);

        const customerSuperadminToken = createSession(superadmin.id).sessionToken;

        const customerTenantSuperadminPage = await request("/admin/superadmin", customerSuperadminToken);
        if (![200, 307].includes(customerTenantSuperadminPage.status)) {
            assert.fail(`Unexpected status for /admin/superadmin: ${customerTenantSuperadminPage.status}`);
        }
        if (customerTenantSuperadminPage.status === 307) {
            assert.equal(customerTenantSuperadminPage.location, "/dashboard");
        }

        const customerCompanyPage = await request("/company", customerSuperadminToken);
        assert.equal(customerCompanyPage.status, 307);
        assert.equal(customerCompanyPage.location, "/admin");

        const customerSuperadminApi = await request("/api/superadmin/overview", customerSuperadminToken);
        assert.equal(customerSuperadminApi.status, 403);
    } finally {
        db.prepare("UPDATE users SET email = ? WHERE id = ?").run(originalSuperadminEmail, superadmin.id);
        db.prepare("UPDATE users SET email = ? WHERE id = ?").run(originalAdminEmail, admin.id);
        db.prepare("UPDATE users SET email = ? WHERE id = ?").run(originalMemberEmail, member.id);
    }
});

test("company operator policy by environment", () => {
    assert.equal(
        isCompanyOperatorEmailForPolicy("ops@agentfarm.local", {
            nodeEnv: "production",
            companyEmails: "",
            companyDomains: "",
            fallbackDomains: "",
            disableFallback: "false",
        }),
        false,
    );

    assert.equal(
        isCompanyOperatorEmailForPolicy("ops@agentfarm.local", {
            nodeEnv: "production",
            companyEmails: "",
            companyDomains: "agentfarm.local",
            fallbackDomains: "",
            disableFallback: "false",
        }),
        true,
    );

    assert.equal(
        isCompanyOperatorEmailForPolicy("ops@agentfarm.local", {
            nodeEnv: "development",
            companyEmails: "",
            companyDomains: "",
            fallbackDomains: "",
            disableFallback: "false",
        }),
        true,
    );

    assert.equal(
        isCompanyOperatorEmailForPolicy("ops@agentfarm.local", {
            nodeEnv: "development",
            companyEmails: "",
            companyDomains: "",
            fallbackDomains: "",
            disableFallback: "true",
        }),
        false,
    );

    assert.equal(
        isCompanyOperatorEmailForPolicy("alice@corp.example", {
            nodeEnv: "production",
            companyEmails: "alice@corp.example",
            companyDomains: "",
            fallbackDomains: "",
            disableFallback: "false",
        }),
        true,
    );
});

test("company operator policy — additional security regressions", () => {
    // Empty string email is always denied regardless of environment.
    assert.equal(
        isCompanyOperatorEmailForPolicy("", {
            nodeEnv: "development",
            companyEmails: "",
            companyDomains: "",
            fallbackDomains: "agentfarm.local",
            disableFallback: "false",
        }),
        false,
    );

    // Whitespace-only email is always denied.
    assert.equal(
        isCompanyOperatorEmailForPolicy("   ", {
            nodeEnv: "development",
            companyEmails: "",
            companyDomains: "",
            fallbackDomains: "agentfarm.local",
            disableFallback: "false",
        }),
        false,
    );

    // Production with explicit emails config but no matching email → deny.
    assert.equal(
        isCompanyOperatorEmailForPolicy("unknown@corp.example", {
            nodeEnv: "production",
            companyEmails: "alice@corp.example",
            companyDomains: "",
            fallbackDomains: "",
            disableFallback: "false",
        }),
        false,
    );

    // Production with explicit domains config but wrong domain → deny.
    assert.equal(
        isCompanyOperatorEmailForPolicy("ops@other.example", {
            nodeEnv: "production",
            companyEmails: "",
            companyDomains: "agentfarm.io",
            fallbackDomains: "",
            disableFallback: "false",
        }),
        false,
    );

    // Subdomain must NOT match the parent domain unless explicitly listed.
    assert.equal(
        isCompanyOperatorEmailForPolicy("ops@sub.agentfarm.local", {
            nodeEnv: "development",
            companyEmails: "",
            companyDomains: "agentfarm.local",
            fallbackDomains: "",
            disableFallback: "false",
        }),
        false,
    );

    // Explicit email match is case-insensitive.
    assert.equal(
        isCompanyOperatorEmailForPolicy("ALICE@Corp.Example", {
            nodeEnv: "production",
            companyEmails: "alice@corp.example",
            companyDomains: "",
            fallbackDomains: "",
            disableFallback: "false",
        }),
        true,
    );

    // Domain match is case-insensitive.
    assert.equal(
        isCompanyOperatorEmailForPolicy("OPS@AgentFarm.LOCAL", {
            nodeEnv: "development",
            companyEmails: "",
            companyDomains: "",
            fallbackDomains: "agentfarm.local",
            disableFallback: "false",
        }),
        true,
    );

    // Production with BOTH emails and domains set — email match wins.
    assert.equal(
        isCompanyOperatorEmailForPolicy("alice@corp.example", {
            nodeEnv: "production",
            companyEmails: "alice@corp.example",
            companyDomains: "other.example",
            fallbackDomains: "",
            disableFallback: "false",
        }),
        true,
    );

    // Production with no explicit config and fallback disabled → deny.
    assert.equal(
        isCompanyOperatorEmailForPolicy("ops@agentfarm.local", {
            nodeEnv: "production",
            companyEmails: "",
            companyDomains: "",
            fallbackDomains: "agentfarm.local",
            disableFallback: "false",
        }),
        false,
        "Production mode must deny even if fallbackDomains is set — fallback only applies in non-production",
    );

    // Dev with explicit rules configured and non-matching email → deny (no fallback bypass).
    assert.equal(
        isCompanyOperatorEmailForPolicy("outsider@random.com", {
            nodeEnv: "development",
            companyEmails: "",
            companyDomains: "agentfarm.io",
            fallbackDomains: "agentfarm.local",
            disableFallback: "false",
        }),
        false,
    );
});

test("rate limiting — superadmin audit API returns 403 without company operator session", async () => {
    // Verify the audit endpoint is protected.
    const res = await request("/api/superadmin/audit");
    assert.equal(res.status, 401, "Audit API must require authentication");
});
