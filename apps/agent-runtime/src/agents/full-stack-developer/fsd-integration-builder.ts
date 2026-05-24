// ============================================================================
// FSD INTEGRATION BUILDER
// Sprint 16 — Full-Stack Developer Role
//
// Pure functions for frontend-backend integration work:
//   - API client code generation (fetch / axios / react-query)
//   - Auth flow scaffolding (JWT, OAuth2, session, magic link)
//   - Realtime setup (WebSocket, SSE, polling)
//   - State management scaffolding (Redux, Zustand, Pinia, Context)
//   - Environment configuration templates
//
// No I/O, no LLM calls, no side-effects — all testable in isolation.
// ============================================================================

import type { UiFramework } from './fsd-ui-builder.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AuthStrategy     = 'jwt' | 'oauth2' | 'session' | 'magic_link' | 'api_key';
export type OAuthProvider    = 'google' | 'github' | 'microsoft' | 'facebook' | 'generic';
export type RealtimeStrategy = 'websocket' | 'sse' | 'polling';
export type StateMgmtLib     = 'redux-toolkit' | 'zustand' | 'pinia' | 'context' | 'jotai' | 'recoil';
export type HttpClient       = 'fetch' | 'axios' | 'react-query' | 'swr' | 'vue-query';

export interface ApiEndpoint {
    path:        string;
    method:      'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
    requestBody?: string;   // TypeScript type name
    responseType: string;   // TypeScript type name
    auth:        boolean;
}

export interface ApiClientScaffold {
    clientFilename:    string;
    clientCode:        string;
    typesFilename:     string;
    typesCode:         string;
    hookFilename?:     string;
    hookCode?:         string;
}

export interface AuthScaffold {
    strategy:    AuthStrategy;
    files:       Array<{ filename: string; code: string }>;
    envVars:     string[];
    summary:     string;
}

export interface RealtimeScaffold {
    strategy: RealtimeStrategy;
    filename: string;
    code:     string;
    hookFile?: string;
    hookCode?: string;
    summary:  string;
}

export interface StateScaffold {
    lib:       StateMgmtLib;
    framework: UiFramework;
    files:     Array<{ filename: string; code: string }>;
    summary:   string;
}

export interface EnvVariable {
    key:         string;
    description: string;
    required:    boolean;
    example?:    string;
    secret?:     boolean;
}

export interface EnvTemplate {
    envFilename:      string;
    envContent:       string;
    exampleFilename:  string;
    exampleContent:   string;
    validationCode:   string;
    summary:          string;
}

// ---------------------------------------------------------------------------
// generateApiClientCode
// ---------------------------------------------------------------------------

export function generateApiClientCode(
    endpoints: ApiEndpoint[],
    options: {
        baseUrl:    string;
        httpClient: HttpClient;
        framework:  UiFramework;
        moduleName: string;
    },
): ApiClientScaffold {
    const { baseUrl, httpClient, moduleName } = options;

    // Types file
    const typesCode = [
        `// Auto-generated API types for ${moduleName}`,
        '',
        ...endpoints.flatMap((e) => [
            e.requestBody ? `export interface ${e.requestBody} {\n  // TODO: define request body fields\n}\n` : '',
            `export interface ${e.responseType} {\n  // TODO: define response fields\n}\n`,
        ]).filter(Boolean),
    ].join('\n');

    // Client file
    let clientCode: string;
    if (httpClient === 'axios') {
        clientCode = buildAxiosClient(endpoints, baseUrl, moduleName);
    } else if (httpClient === 'react-query') {
        clientCode = buildReactQueryClient(endpoints, baseUrl, moduleName);
    } else if (httpClient === 'swr') {
        clientCode = buildSwrClient(endpoints, baseUrl, moduleName);
    } else {
        clientCode = buildFetchClient(endpoints, baseUrl, moduleName);
    }

    // Hook file (React / Vue composable)
    const { hookFilename, hookCode } = buildApiHook(endpoints, moduleName, options.framework, httpClient);

    return {
        clientFilename: `${moduleName}.api.ts`,
        clientCode,
        typesFilename:  `${moduleName}.types.ts`,
        typesCode,
        hookFilename,
        hookCode,
    };
}

