import {
    ActionInterceptor,
    type ActionRequest,
    type ActionCategory,
} from './action-interceptor.js';

export interface BrowserActionContext {
    agentId: string;
    workspaceId: string;
    taskId: string;
    sessionId: string;
}

export interface BrowserActionResult {
    networkRequests: Array<{ method: string; url: string }>;
    consoleErrors: string[];
    videoPath?: string;
}

export interface BrowserPageLike {
    click(selector: string): Promise<void>;
    fill(selector: string, value: string): Promise<void>;
    goto(url: string): Promise<void>;
    selectOption(selector: string, value: string): Promise<void>;
    screenshot(options?: { type?: 'png'; fullPage?: boolean }): Promise<Buffer>;
    accessibility: {
        snapshot(): Promise<unknown>;
    };
    on(event: 'request' | 'console', listener: (payload: unknown) => void): void;
    off(event: 'request' | 'console', listener: (payload: unknown) => void): void;
}

const toBase64Png = (value: Buffer): string => `data:image/png;base64,${value.toString('base64')}`;

const stableJson = (value: unknown): string => JSON.stringify(value, null, 2);

const normalizeNetworkPayload = (payload: unknown): { method: string; url: string } | null => {
    if (typeof payload !== 'object' || payload === null) {
        return null;
    }
    const candidate = payload as { method?: unknown; url?: unknown };
    if (typeof candidate.method === 'string' && typeof candidate.url === 'string') {
        return { method: candidate.method, url: candidate.url };
    }
    return null;
};

const normalizeConsoleError = (payload: unknown): string | null => {
    if (typeof payload === 'string') {
        return payload;
    }
    if (typeof payload === 'object' && payload !== null) {
        const candidate = payload as { type?: unknown; text?: unknown };
        if (candidate.type === 'error' && typeof candidate.text === 'string') {
            return candidate.text;
        }
    }
    return null;
};

export class BrowserActionExecutor {
    private readonly page: BrowserPageLike;
    private readonly interceptor: ActionInterceptor;
    private readonly context: BrowserActionContext;
    private readonly sessionVideoPath?: string;

    constructor(options: {
        page: BrowserPageLike;
        interceptor: ActionInterceptor;
        context: BrowserActionContext;
        sessionVideoPath?: string;
    }) {
        this.page = options.page;
        this.interceptor = options.interceptor;
        this.context = options.context;
        this.sessionVideoPath = options.sessionVideoPath;
    }

    private buildAction(type: ActionCategory, action: string, target: string, payload: unknown): ActionRequest {
        return {
            agentId: this.context.agentId,
            workspaceId: this.context.workspaceId,
            taskId: this.context.taskId,
            sessionId: this.context.sessionId,
            type,
            action,
            target,
            payload,
        };
    }

    private async captureSnapshot(): Promise<{ screenshot: string; domSnapshot: string }> {
        const image = await this.page.screenshot({ type: 'png', fullPage: true });
        const domTree = await this.page.accessibility.snapshot();
        return {
            screenshot: toBase64Png(image),
            domSnapshot: stableJson(domTree),
        };
    }

    async click(selector: string): Promise<BrowserActionResult> {
        return this.executeBrowserAction('click', selector, { selector }, () => this.page.click(selector));
    }

    async fill(selector: string, value: string): Promise<BrowserActionResult> {
        return this.executeBrowserAction('fill', selector, { selector, value }, () => this.page.fill(selector, value));
    }

    async navigate(url: string): Promise<BrowserActionResult> {
        return this.executeBrowserAction('navigate', url, { url }, () => this.page.goto(url));
    }

    async select(selector: string, value: string): Promise<BrowserActionResult> {
        return this.executeBrowserAction('select', selector, { selector, value }, () => this.page.selectOption(selector, value));
    }

    private async executeBrowserAction(
        action: string,
        target: string,
        payload: unknown,
        run: () => Promise<void>,
    ): Promise<BrowserActionResult> {
        const networkRequests: Array<{ method: string; url: string }> = [];
        const consoleErrors: string[] = [];

        const onRequest = (event: unknown): void => {
            const request = normalizeNetworkPayload(event);
            if (request) {
                networkRequests.push(request);
            }
        };

        const onConsole = (event: unknown): void => {
            const error = normalizeConsoleError(event);
            if (error) {
                consoleErrors.push(error);
            }
        };

        this.page.on('request', onRequest);
        this.page.on('console', onConsole);

        try {
            await this.interceptor.execute(
                this.buildAction('browser', action, target, payload),
                async () => {
                    await run();
                },
            );

            return {
                networkRequests,
                consoleErrors,
                videoPath: this.sessionVideoPath,
            };
        } finally {
            this.page.off('request', onRequest);
            this.page.off('console', onConsole);
        }
    }

    createCaptureAdapter() {
        return {
            captureBefore: async () => this.captureSnapshot(),
            captureAfter: async () => this.captureSnapshot(),
        };
    }
}
