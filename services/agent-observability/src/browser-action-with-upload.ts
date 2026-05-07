import type { BrowserActionExecutor, BrowserActionContext } from './browser-agent-wrapper.js';
import type { ScreenshotUploader } from '@agentfarm/audit-storage';
import { generateActionId } from '@agentfarm/shared-types';

/**
 * Integrated wrapper for browser actions with automatic screenshot uploads.
 * Combines BrowserActionExecutor with blob storage for complete auditability.
 */
export interface BrowserActionWithUploadOptions {
    executor: BrowserActionExecutor;
    uploader: ScreenshotUploader;
    context: BrowserActionContext;
    tenantId: string;
}

export type BrowserActionUploadResult = {
    success: boolean;
    actionId: string;
    beforeId?: string;
    afterId?: string;
    beforeUrl?: string;
    afterUrl?: string;
    networkRequests?: Array<{ method: string; url: string }>;
    consoleErrors?: string[];
    errorMessage?: string;
};

export class BrowserActionWithUpload {
    private readonly executor: BrowserActionExecutor;
    private readonly uploader: ScreenshotUploader;
    private readonly context: BrowserActionContext;
    private readonly tenantId: string;
    private actionCounter: number = 0;

    constructor(options: BrowserActionWithUploadOptions) {
        this.executor = options.executor;
        this.uploader = options.uploader;
        this.context = options.context;
        this.tenantId = options.tenantId;
    }

    /**
     * Execute a click action with automatic screenshot capture and upload.
     */
    async click(selector: string): Promise<BrowserActionUploadResult> {
        return this.executeWithUploads('click', () => this.executor.click(selector));
    }

    /**
     * Execute a fill action with automatic screenshot capture and upload.
     */
    async fill(selector: string, value: string): Promise<BrowserActionUploadResult> {
        return this.executeWithUploads('fill', () => this.executor.fill(selector, value));
    }

    /**
     * Execute a navigate action with automatic screenshot capture and upload.
     */
    async navigate(url: string): Promise<BrowserActionUploadResult> {
        return this.executeWithUploads('navigate', () => this.executor.navigate(url));
    }

    private nextActionId(): string {
        const actionId = generateActionId(this.context.sessionId, this.actionCounter);
        this.actionCounter += 1;
        return actionId;
    }

    private async executeWithUploads(
        _actionType: 'click' | 'fill' | 'navigate',
        execute: () => Promise<{ networkRequests: Array<{ method: string; url: string }>; consoleErrors: string[]; videoPath?: string }>,
    ): Promise<BrowserActionUploadResult> {
        const actionId = this.nextActionId();
        const adapter = this.executor.createCaptureAdapter();
        const beforeSnapshot = await adapter.captureBefore();

        try {
            const executionResult = await execute();
            const afterSnapshot = await adapter.captureAfter();

            const uploadResult = await this.uploader.uploadActionScreenshots(
                beforeSnapshot.screenshot,
                afterSnapshot.screenshot,
                this.tenantId,
                this.context.agentId,
                this.context.sessionId,
                actionId,
            );

            return {
                success: true,
                actionId,
                beforeId: uploadResult.beforeId,
                afterId: uploadResult.afterId,
                beforeUrl: uploadResult.beforeUrl,
                afterUrl: uploadResult.afterUrl,
                networkRequests: executionResult.networkRequests,
                consoleErrors: executionResult.consoleErrors,
            };
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            return {
                success: false,
                actionId,
                errorMessage: message,
            };
        }
    }
}