function buildFetchClient(endpoints: ApiEndpoint[], baseUrl: string, name: string): string {
    const lines = [
        `const BASE_URL = '${baseUrl}';`,
        '',
        `async function request<T>(path: string, init?: RequestInit): Promise<T> {`,
        `  const res = await fetch(\`\${BASE_URL}\${path}\`, {`,
        `    headers: { 'Content-Type': 'application/json', ...init?.headers },`,
        `    ...init,`,
        `  });`,
        `  if (!res.ok) throw new Error(\`HTTP \${res.status}: \${await res.text()}\`);`,
        `  return res.json() as Promise<T>;`,
        `}`,
        '',
        `export const ${name}Api = {`,
    ];
    for (const e of endpoints) {
        const fnName = endpointToFnName(e);
        const hasBody = e.requestBody && ['POST', 'PUT', 'PATCH'].includes(e.method);
        const bodyArg = hasBody ? `, body: JSON.stringify(body)` : '';
        lines.push(`  ${fnName}: (${hasBody ? `body: ${e.requestBody}` : ''}) =>`);
        lines.push(`    request<${e.responseType}>('${e.path}', { method: '${e.method}'${bodyArg} }),`);
    }
    lines.push('};');
    return lines.join('\n');
}

function buildAxiosClient(endpoints: ApiEndpoint[], baseUrl: string, name: string): string {
    const lines = [
        `import axios from 'axios';`,
        '',
        `const client = axios.create({ baseURL: '${baseUrl}' });`,
        '',
        `// Attach auth token interceptor`,
        `client.interceptors.request.use((config) => {`,
        `  const token = localStorage.getItem('token');`,
        `  if (token) config.headers.Authorization = \`Bearer \${token}\`;`,
        `  return config;`,
        `});`,
        '',
        `export const ${name}Api = {`,
    ];
    for (const e of endpoints) {
        const fnName = endpointToFnName(e);
        const hasBody = e.requestBody && ['POST', 'PUT', 'PATCH'].includes(e.method);
        if (hasBody) {
            lines.push(`  ${fnName}: (body: ${e.requestBody}) => client.${e.method.toLowerCase()}<${e.responseType}>('${e.path}', body).then(r => r.data),`);
        } else {
            lines.push(`  ${fnName}: () => client.${e.method.toLowerCase()}<${e.responseType}>('${e.path}').then(r => r.data),`);
        }
    }
    lines.push('};');
    return lines.join('\n');
}

function buildReactQueryClient(endpoints: ApiEndpoint[], baseUrl: string, name: string): string {
    const getEndpoints  = endpoints.filter((e) => e.method === 'GET');
    const mutEndpoints  = endpoints.filter((e) => e.method !== 'GET');
    const lines = [
        `import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';`,
        '',
        `const BASE_URL = '${baseUrl}';`,
        '',
    ];
    for (const e of getEndpoints) {
        const key = endpointToFnName(e);
        lines.push(`export const use${cap(key)} = () =>`);
        lines.push(`  useQuery({ queryKey: ['${key}'], queryFn: () => fetch(\`\${BASE_URL}${e.path}\`).then(r => r.json() as Promise<${e.responseType}>) });`);
        lines.push('');
    }
    for (const e of mutEndpoints) {
        const key = endpointToFnName(e);
        lines.push(`export const use${cap(key)} = () => {`);
        lines.push(`  const qc = useQueryClient();`);
        lines.push(`  return useMutation({`);
        lines.push(`    mutationFn: (body: ${e.requestBody ?? 'unknown'}) =>`);
        lines.push(`      fetch(\`\${BASE_URL}${e.path}\`, { method: '${e.method}', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } }).then(r => r.json() as Promise<${e.responseType}>),`);
        lines.push(`    onSuccess: () => qc.invalidateQueries({ queryKey: ['${name}'] }),`);
        lines.push(`  });`);
        lines.push(`};`);
        lines.push('');
    }
    return lines.join('\n');
}

function buildSwrClient(endpoints: ApiEndpoint[], baseUrl: string, name: string): string {
    const lines = [
        `import useSWR from 'swr';`,
        '',
        `const fetcher = (url: string) => fetch(url).then(r => r.json());`,
        `const BASE_URL = '${baseUrl}';`,
        '',
    ];
    for (const e of endpoints.filter((e) => e.method === 'GET')) {
        const key = endpointToFnName(e);
        lines.push(`export const use${cap(key)} = () =>`);
        lines.push(`  useSWR<${e.responseType}>(\`\${BASE_URL}${e.path}\`, fetcher);`);
        lines.push('');
    }
    return lines.join('\n');
}

