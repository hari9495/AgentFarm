import type { AzureBlobAuditStorage } from './azure-blob-storage.js';
import { generateScreenshotId, screenshotPath } from '@agentfarm/shared-types';

/**
 * Screenshot uploader for browser audit events.
 * Handles encoding, uploading, and URL generation for before/after screenshots.
 */
export class ScreenshotUploader {
    private readonly storage: AzureBlobAuditStorage;

    constructor(storage: AzureBlobAuditStorage) {
        this.storage = storage;
    }

    /**
     * Generate blob storage path for a screenshot.
     * Path format: screenshots/{tenantId}/{agentId}/{sessionId}/{screenshotId}.png
     */
    private generatePath(
        tenantId: string,
        agentId: string,
        sessionId: string,
        screenshotId: string,
    ): string {
        return screenshotPath(tenantId, agentId, sessionId, screenshotId);
    }

    /**
     * Upload a screenshot (base64 or Buffer) and return signed URL.
     * @param screenshotData Base64 string or Buffer
     * @param tenantId Tenant ID for path generation
     * @param agentId Agent instance ID
     * @param sessionId Browser session ID
    * @param actionId Action ID for this step
     * @param position 'before' or 'after'
     * @returns Signed URL for the uploaded screenshot
     */
    async uploadScreenshot(
        screenshotData: string | Buffer,
        tenantId: string,
        agentId: string,
        sessionId: string,
        actionId: string,
        position: 'before' | 'after',
    ): Promise<string> {
        // Convert base64 to Buffer if needed
        let buffer: Buffer;
        if (typeof screenshotData === 'string') {
            // Assume base64 with data URL prefix or raw base64
            const base64 = screenshotData.replace(/^data:image\/png;base64,/, '');
            buffer = Buffer.from(base64, 'base64');
        } else {
            buffer = screenshotData;
        }

        const screenshotId = generateScreenshotId(actionId, position);
        const path = this.generatePath(tenantId, agentId, sessionId, screenshotId);
        const result = await this.storage.uploadArtifact(path, new Uint8Array(buffer), {
            contentType: 'image/png',
            correlationId: screenshotId,
        });

        return result.url;
    }

    /**
     * Upload both before and after screenshots for an action.
     * Returns an object with both URLs.
     */
    async uploadActionScreenshots(
        beforeData: string | Buffer,
        afterData: string | Buffer,
        tenantId: string,
        agentId: string,
        sessionId: string,
        actionId: string,
    ): Promise<{ beforeId: string; afterId: string; beforeUrl: string; afterUrl: string }> {
        const beforeId = generateScreenshotId(actionId, 'before');
        const afterId = generateScreenshotId(actionId, 'after');
        const [beforeUrl, afterUrl] = await Promise.all([
            this.uploadScreenshot(beforeData, tenantId, agentId, sessionId, actionId, 'before'),
            this.uploadScreenshot(afterData, tenantId, agentId, sessionId, actionId, 'after'),
        ]);

        return { beforeId, afterId, beforeUrl, afterUrl };
    }

    /**
     * Generate signed URL for downloading a screenshot (without uploading).
     * Useful for retrieving existing evidence.
     */
    async getSignedUrl(
        tenantId: string,
        agentId: string,
        sessionId: string,
        actionId: string,
        position: 'before' | 'after',
    ): Promise<string | null> {
        const screenshotId = generateScreenshotId(actionId, position);
        const path = this.generatePath(tenantId, agentId, sessionId, screenshotId);
        try {
            return this.storage.generateSignedUrl(path);
        } catch {
            return null;
        }
    }
}
