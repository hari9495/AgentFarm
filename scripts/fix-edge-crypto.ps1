$ErrorActionPreference = "Stop"
$enc = [System.Text.Encoding]::UTF8

# ── auth-store.ts ─────────────────────────────────────────────────────────────
$authStore = "d:\AgentFarm\apps\website\lib\auth-store.ts"
$c = [System.IO.File]::ReadAllText($authStore, $enc)

# 1. Remove node:crypto import, replace with Web Crypto helpers
$c = $c -replace [regex]::Escape('import { createHash, randomBytes } from "node:crypto";'), @'
function randomHex(bytes: number): string {
    const arr = new Uint8Array(bytes);
    globalThis.crypto.getRandomValues(arr);
    return Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("");
}

function randomBase64url(bytes: number): string {
    const arr = new Uint8Array(bytes);
    globalThis.crypto.getRandomValues(arr);
    return btoa(String.fromCharCode(...arr))
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");
}
'@

# 2. Replace hashSessionToken sync → async
$c = $c -replace [regex]::Escape('const hashSessionToken = (token: string): string => {
    return createHash("sha256").update(token).digest("hex");
};'), @'
const hashSessionToken = async (token: string): Promise<string> => {
    const data = new TextEncoder().encode(token);
    const hashBuffer = await globalThis.crypto.subtle.digest("SHA-256", data);
    return Array.from(new Uint8Array(hashBuffer), (b) => b.toString(16).padStart(2, "0")).join("");
};
'@

# 3. Add await to all hashSessionToken callers
$c = $c -replace 'const tokenHash = hashSessionToken\(', 'const tokenHash = await hashSessionToken('

# 4. Replace randomBytes(N).toString("hex") → randomHex(N)
$c = $c -replace 'randomBytes\((\d+)\)\.toString\("hex"\)', 'randomHex($1)'

# 5. Replace randomBytes(N).toString("base64url") → randomBase64url(N)
$c = $c -replace 'randomBytes\((\d+)\)\.toString\("base64url"\)', 'randomBase64url($1)'

[System.IO.File]::WriteAllText($authStore, $c, $enc)
Write-Host "Patched: $authStore"

# ── connectors/route.ts ───────────────────────────────────────────────────────
$connectors = "d:\AgentFarm\apps\website\app\api\connectors\route.ts"
$c = [System.IO.File]::ReadAllText($connectors, $enc)
$orig = $c
# Remove the bare 'crypto' import — crypto.randomUUID() is global in edge runtime
$c = $c -replace 'import crypto from "crypto";\r?\n', ''
if ($c -ne $orig) {
    [System.IO.File]::WriteAllText($connectors, $c, $enc)
    Write-Host "Patched: $connectors"
}
else {
    Write-Host "No change needed: $connectors"
}

Write-Host "`nDone."