function buildApiHook(
    endpoints: ApiEndpoint[],
    name: string,
    framework: UiFramework,
    client: HttpClient,
): { hookFilename?: string; hookCode?: string } {
    if (client === 'react-query' || client === 'swr') return {};
    if (framework === 'vue') {
        const code = [
            `import { ref } from 'vue';`,
            `import { ${name}Api } from './${name}.api';`,
            '',
            `export function use${cap(name)}() {`,
            `  const loading = ref(false);`,
            `  const error   = ref<string | null>(null);`,
            '',
            ...endpoints.map((e) => {
                const fn = endpointToFnName(e);
                return `  const ${fn} = async () => {\n    loading.value = true;\n    try { return await ${name}Api.${fn}(); } catch(e) { error.value = String(e); } finally { loading.value = false; }\n  };`;
            }),
            '',
            `  return { loading, error, ${endpoints.map(endpointToFnName).join(', ')} };`,
            `}`,
        ].join('\n');
        return { hookFilename: `use${cap(name)}.ts`, hookCode: code };
    }
    // React default
    const code = [
        `import { useState, useCallback } from 'react';`,
        `import { ${name}Api } from './${name}.api';`,
        '',
        `export function use${cap(name)}() {`,
        `  const [loading, setLoading] = useState(false);`,
        `  const [error, setError]     = useState<string | null>(null);`,
        '',
        ...endpoints.map((e) => {
            const fn = endpointToFnName(e);
            return `  const ${fn} = useCallback(async () => {\n    setLoading(true);\n    try { return await ${name}Api.${fn}(); } catch(e) { setError(String(e)); } finally { setLoading(false); }\n  }, []);`;
        }),
        '',
        `  return { loading, error, ${endpoints.map(endpointToFnName).join(', ')} };`,
        `}`,
    ].join('\n');
    return { hookFilename: `use${cap(name)}.ts`, hookCode: code };
}

// ---------------------------------------------------------------------------
// generateAuthScaffold
// ---------------------------------------------------------------------------

export function generateAuthScaffold(
    strategy: AuthStrategy,
    framework: UiFramework,
    provider?: OAuthProvider,
): AuthScaffold {
    switch (strategy) {
        case 'jwt':        return buildJwtAuth(framework);
        case 'oauth2':     return buildOAuthAuth(framework, provider ?? 'generic');
        case 'session':    return buildSessionAuth(framework);
        case 'magic_link': return buildMagicLinkAuth(framework);
        case 'api_key':    return buildApiKeyAuth(framework);
    }
}

function buildJwtAuth(framework: UiFramework): AuthScaffold {
    const isReact = framework === 'react';
    const files = [
        {
            filename: 'auth.service.ts',
            code: [
                `const TOKEN_KEY = 'auth_token';`,
                `const REFRESH_KEY = 'refresh_token';`,
                '',
                `export const authService = {`,
                `  login: async (email: string, password: string) => {`,
                `    const res = await fetch('/api/auth/login', {`,
                `      method: 'POST', headers: { 'Content-Type': 'application/json' },`,
                `      body: JSON.stringify({ email, password }),`,
                `    });`,
                `    if (!res.ok) throw new Error('Login failed');`,
                `    const { token, refreshToken } = await res.json() as { token: string; refreshToken: string };`,
                `    localStorage.setItem(TOKEN_KEY, token);`,
                `    localStorage.setItem(REFRESH_KEY, refreshToken);`,
                `    return token;`,
                `  },`,
                `  logout: () => { localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(REFRESH_KEY); },`,
                `  getToken: () => localStorage.getItem(TOKEN_KEY),`,
                `  isAuthenticated: () => !!localStorage.getItem(TOKEN_KEY),`,
                `  refreshToken: async () => {`,
                `    const token = localStorage.getItem(REFRESH_KEY);`,
                `    if (!token) throw new Error('No refresh token');`,
                `    const res = await fetch('/api/auth/refresh', { method: 'POST', body: JSON.stringify({ token }), headers: { 'Content-Type': 'application/json' } });`,
                `    if (!res.ok) throw new Error('Refresh failed');`,
                `    const { token: newToken } = await res.json() as { token: string };`,
                `    localStorage.setItem(TOKEN_KEY, newToken);`,
                `    return newToken;`,
                `  },`,
                `};`,
            ].join('\n'),
        },
        {
            filename: isReact ? 'AuthContext.tsx' : 'useAuth.ts',
            code: isReact
                ? buildReactAuthContext()
                : buildVueAuthComposable(),
        },
    ];
    return {
        strategy: 'jwt',
        files,
        envVars: ['JWT_SECRET', 'JWT_EXPIRES_IN', 'JWT_REFRESH_EXPIRES_IN'],
        summary: 'JWT auth scaffold: login/logout/refresh token flow with localStorage persistence.',
    };
}

