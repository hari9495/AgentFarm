import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const snapshotsDir = path.resolve("tests/ui-checkshots");
const manifestPath = path.join(snapshotsDir, "baseline-manifest.json");
const update = process.argv.includes("--update");

const expectedFiles = [
    "home-desktop.png",
    "home-mobile.png",
    "marketplace-desktop.png",
    "marketplace-mobile.png",
    "product-desktop.png",
    "product-mobile.png",
    "pricing-desktop.png",
    "pricing-mobile.png",
    "docs-desktop.png",
    "docs-mobile.png",
    "login-desktop.png",
    "login-mobile.png",
    "about-desktop.png",
    "about-mobile.png",
    "security-desktop.png",
    "security-mobile.png",
];

function hashFile(filePath) {
    const buffer = fs.readFileSync(filePath);
    return crypto.createHash("sha256").update(buffer).digest("hex");
}

function currentSnapshotState() {
    const missing = [];
    const files = {};

    for (const name of expectedFiles) {
        const full = path.join(snapshotsDir, name);
        if (!fs.existsSync(full)) {
            missing.push(name);
            continue;
        }
        files[name] = hashFile(full);
    }

    return { missing, files };
}

function writeManifest(files) {
    const manifest = {
        generatedAt: new Date().toISOString(),
        expectedFiles,
        files,
    };
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
}

function verifyManifest(files) {
    if (!fs.existsSync(manifestPath)) {
        throw new Error("Missing baseline-manifest.json. Run: pnpm --filter @agentfarm/website ui:baseline:update");
    }

    const baseline = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    const changed = [];

    for (const name of expectedFiles) {
        const now = files[name];
        const before = baseline.files?.[name];
        if (!before) {
            changed.push({ name, type: "added-to-expected" });
            continue;
        }
        if (now !== before) {
            changed.push({ name, type: "content-changed" });
        }
    }

    return changed;
}

function main() {
    if (!fs.existsSync(snapshotsDir)) {
        throw new Error("Snapshot directory not found: tests/ui-checkshots");
    }

    const { missing, files } = currentSnapshotState();
    if (missing.length > 0) {
        throw new Error(`Missing snapshot files:\n- ${missing.join("\n- ")}`);
    }

    if (update) {
        writeManifest(files);
        console.log(`Baseline manifest updated: ${manifestPath}`);
        return;
    }

    const changed = verifyManifest(files);
    if (changed.length > 0) {
        console.error("Baseline differences found:");
        for (const c of changed) {
            console.error(`- ${c.name}: ${c.type}`);
        }
        process.exitCode = 1;
        return;
    }

    console.log("PASS: UI baseline matches manifest.");
}

main();
