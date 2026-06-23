/**
 * E2E probe: exercises the agent-runtime's OWN MCP client code paths against
 * the live gateway + a registered MCP server. Run INSIDE the agent-runtime
 * container so it uses the same env (API_GATEWAY_URL, shared token).
 */
import { getTenantMcpServers, discoverMcpTools, invokeMcpTool } from '/app/apps/agent-runtime/dist/mcp-registry-client.js';

const TENANT = process.argv[2] ?? 'yukthix-consulting-a2362a';

const main = async () => {
    console.log('--- 1. getTenantMcpServers (runtime discovery, real auth) ---');
    const servers = await getTenantMcpServers(TENANT);
    console.log(JSON.stringify(servers.map((s) => ({ name: s.name, url: s.url, active: s.isActive })), null, 2));
    if (servers.length === 0) {
        console.error('FAIL: runtime sees no servers — auth/discovery still broken.');
        process.exit(1);
    }

    console.log('\n--- 2. discoverMcpTools (health-check + initialize + tools/list) ---');
    const discovered = await discoverMcpTools(TENANT, '', '');
    for (const srv of discovered) {
        console.log(`server "${srv.name}" healthy=${srv.healthy} proto=${srv.protocolVersion} tools=[${srv.tools.map((t) => t.name).join(', ')}]`);
    }

    const echo = servers.find((s) => s.name === 'echo');
    if (!echo) {
        console.error('FAIL: echo server not found.');
        process.exit(1);
    }

    console.log('\n--- 3. invokeMcpTool: echo(message) ---');
    const r1 = await invokeMcpTool(echo.url, echo.headers ?? {}, 'echo', { message: 'agent calling MCP tool' });
    console.log('echo result:', JSON.stringify(r1.content));

    console.log('\n--- 4. invokeMcpTool: add(2,40) ---');
    const r2 = await invokeMcpTool(echo.url, echo.headers ?? {}, 'add', { a: 2, b: 40 });
    console.log('add result:', JSON.stringify(r2.content));

    console.log('\nPASS: runtime discovered, connected to, and invoked the registered MCP server end-to-end.');
};

main().catch((err) => {
    console.error('ERROR:', err);
    process.exit(1);
});