function buildReactAuthContext(): string {
    return [
        `import React, { createContext, useContext, useState } from 'react';`,
        `import { authService } from './auth.service';`,
        '',
        `interface AuthContextValue { isAuthenticated: boolean; login(email: string, pw: string): Promise<void>; logout(): void; }`,
        `const AuthContext = createContext<AuthContextValue | null>(null);`,
        '',
        `export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {`,
        `  const [isAuthenticated, setAuth] = useState(authService.isAuthenticated());`,
        `  const login = async (email: string, pw: string) => { await authService.login(email, pw); setAuth(true); };`,
        `  const logout = () => { authService.logout(); setAuth(false); };`,
        `  return <AuthContext.Provider value={{ isAuthenticated, login, logout }}>{children}</AuthContext.Provider>;`,
        `};`,
        '',
        `export const useAuth = () => { const ctx = useContext(AuthContext); if (!ctx) throw new Error('useAuth must be inside AuthProvider'); return ctx; };`,
    ].join('\n');
}

function buildVueAuthComposable(): string {
    return [
        `import { ref } from 'vue';`,
        `import { authService } from './auth.service';`,
        '',
        `const isAuthenticated = ref(authService.isAuthenticated());`,
        '',
        `export function useAuth() {`,
        `  const login = async (email: string, password: string) => { await authService.login(email, password); isAuthenticated.value = true; };`,
        `  const logout = () => { authService.logout(); isAuthenticated.value = false; };`,
        `  return { isAuthenticated, login, logout };`,
        `}`,
    ].join('\n');
}

function buildOAuthAuth(framework: UiFramework, provider: OAuthProvider): AuthScaffold {
    const clientId = `${provider.toUpperCase()}_CLIENT_ID`;
    const secret   = `${provider.toUpperCase()}_CLIENT_SECRET`;
    const callbackUrl = `${provider.toUpperCase()}_REDIRECT_URI`;
    return {
        strategy: 'oauth2',
        files: [
            {
                filename: 'oauth.service.ts',
                code: [
                    `const CLIENT_ID    = process.env['${clientId}'] ?? '';`,
                    `const REDIRECT_URI = process.env['${callbackUrl}'] ?? 'http://localhost:3000/auth/callback';`,
                    '',
                    `export const oauthService = {`,
                    `  getAuthUrl: () => {`,
                    `    const params = new URLSearchParams({ client_id: CLIENT_ID, redirect_uri: REDIRECT_URI, response_type: 'code', scope: 'openid email profile' });`,
                    `    return \`https://${provider === 'google' ? 'accounts.google.com/o/oauth2/v2/auth' : provider === 'github' ? 'github.com/login/oauth/authorize' : 'provider.example.com/oauth/authorize'}?\${params}\`;`,
                    `  },`,
                    `  handleCallback: async (code: string) => {`,
                    `    const res = await fetch('/api/auth/callback', { method: 'POST', body: JSON.stringify({ code }), headers: { 'Content-Type': 'application/json' } });`,
                    `    if (!res.ok) throw new Error('OAuth callback failed');`,
                    `    return res.json();`,
                    `  },`,
                    `};`,
                ].join('\n'),
            },
        ],
        envVars: [clientId, secret, callbackUrl],
        summary: `OAuth2 ${provider} scaffold: auth URL generation + callback handler.`,
    };
}

function buildSessionAuth(framework: UiFramework): AuthScaffold {
    return {
        strategy: 'session',
        files: [
            {
                filename: 'session.service.ts',
                code: [
                    `export const sessionService = {`,
                    `  login: async (email: string, password: string) => {`,
                    `    const res = await fetch('/api/auth/login', { method: 'POST', credentials: 'include', body: JSON.stringify({ email, password }), headers: { 'Content-Type': 'application/json' } });`,
                    `    if (!res.ok) throw new Error('Login failed');`,
                    `    return res.json();`,
                    `  },`,
                    `  logout: () => fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }),`,
                    `  getMe: () => fetch('/api/auth/me', { credentials: 'include' }).then(r => r.ok ? r.json() : null),`,
                    `};`,
                ].join('\n'),
            },
        ],
        envVars: ['SESSION_SECRET', 'SESSION_COOKIE_NAME', 'SESSION_MAX_AGE'],
        summary: 'Session-based auth scaffold: httpOnly cookie, server-side session store.',
    };
}

function buildMagicLinkAuth(_framework: UiFramework): AuthScaffold {
    return {
        strategy: 'magic_link',
        files: [
            {
                filename: 'magic-link.service.ts',
                code: [
                    `export const magicLinkService = {`,
                    `  requestLink: async (email: string) => {`,
                    `    const res = await fetch('/api/auth/magic-link', { method: 'POST', body: JSON.stringify({ email }), headers: { 'Content-Type': 'application/json' } });`,
                    `    if (!res.ok) throw new Error('Failed to send magic link');`,
                    `  },`,
                    `  verifyToken: async (token: string) => {`,
                    `    const res = await fetch(\`/api/auth/verify?token=\${token}\`);`,
                    `    if (!res.ok) throw new Error('Invalid or expired magic link');`,
                    `    return res.json();`,
                    `  },`,
                    `};`,
                ].join('\n'),
            },
        ],
        envVars: ['MAGIC_LINK_SECRET', 'MAGIC_LINK_EXPIRES_IN', 'EMAIL_FROM'],
        summary: 'Magic link auth scaffold: email link request + token verification.',
    };
}

function buildApiKeyAuth(_framework: UiFramework): AuthScaffold {
    return {
        strategy: 'api_key',
        files: [
            {
                filename: 'api-key.service.ts',
                code: [
                    `const API_KEY_HEADER = 'X-API-Key';`,
                    '',
                    `export const apiKeyService = {`,
                    `  request: async <T>(url: string, init?: RequestInit): Promise<T> => {`,
                    `    const key = localStorage.getItem('api_key') ?? '';`,
                    `    const res = await fetch(url, { ...init, headers: { [API_KEY_HEADER]: key, ...init?.headers } });`,
                    `    if (!res.ok) throw new Error(\`HTTP \${res.status}\`);`,
                    `    return res.json() as Promise<T>;`,
                    `  },`,
                    `  setApiKey: (key: string) => localStorage.setItem('api_key', key),`,
                    `  clearApiKey: () => localStorage.removeItem('api_key'),`,
                    `};`,
                ].join('\n'),
            },
        ],
        envVars: ['API_KEY_HEADER_NAME', 'API_KEY_HASH_SALT'],
        summary: 'API key auth scaffold: header-based key injection for machine-to-machine auth.',
    };
}

// ---------------------------------------------------------------------------
// generateRealtimeCode
// ---------------------------------------------------------------------------

export function generateRealtimeCode(
    strategy: RealtimeStrategy,
    endpoint: string,
    framework: UiFramework,
): RealtimeScaffold {
    switch (strategy) {
        case 'websocket': return buildWebSocketScaffold(endpoint, framework);
        case 'sse':       return buildSseScaffold(endpoint, framework);
        case 'polling':   return buildPollingScaffold(endpoint, framework);
    }
}

function buildWebSocketScaffold(endpoint: string, framework: UiFramework): RealtimeScaffold {
    const code = [
        `export class WebSocketService {`,
        `  private ws: WebSocket | null = null;`,
        `  private listeners = new Map<string, Set<(data: unknown) => void>>();`,
        '',
        `  connect(url = '${endpoint}') {`,
        `    this.ws = new WebSocket(url);`,
        `    this.ws.onmessage = (event) => {`,
        `      try {`,
        `        const { type, data } = JSON.parse(event.data as string) as { type: string; data: unknown };`,
        `        this.listeners.get(type)?.forEach((fn) => fn(data));`,
        `      } catch { /* ignore malformed messages */ }`,
        `    };`,
        `    this.ws.onclose = () => setTimeout(() => this.connect(url), 3000); // auto-reconnect`,
        `  }`,
        '',
        `  on(type: string, fn: (data: unknown) => void) {`,
        `    if (!this.listeners.has(type)) this.listeners.set(type, new Set());`,
        `    this.listeners.get(type)!.add(fn);`,
        `  }`,
        '',
        `  send(type: string, data: unknown) {`,
        `    this.ws?.send(JSON.stringify({ type, data }));`,
        `  }`,
        '',
        `  disconnect() { this.ws?.close(); }`,
        `}`,
        '',
        `export const wsService = new WebSocketService();`,
    ].join('\n');

    const hookCode = framework === 'vue'
        ? [`import { ref, onMounted, onUnmounted } from 'vue';`, `import { wsService } from './websocket.service';`, '', `export function useWebSocket(eventType: string) {`, `  const data = ref<unknown>(null);`, `  const handler = (d: unknown) => { data.value = d; };`, `  onMounted(() => wsService.on(eventType, handler));`, `  onUnmounted(() => { /* remove listener */ });`, `  return { data };`, `}`].join('\n')
        : [`import { useState, useEffect } from 'react';`, `import { wsService } from './websocket.service';`, '', `export function useWebSocket(eventType: string) {`, `  const [data, setData] = useState<unknown>(null);`, `  useEffect(() => { wsService.on(eventType, setData); }, [eventType]);`, `  return { data };`, `}`].join('\n');

    return { strategy: 'websocket', filename: 'websocket.service.ts', code, hookFile: 'useWebSocket.ts', hookCode, summary: `WebSocket service with auto-reconnect and typed event listeners for ${endpoint}.` };
}

function buildSseScaffold(endpoint: string, framework: UiFramework): RealtimeScaffold {
    const code = [
        `export class SseService {`,
        `  private es: EventSource | null = null;`,
        '',
        `  connect(url = '${endpoint}') {`,
        `    this.es = new EventSource(url, { withCredentials: true });`,
        `    return this.es;`,
        `  }`,
        '',
        `  on(eventType: string, handler: (data: unknown) => void) {`,
        `    this.es?.addEventListener(eventType, (e: MessageEvent) => {`,
        `      try { handler(JSON.parse(e.data as string)); } catch { handler(e.data); }`,
        `    });`,
        `  }`,
        '',
        `  disconnect() { this.es?.close(); }`,
        `}`,
        '',
        `export const sseService = new SseService();`,
    ].join('\n');

    return { strategy: 'sse', filename: 'sse.service.ts', code, summary: `SSE service connecting to ${endpoint} with typed event listeners.` };
}

function buildPollingScaffold(endpoint: string, _framework: UiFramework): RealtimeScaffold {
    const code = [
        `export class PollingService {`,
        `  private timerId: ReturnType<typeof setInterval> | null = null;`,
        '',
        `  start<T>(`,
        `    url = '${endpoint}',`,
        `    intervalMs = 5000,`,
        `    onData: (data: T) => void,`,
        `    onError?: (err: unknown) => void,`,
        `  ) {`,
        `    const poll = async () => {`,
        `      try {`,
        `        const res = await fetch(url, { credentials: 'include' });`,
        `        if (res.ok) onData(await res.json() as T);`,
        `      } catch (e) { onError?.(e); }`,
        `    };`,
        `    void poll();`,
        `    this.timerId = setInterval(() => void poll(), intervalMs);`,
        `  }`,
        '',
        `  stop() { if (this.timerId) clearInterval(this.timerId); }`,
        `}`,
        '',
        `export const pollingService = new PollingService();`,
    ].join('\n');

    return { strategy: 'polling', filename: 'polling.service.ts', code, summary: `Polling service for ${endpoint} with configurable interval and error handling.` };
}

// ---------------------------------------------------------------------------
// generateStateManagementScaffold
// ---------------------------------------------------------------------------

export function generateStateManagementScaffold(
    lib: StateMgmtLib,
    storeNames: string[],
    framework: UiFramework,
): StateScaffold {
    switch (lib) {
        case 'redux-toolkit': return buildReduxToolkitScaffold(storeNames);
        case 'zustand':       return buildZustandScaffold(storeNames);
        case 'pinia':         return buildPiniaScaffold(storeNames);
        case 'context':       return buildReactContextScaffold(storeNames);
        case 'jotai':         return buildJotaiScaffold(storeNames);
        case 'recoil':        return buildRecoilScaffold(storeNames);
    }
}

function buildZustandScaffold(stores: string[]): StateScaffold {
    const files = stores.map((name) => ({
        filename: `${name}.store.ts`,
        code: [
            `import { create } from 'zustand';`,
            '',
            `interface ${cap(name)}State {`,
            `  items: unknown[];`,
            `  loading: boolean;`,
            `  error: string | null;`,
            `  fetch${cap(name)}: () => Promise<void>;`,
            `  set${cap(name)}: (items: unknown[]) => void;`,
            `}`,
            '',
            `export const use${cap(name)}Store = create<${cap(name)}State>((set) => ({`,
            `  items:   [],`,
            `  loading: false,`,
            `  error:   null,`,
            `  fetch${cap(name)}: async () => {`,
            `    set({ loading: true, error: null });`,
            `    try {`,
            `      const res = await fetch('/api/${name.toLowerCase()}');`,
            `      const data = await res.json() as unknown[];`,
            `      set({ items: data, loading: false });`,
            `    } catch (e) {`,
            `      set({ error: String(e), loading: false });`,
            `    }`,
            `  },`,
            `  set${cap(name)}: (items) => set({ items }),`,
            `}));`,
        ].join('\n'),
    }));
    return { lib: 'zustand', framework: 'react', files, summary: `Zustand stores generated for: ${stores.join(', ')}.` };
}

function buildReduxToolkitScaffold(stores: string[]): StateScaffold {
    const slices = stores.map((name) => ({
        filename: `${name}.slice.ts`,
        code: [
            `import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';`,
            '',
            `export const fetch${cap(name)} = createAsyncThunk('${name}/fetch', async () => {`,
            `  const res = await fetch('/api/${name.toLowerCase()}');`,
            `  return res.json();`,
            `});`,
            '',
            `const ${name}Slice = createSlice({`,
            `  name: '${name}',`,
            `  initialState: { items: [] as unknown[], loading: false, error: null as string | null },`,
            `  reducers: {`,
            `    set${cap(name)}: (state, action: PayloadAction<unknown[]>) => { state.items = action.payload; },`,
            `  },`,
            `  extraReducers: (builder) => {`,
            `    builder`,
            `      .addCase(fetch${cap(name)}.pending,   (state) => { state.loading = true; })`,
            `      .addCase(fetch${cap(name)}.fulfilled, (state, action) => { state.loading = false; state.items = action.payload as unknown[]; })`,
            `      .addCase(fetch${cap(name)}.rejected,  (state, action) => { state.loading = false; state.error = action.error.message ?? 'Error'; });`,
            `  },`,
            `});`,
            '',
            `export const { set${cap(name)} } = ${name}Slice.actions;`,
            `export default ${name}Slice.reducer;`,
        ].join('\n'),
    }));
    return { lib: 'redux-toolkit', framework: 'react', files: slices, summary: `Redux Toolkit slices generated for: ${stores.join(', ')}.` };
}

function buildPiniaScaffold(stores: string[]): StateScaffold {
    const files = stores.map((name) => ({
        filename: `${name}.store.ts`,
        code: [
            `import { defineStore } from 'pinia';`,
            `import { ref, computed } from 'vue';`,
            '',
            `export const use${cap(name)}Store = defineStore('${name}', () => {`,
            `  const items   = ref<unknown[]>([]);`,
            `  const loading = ref(false);`,
            `  const error   = ref<string | null>(null);`,
            '',
            `  const count = computed(() => items.value.length);`,
            '',
            `  async function fetch${cap(name)}() {`,
            `    loading.value = true;`,
            `    try {`,
            `      const res  = await fetch('/api/${name.toLowerCase()}');`,
            `      items.value = await res.json() as unknown[];`,
            `    } catch (e) { error.value = String(e); }`,
            `    finally { loading.value = false; }`,
            `  }`,
            '',
            `  return { items, loading, error, count, fetch${cap(name)} };`,
            `});`,
        ].join('\n'),
    }));
    return { lib: 'pinia', framework: 'vue', files, summary: `Pinia stores generated for: ${stores.join(', ')}.` };
}

function buildReactContextScaffold(stores: string[]): StateScaffold {
    const files = stores.map((name) => ({
        filename: `${cap(name)}Context.tsx`,
        code: [
            `import React, { createContext, useContext, useReducer } from 'react';`,
            '',
            `interface ${cap(name)}State { items: unknown[]; loading: boolean; }`,
            `type ${cap(name)}Action = { type: 'SET_ITEMS'; items: unknown[] } | { type: 'SET_LOADING'; loading: boolean };`,
            '',
            `function reducer(state: ${cap(name)}State, action: ${cap(name)}Action): ${cap(name)}State {`,
            `  switch(action.type) {`,
            `    case 'SET_ITEMS':   return { ...state, items: action.items };`,
            `    case 'SET_LOADING': return { ...state, loading: action.loading };`,
            `    default: return state;`,
            `  }`,
            `}`,
            '',
            `const Ctx = createContext<{ state: ${cap(name)}State; dispatch: React.Dispatch<${cap(name)}Action> } | null>(null);`,
            '',
            `export const ${cap(name)}Provider: React.FC<{ children: React.ReactNode }> = ({ children }) => {`,
            `  const [state, dispatch] = useReducer(reducer, { items: [], loading: false });`,
            `  return <Ctx.Provider value={{ state, dispatch }}>{children}</Ctx.Provider>;`,
            `};`,
            '',
            `export const use${cap(name)} = () => { const ctx = useContext(Ctx); if (!ctx) throw new Error('use${cap(name)} outside provider'); return ctx; };`,
        ].join('\n'),
    }));
    return { lib: 'context', framework: 'react', files, summary: `React Context + useReducer stores generated for: ${stores.join(', ')}.` };
}

function buildJotaiScaffold(stores: string[]): StateScaffold {
    const files = stores.map((name) => ({
        filename: `${name}.atoms.ts`,
        code: [
            `import { atom } from 'jotai';`,
            '',
            `export const ${name}ItemsAtom   = atom<unknown[]>([]);`,
            `export const ${name}LoadingAtom  = atom(false);`,
            `export const ${name}ErrorAtom    = atom<string | null>(null);`,
        ].join('\n'),
    }));
    return { lib: 'jotai', framework: 'react', files, summary: `Jotai atoms generated for: ${stores.join(', ')}.` };
}

function buildRecoilScaffold(stores: string[]): StateScaffold {
    const files = stores.map((name) => ({
        filename: `${name}.recoil.ts`,
        code: [
            `import { atom, selector } from 'recoil';`,
            '',
            `export const ${name}State = atom<unknown[]>({ key: '${name}State', default: [] });`,
            `export const ${name}Count = selector({ key: '${name}Count', get: ({ get }) => get(${name}State).length });`,
        ].join('\n'),
    }));
    return { lib: 'recoil', framework: 'react', files, summary: `Recoil atoms and selectors generated for: ${stores.join(', ')}.` };
}

// ---------------------------------------------------------------------------
// generateEnvTemplate
// ---------------------------------------------------------------------------

export function generateEnvTemplate(
    environments: string[],
    variables: EnvVariable[],
): EnvTemplate {
    const makeEnvBlock = (env: string) =>
        variables.map((v) => {
            const val = v.secret ? '' : (v.example ?? `your_${v.key.toLowerCase()}_here`);
            return `${v.key}=${val}  # ${v.description}${v.required ? ' [REQUIRED]' : ' [optional]'}`;
        }).join('\n');

    const envContent     = `# Environment: production\n${makeEnvBlock('production')}`;
    const exampleContent = `# Copy this to .env and fill in values\n${makeEnvBlock('example')}`;

    // Validation code (TypeScript)
    const required = variables.filter((v) => v.required);
    const validationCode = [
        `// env-validator.ts — call at application startup`,
        `export function validateEnv(): void {`,
        `  const missing = (${JSON.stringify(required.map((v) => v.key))})`,
        `    .filter((key) => !process.env[key]);`,
        `  if (missing.length > 0) {`,
        `    throw new Error(\`Missing required environment variables: \${missing.join(', ')}\`);`,
        `  }`,
        `}`,
    ].join('\n');

    return {
        envFilename:     '.env',
        envContent,
        exampleFilename: '.env.example',
        exampleContent,
        validationCode,
        summary: `Env templates for ${environments.join(', ')} with ${variables.length} variables (${required.length} required).`,
    };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function cap(s: string): string {
    return s.charAt(0).toUpperCase() + s.slice(1);
}

function endpointToFnName(e: ApiEndpoint): string {
    const method = e.method.toLowerCase();
    const path   = e.path.replace(/[/:{}]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
    return `${method}_${path}`.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
}
